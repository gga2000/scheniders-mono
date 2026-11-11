import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServerClientWithToken: vi.fn(() => ({ rpc })),
}));

import { callerHasPermission } from "./caller-has-permission";
import { createSupabaseServerClientWithToken } from "@/lib/supabase-server";

const TENANT = "22222222-2222-4222-8222-222222222222";
const req = () => new Request("http://x", { headers: { authorization: "Bearer tok" } });
const member = { tenantId: TENANT, platformAdmin: false };

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("callerHasPermission", () => {
    it("asks the database as the caller, for the caller's store", async () => {
        rpc.mockResolvedValue({ data: true, error: null });
        expect(await callerHasPermission(req(), member, "orders.edit", "t")).toEqual({ ok: true });
        expect(createSupabaseServerClientWithToken).toHaveBeenCalledWith("tok");
        expect(rpc).toHaveBeenCalledWith("has_tenant_permission", { p_tenant_id: TENANT, p_permission: "orders.edit" });
    });

    it("refuses with 403 when the permission is off, whatever the role", async () => {
        rpc.mockResolvedValue({ data: false, error: null });
        const r = await callerHasPermission(req(), member, "orders.edit", "t");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.response.status).toBe(403);
    });

    it("refuses with 503 when the check itself fails, never letting the call through", async () => {
        rpc.mockResolvedValue({ data: null, error: { message: "down" } });
        const r = await callerHasPermission(req(), member, "orders.edit", "t");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.response.status).toBe(503);
    });

    it("lets a platform admin through without asking", async () => {
        expect(await callerHasPermission(req(), { tenantId: TENANT, platformAdmin: true }, "orders.edit", "t")).toEqual({ ok: true });
        expect(rpc).not.toHaveBeenCalled();
    });
});
