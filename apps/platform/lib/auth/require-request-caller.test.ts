import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActiveTenant } from "@/lib/auth/resolve-active-tenant";

const state = vi.hoisted(() => ({ active: null as ActiveTenant | null }));

vi.mock("@/lib/supabase-server", () => ({
    verifyAccessToken: async (token: string) =>
        token === "good" ? { user: { id: "u1", email: "u@test" }, error: null } : { user: null, error: new Error("bad") },
}));
vi.mock("@/lib/auth/resolve-active-tenant", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/auth/resolve-active-tenant")>()),
    resolveActiveTenant: async () => state.active,
}));
vi.mock("@/lib/billing/lock-refusal", () => ({ billingLockRefusal: async () => null }));

import { requireRequestCaller } from "./require-request-caller";

const request = (method: string) =>
    new Request("http://x/api/anything", { method, headers: { Authorization: "Bearer good" } });

const viewer: ActiveTenant = { ok: true, tenantId: "t1", role: "viewer", platformAdmin: false, readOnly: true };
const member: ActiveTenant = { ok: true, tenantId: "t1", role: "admin", platformAdmin: false, readOnly: false };

beforeEach(() => {
    state.active = member;
});

describe("requireRequestCaller and the look-only support view", () => {
    it.each(["GET", "HEAD"])("lets a look-only view read (%s)", async (method) => {
        state.active = viewer;
        expect(await requireRequestCaller(request(method), "member")).toMatchObject({ ok: true, readOnly: true, role: "viewer" });
    });

    it.each(["POST", "PUT", "PATCH", "DELETE"])("refuses a look-only view anything but a read (%s)", async (method) => {
        state.active = viewer;
        const caller = await requireRequestCaller(request(method), "member");
        expect(caller.ok).toBe(false);
        if (caller.ok) return;
        expect(caller.response.status).toBe(403);
        expect(await caller.response.json()).toEqual({ success: false, error: "support_view_read_only" });
    });

    it("lets a member write as before", async () => {
        expect(await requireRequestCaller(request("POST"), "member")).toMatchObject({ ok: true, readOnly: false });
    });

    it("keeps admin-only routes closed to a look-only view", async () => {
        state.active = viewer;
        const caller = await requireRequestCaller(request("GET"), "tenant-admin");
        expect(caller.ok).toBe(false);
    });
});
