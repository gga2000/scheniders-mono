import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * activity_logs INSERT policy: tenant_id must be one of the caller's tenants.
 * The logger sent tenant_id NULL whenever the caller had none (the sign-in event
 * fires before the profile, and so the tenant, has loaded), so the database
 * rejected every one of those writes. There is no user.login row in the table at all.
 */

const insert = vi.fn();
const getSession = vi.fn();

vi.mock("@/lib/supabase", () => ({
    supabase: {
        auth: { getSession: (...a: unknown[]) => getSession(...a) },
        from: () => ({ insert: (...a: unknown[]) => insert(...a) }),
    },
}));

import { activityLogger } from "./activity-logger";

describe("activityLogger.log", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
        getSession.mockResolvedValue({ data: { session: { user: { id: "u1", email: "a@b.co" } } } });
        insert.mockResolvedValue({ error: null });
    });

    it("writes the tenant id when it has one", async () => {
        const res = await activityLogger.log({ action: "order.edit" }, "t1");
        expect(res.success).toBe(true);
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1", tenant_id: "t1" }));
    });

    it.each([undefined, null, ""])("does not send a write the policy must reject (tenant %j)", async (tenant) => {
        const res = await activityLogger.log({ action: "user.login" }, tenant);
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/tenant/i);
        expect(insert).not.toHaveBeenCalled();
    });
});
