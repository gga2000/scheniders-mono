import { describe, expect, it, vi } from "vitest";
import { fakeServiceClient, type FakeCall, type FakeResult } from "@/lib/testing/fake-service-client";

const TENANT = "11111111-1111-4111-8111-111111111111";

let respond: (call: FakeCall) => FakeResult;
let fake = fakeServiceClient((call) => respond(call));

vi.mock("@/lib/supabase-server", () => ({
    verifyAccessToken: async () => ({ user: { id: "caller" }, error: null }),
    createSupabaseServiceClient: () => fake.client,
}));
vi.mock("@/lib/restrictions", () => ({
    assertNotBlocked: async () => undefined,
    blockedResponseBody: () => ({}),
    TenantBlockedError: class TenantBlockedError extends Error {},
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
    return new Request("http://localhost/api/team/invite", {
        method: "POST",
        headers: { Authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ email: "back@example.com", tenantId: TENANT, ...body }),
    });
}

describe("POST /api/team/invite — removed members", () => {
    it("brings a removed (suspended) member back instead of refusing", async () => {
        // First tenant_members select is the caller's admin check; give it admin/active,
        // then the invited email's row as suspended.
        let membershipReads = 0;
        respond = (call) => {
            if (call.table === "user_profiles" && call.op === "select") return { data: { id: "existing-user", is_active: true } };
            if (call.table === "tenant_members" && call.op === "select") {
                membershipReads += 1;
                return { data: membershipReads === 1 ? { role: "admin" } : { status: "suspended" } };
            }
            return {};
        };
        fake = fakeServiceClient((call) => respond(call));
        const res = await POST(request({ role: "employee" }));
        const body = (await res.json()) as { success?: boolean; reactivated?: boolean };
        expect(res.status).toBe(200);
        expect(body.reactivated).toBe(true);
        const update = fake.calls.find((c) => c.table === "tenant_members" && c.op === "update");
        expect(update?.payload).toEqual({ status: "active", role: "employee" });
        expect(fake.calls.some((c) => c.table === "team_invites" && c.op === "insert")).toBe(false);
    });

    it("still refuses an email that is already an active member", async () => {
        let membershipReads = 0;
        respond = (call) => {
            if (call.table === "user_profiles" && call.op === "select") return { data: { id: "existing-user", is_active: true } };
            if (call.table === "tenant_members" && call.op === "select") {
                membershipReads += 1;
                return { data: membershipReads === 1 ? { role: "admin" } : { status: "active" } };
            }
            return {};
        };
        fake = fakeServiceClient((call) => respond(call));
        const res = await POST(request({}));
        expect(res.status).toBe(409);
    });
});
