import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeServiceClient, type FakeCall, type FakeResult } from "@/lib/testing/fake-service-client";

const TENANT = "11111111-1111-4111-8111-111111111111";

function respond(call: FakeCall): FakeResult {
    if (call.table === "user_profiles" && call.op === "select") return { data: { role: "super_admin" } };
    if (call.table === "access_requests" && call.op === "select") {
        return { data: { id: "req-1", user_id: "user-1", email: "hire@example.com", name: "Hire", status: "pending" } };
    }
    return {};
}

let fake = fakeServiceClient(respond);

vi.mock("@/lib/supabase-server", () => ({
    verifyAccessToken: async () => ({ user: { id: "super-1" }, error: null }),
    createSupabaseServiceClient: () => fake.client,
}));

import { POST } from "./route";

function approve(role: string | undefined) {
    return new Request("http://localhost/api/admin/access-requests", {
        method: "POST",
        headers: { Authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify({ requestId: "req-1", tenantId: TENANT, ...(role ? { role } : {}) }),
    });
}

beforeEach(() => {
    fake = fakeServiceClient(respond);
});

describe("POST /api/admin/access-requests — membership role", () => {
    it.each([
        ["employee", "employee", "employee"],
        ["viewer", "viewer", "viewer"],
        ["admin", "admin", "admin"],
        [undefined, "employee", "employee"],
    ])("approving as %s → profile %s, tenant_members %s", async (role, profileRole, memberRole) => {
        const res = await POST(approve(role));
        expect(res.status).toBe(200);
        const member = fake.calls.find((c) => c.table === "tenant_members" && c.op === "upsert")?.payload;
        const profile = fake.calls.find((c) => c.table === "user_profiles" && c.op === "upsert")?.payload;
        expect(member).toMatchObject({ tenant_id: TENANT, user_id: "user-1", role: memberRole });
        expect(profile).toMatchObject({ role: profileRole });
    });
});

describe("POST /api/admin/access-requests — team seats (Fermi A2)", () => {
    it("a store with no free seat answers 402 and leaves the request pending", async () => {
        fake = fakeServiceClient((call) =>
            call.table === "tenant_members" && call.op === "upsert"
                ? { error: { message: "team is full", code: "PT402", hint: "TEAM_LIMIT" } }
                : respond(call),
        );
        const res = await POST(approve("employee"));
        expect(res.status).toBe(402);
        expect(await res.json()).toMatchObject({ code: "team_limit" });
        expect(fake.calls.some((c) => c.table === "access_requests" && c.op === "update")).toBe(false);
    });
});
