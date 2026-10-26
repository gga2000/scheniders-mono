import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeServiceClient, type FakeCall, type FakeResult } from "@/lib/testing/fake-service-client";

const TENANT = "11111111-1111-4111-8111-111111111111";
const CALLER = "aaaaaaaa-0000-4000-8000-000000000001";

let respond: (call: FakeCall) => FakeResult;
let fake = fakeServiceClient((call) => respond(call));

vi.mock("@/lib/supabase-server", () => ({
    verifyAccessToken: async () => ({ user: { id: CALLER }, error: null }),
    createSupabaseServiceClient: () => fake.client,
}));

vi.mock("@/lib/restrictions", () => ({
    assertNotBlocked: async () => undefined,
    blockedResponseBody: () => ({}),
    TenantBlockedError: class TenantBlockedError extends Error {},
}));

import { POST } from "./route";

/** The caller is an active admin of TENANT; every write succeeds unless overridden. */
function defaultRespond(call: FakeCall): FakeResult {
    if (call.table === "tenant_members" && call.op === "select") return { data: { role: "admin" } };
    if (call.table === "user_profiles" && call.op === "select") return { data: { is_active: true } };
    return {};
}

function request(body: Record<string, unknown>) {
    return new Request("http://localhost/api/auth/create-user", {
        method: "POST",
        headers: { Authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ email: "new@example.com", password: "pw-123456", tenantId: TENANT, ...body }),
    });
}

function membershipInsert() {
    return fake.calls.find((c) => c.table === "tenant_members" && c.op === "insert")?.payload as
        | { role: string; tenant_id: string; user_id: string }
        | undefined;
}

function profileUpdate() {
    return fake.calls.find((c) => c.table === "user_profiles" && c.op === "update")?.payload as
        | { role: string }
        | undefined;
}

beforeEach(() => {
    respond = defaultRespond;
    fake = fakeServiceClient((call) => respond(call));
});

describe("POST /api/auth/create-user — caller (F-087)", () => {
    it("refuses an admin whose profile is deactivated, and creates nothing", async () => {
        respond = (call) =>
            call.table === "user_profiles" && call.op === "select"
                ? { data: { is_active: false } }
                : defaultRespond(call);
        const res = await POST(request({ role: "employee" }));
        expect(res.status).toBe(403);
        expect(membershipInsert()).toBeUndefined();
    });
});

describe("POST /api/auth/create-user — membership role", () => {
    it.each([
        ["employee", "employee", "employee"],
        ["viewer", "viewer", "viewer"],
        ["admin", "admin", "admin"],
    ])("role %s → profile %s, tenant_members %s", async (role, profileRole, memberRole) => {
        const res = await POST(request({ role }));
        expect(res.status).toBe(200);
        expect(profileUpdate()?.role).toBe(profileRole);
        expect(membershipInsert()).toMatchObject({ role: memberRole, tenant_id: TENANT, user_id: "new-user-id" });
    });

    it("defaults to an employee profile with an employee membership", async () => {
        const res = await POST(request({}));
        expect(res.status).toBe(200);
        expect(profileUpdate()?.role).toBe("employee");
        expect(membershipInsert()?.role).toBe("employee");
    });

    it("never writes a role outside admin/employee/viewer to tenant_members", async () => {
        for (const role of ["employee", "viewer", "admin", undefined]) {
            fake = fakeServiceClient((call) => respond(call));
            await POST(request(role === undefined ? {} : { role }));
            expect(["admin", "employee", "viewer"]).toContain(membershipInsert()?.role);
        }
    });

    it("reports a failed membership insert instead of answering success", async () => {
        respond = (call) =>
            call.table === "tenant_members" && call.op === "insert"
                ? { error: { message: "violates check constraint tenant_members_role_check", code: "23514" } }
                : defaultRespond(call);
        const res = await POST(request({ role: "employee" }));
        const body = (await res.json()) as { success?: boolean; userId?: string };
        expect(res.status).not.toBe(200);
        expect(body.success).not.toBe(true);
        expect(body.userId).toBe("new-user-id");
    });

    it("still refuses a role outside the allowlist", async () => {
        const res = await POST(request({ role: "super_admin" }));
        expect(res.status).toBe(400);
        expect(membershipInsert()).toBeUndefined();
    });

    it("refuses a caller who is not the tenant's admin", async () => {
        respond = (call) =>
            call.table === "tenant_members" && call.op === "select" ? { data: { role: "employee" } } : defaultRespond(call);
        const res = await POST(request({ role: "employee" }));
        expect(res.status).toBe(403);
        expect(membershipInsert()).toBeUndefined();
    });
});
