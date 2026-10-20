import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    recorded,
    respond,
    resetRecording,
    hasEq,
    isHeadCount,
    queriesOn,
    type RecordedQuery,
    type QueryResult,
} from "@/lib/__fixtures__/recording-supabase";
import { buildRiskData, normalizePhoneLikeDb, type TrustRow } from "@/lib/customer-trust-risk";
import type { Order } from "@/types/order";
import type { OrderListPreview } from "@/lib/orders/list-preview";

/*
 * The wide-window list read (All Orders, or any window over a week): a small
 * head first — the newest rows with the exact count, every pinned row and the
 * trust book's count — so the page can paint before the book arrives; then
 * every order page and every trust page at once. It must deliver exactly the
 * rows and risk_data the old count-then-pages-then-trust read did.
 */

vi.mock("@/lib/supabase", async () =>
    (await import("@/lib/__fixtures__/recording-supabase")).recordingSupabaseModule());

import { orderRepository } from "./order-repository";

const TENANT = "11111111-1111-4111-8111-111111111111";

function orderRow(i: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: `o${String(100000 - i).padStart(6, "0")}`,
        tenant_id: TENANT,
        order_id: `LF-${i}`,
        // 3 phones in 10 repeat, so customers have several orders.
        phone: `0770${String(1000000 + (i % 7 === 0 ? 1 : i)).padStart(7, "0")}`,
        status: "new",
        items: [],
        created_at: new Date(Date.parse("2026-10-18T10:00:00.000Z") - i * 60_000).toISOString(),
        is_pinned: false,
        ...extra,
    };
}

function trustRow(phone: string, score: number): TrustRow {
    return { tenant_id: TENANT, phone, trust_score: score, trust_tier: score < 40 ? "risky" : "trusted" } as unknown as TrustRow;
}

const op = (q: RecordedQuery, name: string) => q.ops.find((o) => o.op === name);
const isPage = (q: RecordedQuery) => q.target === "orders" && op(q, "range") !== undefined;
const isTop = (q: RecordedQuery) =>
    q.target === "orders" && op(q, "limit") !== undefined && !hasEq(q, "is_pinned", true) && !isHeadCount(q);
const isPinned = (q: RecordedQuery) => q.target === "orders" && hasEq(q, "is_pinned", true);
const isTrustPage = (q: RecordedQuery) => q.target === "customer_trust" && op(q, "range") !== undefined;
const isTrustChunk = (q: RecordedQuery) => q.target === "customer_trust" && op(q, "in") !== undefined;

interface Book {
    rows: Record<string, unknown>[];
    trust: TrustRow[];
}

/** Answers every query of the read from `book`, as PostgREST would (filters ignored, ranges honoured). */
function serve(book: Book, q: RecordedQuery): QueryResult {
    if (q.target === "customer_trust") {
        if (isHeadCount(q)) return { data: null, error: null, count: book.trust.length };
        const range = op(q, "range");
        if (range) {
            const [from, to] = range.args as [number, number];
            return { data: book.trust.slice(from, to + 1), error: null };
        }
        const phones = (op(q, "in")?.args[1] ?? []) as string[];
        return { data: book.trust.filter((t) => phones.includes(t.phone as string)), error: null };
    }
    if (isHeadCount(q)) return { data: null, error: null, count: book.rows.length };
    if (isPinned(q)) {
        const limit = op(q, "limit")?.args[0] as number;
        return { data: book.rows.filter((r) => r.is_pinned === true).slice(0, limit), error: null };
    }
    const range = op(q, "range");
    if (range) {
        const [from, to] = range.args as [number, number];
        return { data: book.rows.slice(from, to + 1), error: null };
    }
    const limit = op(q, "limit")?.args[0] as number;
    return { data: book.rows.slice(0, limit), error: null, count: book.rows.length };
}

function makeBook(n: number, pinnedAt: number[] = []): Book {
    const rows = Array.from({ length: n }, (_, i) => orderRow(i, pinnedAt.includes(i) ? { is_pinned: true } : {}));
    const phones = [...new Set(rows.map((r) => r.phone as string))];
    // Trust rows (stored normalized, as the table keys them) for every other
    // customer; the rest have none (risk_data from no row).
    const trust = phones.filter((_, i) => i % 2 === 0).map((p, i) => trustRow(normalizePhoneLikeDb(p), (i * 37) % 100));
    return { rows, trust };
}

function deferred() {
    let resolve: () => void = () => {};
    const promise = new Promise<void>((r) => { resolve = r; });
    return { promise, resolve };
}

const WIDE = {
    fromInstant: Date.parse("2026-09-01T00:00:00.000Z") - 3 * 3_600_000,
    toInstant: Date.parse("2026-10-18T21:00:00.000Z") - 1,
    fromDay: "2026-09-01",
    toDay: "2026-10-18",
};
const NARROW = {
    fromInstant: Date.parse("2026-10-17T21:00:00.000Z"),
    toInstant: Date.parse("2026-10-18T20:59:59.999Z"),
    fromDay: "2026-10-18",
    toDay: "2026-10-18",
};

beforeEach(() => resetRecording());

describe("wide list read: head first, then everything at once", () => {
    it("plans ceil(total / 1000) order pages from the head's exact count", async () => {
        const book = makeBook(2_500);
        respond((q) => serve(book, q));
        const rows = await orderRepository.findAll(TENANT, { onPreview: () => {} });
        expect(rows).toHaveLength(2_500);
        expect(recorded.filter(isPage)).toHaveLength(3);
        // The head replaced the standalone count HEAD on orders.
        expect(queriesOn("orders").filter(isHeadCount)).toEqual([]);
        const top = recorded.find(isTop);
        expect(op(top as RecordedQuery, "select")?.args[1]).toEqual({ count: "exact" });
    });

    it("publishes the head before any page: pinned rows first, then the newest without them, each once", async () => {
        const book = makeBook(1_200, [3, 700]);
        respond((q) => serve(book, q));
        const previews: OrderListPreview[] = [];
        let pagesAtFirstPreview = -1;
        await orderRepository.findAll(TENANT, {
            onPreview: (p) => {
                if (previews.length === 0) pagesAtFirstPreview = recorded.filter(isPage).length;
                previews.push(p);
            },
        });
        expect(pagesAtFirstPreview).toBe(0);
        const first = previews[0];
        expect(first.withRisk).toBe(false);
        expect(first.total).toBe(1_200);
        const ids = first.rows.map((r) => r.id);
        expect(ids.slice(0, 2)).toEqual([book.rows[3].id, book.rows[700].id]);
        expect(ids.slice(2)).toEqual(book.rows.slice(0, 50).filter((_, i) => i !== 3).map((r) => r.id));
        expect(new Set(ids).size).toBe(ids.length);
        expect(first.newestCutoff).toBe(book.rows[49].created_at);
    });

    it("re-publishes the head with risk_data from one phone chunk, the same risk the full read attaches", async () => {
        const book = makeBook(1_200);
        respond((q) => serve(book, q));
        const previews: OrderListPreview[] = [];
        const rows = await orderRepository.findAll(TENANT, { onPreview: (p) => previews.push(p) });
        expect(previews.map((p) => p.withRisk)).toEqual([false, true]);
        expect(recorded.filter(isTrustChunk)).toHaveLength(1);
        const byId = new Map(rows.map((r) => [r.id, r]));
        for (const row of previews[1].rows) {
            expect(row.risk_data).toEqual(byId.get(row.id)?.risk_data);
        }
    });

    it("starts no page until the head has settled", async () => {
        const book = makeBook(1_500);
        const gate = deferred();
        respond(async (q) => {
            if (isTop(q)) await gate.promise;
            return serve(book, q);
        });
        const read = orderRepository.findAll(TENANT, { onPreview: () => {} });
        await new Promise((r) => setTimeout(r, 10));
        expect(recorded.filter(isPage)).toEqual([]);
        expect(recorded.filter(isTrustPage)).toEqual([]);
        gate.resolve();
        await read;
        expect(recorded.filter(isPage)).toHaveLength(2);
    });

    it("reads the trust book alongside the order pages, not after them", async () => {
        const book = makeBook(1_500);
        const pagesHeld = deferred();
        respond(async (q) => {
            if (isPage(q)) await pagesHeld.promise;
            return serve(book, q);
        });
        const read = orderRepository.findAll(TENANT, { onPreview: () => {} });
        await new Promise((r) => setTimeout(r, 10));
        expect(recorded.filter(isPage)).toHaveLength(2);
        expect(recorded.filter(isTrustPage).length).toBeGreaterThan(0);
        pagesHeld.resolve();
        await read;
    });

    it("returns exactly what the old count → pages → trust read returns for the same rows", async () => {
        const book = makeBook(1_700, [5]);
        respond((q) => serve(book, q));
        const wide = await orderRepository.findAll(TENANT, { onPreview: () => {} });
        // The narrow-window path is the old read, unchanged; the fixture ignores filters.
        const old = await orderRepository.findWindow(TENANT, NARROW);
        expect(wide).toEqual(old);
        // And risk_data is the trust join: a customer with a row gets its risk, one without gets the default.
        const trustByPhone = new Map(book.trust.map((t) => [t.phone as string, t]));
        for (const row of wide) expect(row.risk_data).toEqual(buildRiskData(trustByPhone.get(normalizePhoneLikeDb(row.phone))));
    });

    it("the same read without onPreview: a count HEAD, then pages and trust together, the same rows", async () => {
        const book = makeBook(1_300);
        respond((q) => serve(book, q));
        const rows = await orderRepository.findWindow(TENANT, WIDE);
        expect(rows).toHaveLength(1_300);
        expect(recorded.filter(isTop)).toEqual([]);
        expect(recorded.filter(isPinned)).toEqual([]);
        expect(queriesOn("orders").filter(isHeadCount)).toHaveLength(1);
    });

    it("a wide window publishes a head too, filtered to the window", async () => {
        const book = makeBook(1_300);
        respond((q) => serve(book, q));
        const onPreview = vi.fn();
        await orderRepository.findWindow(TENANT, WIDE, { onPreview });
        expect(onPreview).toHaveBeenCalled();
        for (const q of [recorded.find(isTop), recorded.find(isPinned)]) {
            expect(op(q as RecordedQuery, "or")).toBeDefined();
        }
    });

    it("a narrow window never previews: it is the old read", async () => {
        const book = makeBook(300);
        respond((q) => serve(book, q));
        const onPreview = vi.fn();
        await orderRepository.findWindow(TENANT, NARROW, { onPreview });
        expect(onPreview).not.toHaveBeenCalled();
        expect(recorded.filter(isTop)).toEqual([]);
    });

    it("no preview when the pinned read hits its cap: the head may be missing pinned rows", async () => {
        const book = makeBook(1_200, Array.from({ length: 100 }, (_, i) => 100 + i));
        respond((q) => serve(book, q));
        const onPreview = vi.fn();
        const rows = await orderRepository.findAll(TENANT, { onPreview });
        expect(onPreview).not.toHaveBeenCalled();
        expect(rows).toHaveLength(1_200);
    });

    it("an empty window publishes nothing and returns no rows", async () => {
        respond((q) => serve({ rows: [], trust: [] }, q));
        const onPreview = vi.fn();
        await expect(orderRepository.findAll(TENANT, { onPreview })).resolves.toEqual([]);
        expect(onPreview).not.toHaveBeenCalled();
        expect(recorded.filter(isPage)).toEqual([]);
    });

    it("a head error rejects the read, as a count error did — never an empty list", async () => {
        const book = makeBook(1_200);
        const failure = { code: "57014", message: "canceling statement due to statement timeout" };
        respond((q) => (isTop(q) ? { data: null, error: failure } : serve(book, q)));
        const onPreview = vi.fn();
        await expect(orderRepository.findAll(TENANT, { onPreview })).rejects.toEqual(failure);
        expect(onPreview).not.toHaveBeenCalled();
        expect(recorded.filter(isPage)).toEqual([]);
    });

    it("a page error rejects the read", async () => {
        const book = makeBook(1_200);
        const failure = { code: "500", message: "boom" };
        respond((q) => (isPage(q) && (op(q, "range")?.args[0] === 1000) ? { data: null, error: failure } : serve(book, q)));
        await expect(orderRepository.findAll(TENANT, { onPreview: () => {} })).rejects.toEqual(failure);
    });

    it("a trust error rejects the read, as it always has", async () => {
        const book = makeBook(1_200);
        const failure = { code: "500", message: "trust down" };
        respond((q) => (isTrustPage(q) ? { data: null, error: failure } : serve(book, q)));
        await expect(orderRepository.findAll(TENANT, { onPreview: () => {} })).rejects.toEqual(failure);
    });

    it("every query of the read carries the tenant", async () => {
        const book = makeBook(1_200, [2]);
        respond((q) => serve(book, q));
        await orderRepository.findAll(TENANT, { onPreview: () => {} });
        await orderRepository.findWindow(TENANT, WIDE, { onPreview: () => {} });
        const unscoped = recorded.filter((q) => !hasEq(q, "tenant_id", TENANT));
        expect(unscoped.map((q) => `${q.target}: ${JSON.stringify(q.ops)}`)).toEqual([]);
        // Both head reads keep the list's own filters.
        for (const q of recorded.filter((r) => isTop(r) || isPinned(r))) {
            expect(q.ops.some((o) => o.op === "is" && o.args[0] === "deleted_at" && o.args[1] === null)).toBe(true);
            expect(hasEq(q, "is_archived", false)).toBe(true);
            expect(q.ops.filter((o) => o.op === "order").map((o) => o.args)).toEqual([
                ["created_at", { ascending: false }],
                ["id", { ascending: false }],
            ]);
        }
    });
});

describe("rows the wide read returns are typed Orders, normalized", () => {
    it("keeps every row once, in page order", async () => {
        const book = makeBook(2_001);
        respond((q) => serve(book, q));
        const rows: Order[] = await orderRepository.findAll(TENANT);
        expect(rows.map((r) => r.id)).toEqual(book.rows.map((r) => r.id));
    });
});
