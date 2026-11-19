import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(() => Promise.resolve({ data: [], error: null }));
const update = vi.fn();
let row: { status: string; restrictions: Record<string, unknown> } | null = null;

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({
        rpc,
        from: () => ({
            update,
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
        }),
    }),
}));

import { getActiveRestrictions } from "./restrictions";

describe("an expired staff pause", () => {
    beforeEach(() => {
        rpc.mockClear();
        update.mockClear();
    });

    it("is lifted by lift_pause_and_settle, which gives back the status from before the pause and settles the lock", async () => {
        row = { status: "limited", restrictions: { paused_until: "2026-11-01T00:00:00Z", status_before: "trial", blocks: { new_orders: true } } };
        expect(await getActiveRestrictions("t1")).toBeNull();
        expect(rpc).toHaveBeenCalledWith("lift_pause_and_settle", { _tenant_id: "t1" });
        // Never the old direct write: restrictions is NOT NULL and a trial must not come back 'active'.
        expect(update).not.toHaveBeenCalled();
    });

    it("is left alone while it runs", async () => {
        row = { status: "limited", restrictions: { paused_until: "2999-01-01T00:00:00Z", blocks: { new_orders: true } } };
        expect(await getActiveRestrictions("t1")).toMatchObject({ blocks: { new_orders: true } });
        expect(rpc).not.toHaveBeenCalled();
    });
});
