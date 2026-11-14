import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordingSupabase, respond, resetRecording, queriesOn } from "@/lib/__fixtures__/recording-supabase";

const H = vi.hoisted(() => ({
    afterTasks: [] as Array<() => Promise<void>>,
    alert: vi.fn(async () => {}),
}));

vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => { H.afterTasks.push(fn); } }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => recordingSupabase }));
vi.mock("@/lib/tenant", () => ({ canCreateOrder: async () => ({ allowed: true }) }));
vi.mock("@/lib/restrictions", () => ({
    assertNotBlocked: async () => {},
    TenantBlockedError: class extends Error {},
}));
vi.mock("@/lib/order-items-tenant", () => ({
    findForeignCatalogRefs: async () => [],
    hasNegativeQuantity: () => false,
}));
vi.mock("@/lib/staff-alerts", () => ({ sendNewOrderAlertToStaff: H.alert }));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: vi.fn() }));

import { createOrderForTenant } from "./order-service";

const TENANT = "44444444-4444-4444-8444-444444444444";
const input = { customer_name: "A", phone: "07700000000", items: [], idempotency_key: "k1" } as unknown as Parameters<typeof createOrderForTenant>[0];

async function runAfter() {
    for (const task of H.afterTasks.splice(0)) await task();
}

describe("createOrderForTenant follow-up work", () => {
    beforeEach(() => {
        resetRecording();
        H.afterTasks.length = 0;
        H.alert.mockClear();
    });

    it("counts usage and alerts staff once for a new order", async () => {
        respond((q) => (q.target === "create_order_atomic" ? { data: { id: "o1" }, error: null } : { data: null, error: null }));
        const res = await createOrderForTenant(input, TENANT);
        await runAfter();
        expect(res.success).toBe(true);
        expect(queriesOn("increment_usage_tracking")).toHaveLength(1);
        expect(H.alert).toHaveBeenCalledTimes(1);
    });

    it("does neither again when the database replays the first order (audit R3-3)", async () => {
        respond((q) => (q.target === "create_order_atomic"
            ? { data: { id: "o1", idempotent_replay: true }, error: null }
            : { data: null, error: null }));
        const res = await createOrderForTenant(input, TENANT);
        await runAfter();
        expect(res.success).toBe(true);
        expect(queriesOn("increment_usage_tracking")).toHaveLength(0);
        expect(H.alert).not.toHaveBeenCalled();
    });
});
