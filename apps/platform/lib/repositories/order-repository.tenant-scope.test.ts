import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    recorded,
    respond,
    resetRecording,
    hasEq,
    isHeadCount,
    queriesOn,
    type RecordedQuery,
} from "@/lib/__fixtures__/recording-supabase";

/*
 * Every order-book read that is not keyed by the globally unique row id must
 * carry the active tenant. RLS limits rows to the tenants a user belongs to,
 * but returns their UNION: without the filter a user in two tenants gets both
 * books in one list, and a per-tenant number (sequence_number) can resolve to
 * the other tenant's order.
 */

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());

import { orderRepository } from "./order-repository";

const TENANT = "11111111-1111-4111-8111-111111111111";

const orderRow = (id: string) => ({
    id,
    tenant_id: TENANT,
    phone: "07701234567",
    status: "new",
    items: [],
    created_at: "2026-10-18T10:00:00.000Z",
});

/** Every `orders` / `v_orders_with_risk` / `customer_trust` query made so far. */
function scopedReads(): RecordedQuery[] {
    return recorded.filter((q) =>
        q.kind === "from" && ["orders", "v_orders_with_risk", "customer_trust"].includes(q.target));
}

function expectAllTenantScoped() {
    const reads = scopedReads();
    expect(reads.length).toBeGreaterThan(0);
    const unscoped = reads.filter((q) => !hasEq(q, "tenant_id", TENANT));
    expect(unscoped.map((q) => `${q.target}: ${JSON.stringify(q.ops)}`)).toEqual([]);
}

beforeEach(() => {
    resetRecording();
    // One row for every page read, one for the count.
    respond((q) => {
        if (isHeadCount(q)) return { data: null, error: null, count: 1 };
        if (q.target === "customer_trust") return { data: [], error: null };
        return { data: [orderRow("o1")], error: null };
    });
});

const WINDOW = {
    fromInstant: Date.parse("2026-10-17T21:00:00.000Z"),
    toInstant: Date.parse("2026-10-18T20:59:59.999Z"),
    fromDay: "2026-10-18",
    toDay: "2026-10-18",
};

describe("orderRepository list reads are scoped to the active tenant", () => {
    it("findAll: the count, every page and the trust lookup", async () => {
        await orderRepository.findAll(TENANT);
        expect(queriesOn("orders").length).toBe(2);
        expect(queriesOn("customer_trust").length).toBe(1);
        expectAllTenantScoped();
    });

    it("findAll and findWindow page in a total order: created_at desc, then id desc", async () => {
        // Parallel pages over created_at alone repeat or skip rows wherever a
        // run of equal timestamps straddles a 1,000-row boundary.
        await orderRepository.findAll(TENANT);
        await orderRepository.findWindow(TENANT, WINDOW);
        const pages = queriesOn("orders").filter((q) => q.ops.some((o) => o.op === "range"));
        expect(pages.length).toBe(2);
        for (const page of pages) {
            expect(page.ops.filter((o) => o.op === "order").map((o) => o.args)).toEqual([
                ["created_at", { ascending: false }],
                ["id", { ascending: false }],
            ]);
        }
    });

    it("findWindow: windowed count and pages", async () => {
        const rows = await orderRepository.findWindow(TENANT, WINDOW);
        expect(rows.map((r) => r.id)).toEqual(["o1"]);
        expectAllTenantScoped();
    });

    it("findWindow(null) falls back to findAll with the same tenant", async () => {
        await orderRepository.findWindow(TENANT, null);
        expect(queriesOn("orders").length).toBe(2);
        expectAllTenantScoped();
    });

    it("findChangedSince: the delta sync", async () => {
        await orderRepository.findChangedSince(TENANT, "2026-10-18T09:00:00.000Z");
        expectAllTenantScoped();
    });

    it("findLatestUpdatedAt: the sync high-water mark", async () => {
        respond(() => ({ data: { updated_at: "2026-10-18T10:00:00.000Z" }, error: null }));
        await expect(orderRepository.findLatestUpdatedAt(TENANT)).resolves.toBe("2026-10-18T10:00:00.000Z");
        const [q] = queriesOn("orders");
        expect(q.ops.filter((o) => o.op === "order").map((o) => o.args)).toEqual([["updated_at", { ascending: false }]]);
        expect(q.ops.some((o) => o.op === "limit" && o.args[0] === 1)).toBe(true);
        expectAllTenantScoped();
    });

    it("findArchived: every archived page", async () => {
        await orderRepository.findArchived(TENANT);
        expect(queriesOn("orders").some((q) => hasEq(q, "is_archived", true))).toBe(true);
        expectAllTenantScoped();
    });

    it("findForExport and countForExport", async () => {
        await orderRepository.findForExport(TENANT, { dateFrom: "2026-10-01", dateTo: "2026-10-18" });
        await orderRepository.countForExport(TENANT, {});
        expectAllTenantScoped();
    });

    it("the trust lookup over the whole book is tenant-scoped too", async () => {
        // > 200 distinct phones switches withRiskData to the paged full-book read.
        const many = Array.from({ length: 201 }, (_, i) => ({
            ...orderRow(`o${i}`),
            phone: `0770${String(1000000 + i)}`,
        }));
        respond((q) => {
            if (isHeadCount(q)) return { data: null, error: null, count: q.target === "orders" ? many.length : 1 };
            if (q.target === "customer_trust") return { data: [], error: null };
            return { data: many, error: null };
        });
        await orderRepository.findChangedSince(TENANT, "2026-10-18T09:00:00.000Z");
        expect(queriesOn("customer_trust").length).toBeGreaterThanOrEqual(2);
        expectAllTenantScoped();
    });
});

describe("orderRepository.search", () => {
    it("passes the tenant to search_orders_v2", async () => {
        await orderRepository.search(TENANT, "07701234567");
        const [rpc] = queriesOn("search_orders_v2");
        expect(rpc.kind).toBe("rpc");
        expect(rpc.rpcArgs).toMatchObject({ p_tenant_id: TENANT, p_term: "07701234567" });
        expectAllTenantScoped();
    });

    it("keeps the tenant on the direct-select fallback when the RPC is not deployed", async () => {
        respond((q) => {
            if (q.kind === "rpc") return { data: null, error: { code: "PGRST202", message: "not found" } };
            if (q.target === "customer_trust") return { data: [], error: null };
            return { data: [orderRow("o1")], error: null };
        });
        const rows = await orderRepository.search(TENANT, "07701234567");
        expect(rows.map((r) => r.id)).toContain("o1");
        // exact + partial direct selects, both scoped
        expect(queriesOn("orders").length).toBe(2);
        expectAllTenantScoped();

        // The missing RPC is remembered: the next search goes straight to the
        // direct path, still scoped.
        resetRecording();
        respond(() => ({ data: [], error: null }));
        await orderRepository.search(TENANT, "07709999999");
        expect(queriesOn("search_orders_v2")).toEqual([]);
        expectAllTenantScoped();
    });
});

describe("orderRepository.findByScanRef", () => {
    it("scopes the order_id, sequence_number and carrier QR lookups", async () => {
        respond(() => ({ data: null, error: null }));
        const found = await orderRepository.findByScanRef(TENANT, "3879");
        expect(found).toBeNull();
        const lookups = queriesOn("v_orders_with_risk");
        expect(lookups.map((q) => q.ops.find((o) => o.op === "eq" && o.args[0] !== "tenant_id")?.args[0]))
            .toEqual(["order_id", "sequence_number", "waseet_qr_id"]);
        expectAllTenantScoped();
    });
});
