import { describe, it, expect, vi, beforeEach } from "vitest";

// The manual queue drain imports Lightfunnels checkouts into the platform's
// LIGHTFUNNELS_TENANT_ID with the service role, so only an active platform
// admin may trigger it — not any signed-in merchant user.

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
    userId: "",
    profiles: [] as Row[],
    tablesRead: [] as string[],
}));

vi.mock("@/lib/env", () => ({ env: { LIGHTFUNNELS_TENANT_ID: "lf-tenant" } }));
vi.mock("@/lib/lightfunnels-api", () => ({
    fetchCheckoutById: vi.fn(),
    getSavedAccessToken: vi.fn(),
}));
vi.mock("@/lib/webhook-handler", () => ({
    parseCheckoutToWebhook: vi.fn(),
    createOrderFromWebhook: vi.fn(),
}));

vi.mock("@/lib/supabase-server", () => ({
    verifyAccessToken: async () => ({ user: { id: state.userId }, error: null }),
    createSupabaseServiceClient: () => ({
        from(table: string) {
            state.tablesRead.push(table);
            const filters: [string, unknown][] = [];
            const rows = () =>
                (table === "user_profiles" ? state.profiles : []).filter((r) =>
                    filters.every(([c, v]) => r[c] === v),
                );
            const chain = {
                select: () => chain,
                eq: (c: string, v: unknown) => {
                    filters.push([c, v]);
                    return chain;
                },
                is: () => chain,
                lt: () => chain,
                order: () => chain,
                limit: () => chain,
                maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
                then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
                    Promise.resolve({ data: rows(), error: null }).then(resolve),
            };
            return chain;
        },
    }),
}));

import { GET } from "./route";

function call() {
    return GET(
        new Request("http://x/api/cron/process-checkouts-manual", {
            headers: { Authorization: "Bearer t" },
        }),
    );
}

beforeEach(() => {
    state.tablesRead = [];
    state.profiles = [
        { id: "merchant-admin", role: "admin", is_active: true },
        { id: "platform", role: "super_admin", is_active: true },
        { id: "platform-deactivated", role: "super_admin", is_active: false },
    ];
});

describe("GET /api/cron/process-checkouts-manual", () => {
    it("refuses a signed-in merchant admin and never touches the queue", async () => {
        state.userId = "merchant-admin";
        const res = await call();
        expect(res.status).toBe(403);
        expect(state.tablesRead).not.toContain("checkout_queue");
    });

    it("refuses a deactivated platform admin", async () => {
        state.userId = "platform-deactivated";
        const res = await call();
        expect(res.status).toBe(403);
        expect(state.tablesRead).not.toContain("checkout_queue");
    });

    it("refuses a request without a token", async () => {
        const res = await GET(new Request("http://x/api/cron/process-checkouts-manual"));
        expect(res.status).toBe(401);
    });

    it("lets a platform admin drain the queue", async () => {
        state.userId = "platform";
        const res = await call();
        expect(res.status).toBe(200);
        expect(state.tablesRead).toContain("checkout_queue");
        expect(await res.json()).toMatchObject({ success: true, processed: 0 });
    });
});
