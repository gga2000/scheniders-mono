import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readBoot } from "./read";
import { BootPayloadSchema, BootRequestSchema } from "./schema";
import { dashboardMetricsKey } from "@/lib/analytics/dashboard-metrics-read";
import { ordersAggregatesKey, ordersAggregatesParams } from "@/lib/orders/aggregates-read";
import { financeSummaryKey } from "@/lib/finance/summary-read";
import { openingSummaryDays } from "@/lib/finance/period";
import { livePayloadShape } from "@/lib/analytics/__fixtures__/dashboard-metrics";
import { financeSummaryFixture } from "@/lib/finance/__fixtures__/finance-summary";

/**
 * The first-load read answers with who the user is in the shop their profile
 * has open, and the page's first figures under the exact keys the page's hooks
 * read, all read as the user. Nothing in the request can name another shop.
 */

const USER = "u-1";
const SHOP = "t-own";

type Row = Record<string, unknown>;
interface Fake {
    profile: Row | null;
    profileError?: { code: string; message: string };
    memberRole: string | null;
    rpcFails?: Set<string>;
    calls: Array<{ kind: "from" | "rpc"; name: string; args: Record<string, unknown> }>;
}

function fakeClient(f: Fake): SupabaseClient {
    function from(table: string) {
        const filters: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {};
        for (const op of ["select", "is", "gt", "order", "limit"]) chain[op] = () => chain;
        chain.eq = (column: string, value: unknown) => {
            filters[column] = value;
            return chain;
        };
        const answer = () => {
            f.calls.push({ kind: "from", name: table, args: { ...filters } });
            if (table === "user_profiles") return { data: f.profile, error: f.profile ? null : f.profileError ?? { code: "PGRST116", message: "no rows" } };
            if (table === "tenant_members") return { data: f.memberRole ? { role: f.memberRole } : null, error: null };
            if (table === "role_permissions") return { data: [{ role: "admin", permission: "orders.view" }, { role: "viewer", permission: "orders.read" }], error: null };
            if (table === "user_permissions") return { data: [{ permission: "extra.perm", is_granted: true }], error: null };
            return { data: null, error: null };
        };
        chain.single = () => Promise.resolve(answer());
        chain.maybeSingle = () => Promise.resolve(answer());
        chain.then = (resolve: (r: unknown) => unknown) => Promise.resolve(answer()).then(resolve);
        return chain;
    }
    function rpc(name: string, args: Record<string, unknown>) {
        f.calls.push({ kind: "rpc", name, args });
        if (f.rpcFails?.has(name)) return Promise.resolve({ data: null, error: { message: `${name} refused` } });
        if (name === "get_dashboard_metrics") return Promise.resolve({ data: livePayloadShape(), error: null });
        if (name === "get_orders_aggregates") return Promise.resolve({ data: { status_counts: { new: 3 }, stats: {}, cities: [], products: [], total_risk_count: 0 }, error: null });
        if (name === "get_finance_summary") return Promise.resolve({ data: financeSummaryFixture({ from: String(args._from), to: String(args._to) }), error: null });
        return Promise.resolve({ data: null, error: { message: "unknown rpc" } });
    }
    return { from, rpc } as unknown as SupabaseClient;
}

const profileRow = { id: USER, email: "a@b.c", display_name: "A", role: "employee", avatar_url: null, current_tenant_id: SHOP };
const request = (q: Record<string, string>) => BootRequestSchema.parse(q);
const now = () => 1_000;

describe("first-load read", () => {
    it("reads the user's shop from their own profile, never from the request", async () => {
        const f: Fake = { profile: profileRow, memberRole: "admin", calls: [] };
        const payload = await readBoot(fakeClient(f), { userId: USER, supportViewer: false }, request({ path: "/dashboard", tenant_id: "t-other", tenantId: "t-other" }), now);

        expect(payload.session).toMatchObject({ userId: USER, tenantId: SHOP, role: "admin" });
        expect(payload.session?.permissions).toEqual(["orders.view", "extra.perm"]);
        const tenantsRead = f.calls.flatMap((c) => [c.args.tenant_id, c.args.p_tenant_id, c.args._tenant_id]).filter(Boolean);
        expect(new Set(tenantsRead)).toEqual(new Set([SHOP]));
        // What the server sends, the browser accepts.
        expect(BootPayloadSchema.safeParse(JSON.parse(JSON.stringify(payload))).success).toBe(true);
    });

    it("puts the dashboard's first figures under the keys its hooks read", async () => {
        const f: Fake = { profile: profileRow, memberRole: "employee", calls: [] };
        const payload = await readBoot(fakeClient(f), { userId: USER, supportViewer: false }, request({ path: "/dashboard", range: "30d" }), now);
        const keys = payload.queries?.queries.map((q) => JSON.stringify(q.queryKey));
        expect(keys).toEqual(expect.arrayContaining([
            JSON.stringify(dashboardMetricsKey("all", SHOP)),
            JSON.stringify(dashboardMetricsKey("30d", SHOP)),
            JSON.stringify(ordersAggregatesKey(ordersAggregatesParams(SHOP, {}))),
        ]));
        expect(keys).toHaveLength(3);
    });

    it("opens the dashboard on 7 days when the link names no period", async () => {
        const f: Fake = { profile: profileRow, memberRole: "employee", calls: [] };
        const payload = await readBoot(fakeClient(f), { userId: USER, supportViewer: false }, request({ path: "/dashboard", range: "90d" }), now);
        const keys = payload.queries?.queries.map((q) => JSON.stringify(q.queryKey));
        expect(keys).toContain(JSON.stringify(dashboardMetricsKey("7d", SHOP)));
    });

    it("reads Finances for the period this browser keeps, and its comparison", async () => {
        const f: Fake = { profile: profileRow, memberRole: "admin", calls: [] };
        const stored = { preset: "last7", compareMode: "yoy" } as const;
        const payload = await readBoot(fakeClient(f), { userId: USER, supportViewer: false }, request({ path: "/finances", financePeriod: JSON.stringify(stored) }), now);
        const { current, compare } = openingSummaryDays(stored, "last30");
        const keys = payload.queries?.queries.map((q) => JSON.stringify(q.queryKey));
        expect(keys).toEqual([JSON.stringify(financeSummaryKey(SHOP, current)), JSON.stringify(financeSummaryKey(SHOP, compare))]);
    });

    it("opens Finances on the last 30 days when the kept choice is not one", async () => {
        const f: Fake = { profile: profileRow, memberRole: "admin", calls: [] };
        const payload = await readBoot(fakeClient(f), { userId: USER, supportViewer: false }, request({ path: "/finances", financePeriod: "{not json" }), now);
        const { current } = openingSummaryDays(null, "last30");
        expect(payload.queries?.queries[0].queryKey).toEqual([...financeSummaryKey(SHOP, current)]);
    });

    it("leaves out a read the database refuses, so the page asks for it itself", async () => {
        const f: Fake = { profile: profileRow, memberRole: "viewer", rpcFails: new Set(["get_finance_summary"]), calls: [] };
        const payload = await readBoot(fakeClient(f), { userId: USER, supportViewer: false }, request({ path: "/finances" }), now);
        expect(payload.session?.role).toBe("viewer");
        expect(payload.queries?.queries).toEqual([]);
    });

    it("reads no figures for a page that has none to start from", async () => {
        const f: Fake = { profile: profileRow, memberRole: "admin", calls: [] };
        const payload = await readBoot(fakeClient(f), { userId: USER, supportViewer: false }, request({ path: "/orders" }), now);
        expect(payload.queries).toBeNull();
        expect(f.calls.filter((c) => c.kind === "rpc")).toEqual([]);
    });

    it("answers an unprovisioned sign-in with no profile", async () => {
        const f: Fake = { profile: null, memberRole: null, calls: [] };
        const payload = await readBoot(fakeClient(f), { userId: USER, supportViewer: false }, request({ path: "/dashboard" }), now);
        expect(payload.session).toEqual({ userId: USER, profile: null, tenantId: null, role: null, permissions: [], supportView: null });
        expect(payload.queries).toBeNull();
    });

    it("fails, rather than calling the user unprovisioned, when the profile read fails", async () => {
        const f: Fake = { profile: null, profileError: { code: "57014", message: "timeout" }, memberRole: null, calls: [] };
        await expect(readBoot(fakeClient(f), { userId: USER, supportViewer: false }, request({ path: "/dashboard" }), now)).rejects.toThrow("profile read failed");
    });
});
