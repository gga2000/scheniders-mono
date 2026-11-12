import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: vi.fn(() => ({ rpc })) }));

import { memberHasPermission } from "./member-has-permission";

const member = { userId: "u1", tenantId: "t1", role: "employee" };

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("memberHasPermission", () => {
    it("asks the database rule for that member, store and permission", async () => {
        rpc.mockResolvedValue({ data: true, error: null });
        expect(await memberHasPermission(member, "orders.create")).toBe(true);
        expect(rpc).toHaveBeenCalledWith("member_has_permission", { p_tenant_id: "t1", p_user_id: "u1", p_permission: "orders.create" });
    });

    it("refuses when the store switched the permission off", async () => {
        rpc.mockResolvedValue({ data: false, error: null });
        expect(await memberHasPermission(member, "orders.create")).toBe(false);
    });

    it("refuses when the check fails (fail closed)", async () => {
        rpc.mockResolvedValue({ data: null, error: { message: "down" } });
        expect(await memberHasPermission(member, "orders.create")).toBe(false);
    });

    it("lets platform staff through without asking", async () => {
        expect(await memberHasPermission({ ...member, role: "super_admin" }, "orders.create")).toBe(true);
        expect(rpc).not.toHaveBeenCalled();
    });
});
