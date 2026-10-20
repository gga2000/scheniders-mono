import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeServiceClient, type FakeCall, type FakeResult } from "@/lib/testing/fake-service-client";

const TENANT = "11111111-1111-4111-8111-111111111111";
let inviteRole = "employee";
let fake = fakeServiceClient((call) => respond(call));

function respond(call: FakeCall): FakeResult {
    if (call.table === "user_profiles" && call.op === "select") return { data: null };
    if (call.table === "team_invites" && call.op === "select") {
        return {
            data: {
                id: "invite-1",
                tenant_id: TENANT,
                role: inviteRole,
                display_name: "New Hire",
                invited_by: "admin-1",
                created_at: "2026-10-20T10:00:00.000Z",
            },
        };
    }
    return {};
}

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => fake.client,
}));

import { provisionInvitedUserIfNeeded } from "./team-provisioning";

beforeEach(() => {
    fake = fakeServiceClient((call) => respond(call));
});

describe("provisionInvitedUserIfNeeded — membership role", () => {
    it.each([
        ["employee", "member"],
        ["viewer", "member"],
        ["admin", "admin"],
    ])("an invite as %s creates a '%s' membership and keeps the profile role", async (role, memberRole) => {
        inviteRole = role;
        const result = await provisionInvitedUserIfNeeded({ id: "user-1", email: "hire@example.com" });
        expect(result.provisioned).toBe(true);
        const member = fake.calls.find((c) => c.table === "tenant_members" && c.op === "insert")?.payload;
        const profile = fake.calls.find((c) => c.table === "user_profiles" && c.op === "insert")?.payload;
        expect(member).toMatchObject({ tenant_id: TENANT, user_id: "user-1", role: memberRole });
        expect(profile).toMatchObject({ role });
    });
});
