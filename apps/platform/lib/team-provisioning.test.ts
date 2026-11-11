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
        ["employee", "employee"],
        ["viewer", "viewer"],
        ["admin", "admin"],
    ])("an invite as %s creates a '%s' membership and keeps the profile role", async (role, memberRole) => {
        inviteRole = role;
        const result = await provisionInvitedUserIfNeeded({ id: "user-1", email: "hire@example.com", emailConfirmed: true });
        expect(result.provisioned).toBe(true);
        const member = fake.calls.find((c) => c.table === "tenant_members" && c.op === "insert")?.payload;
        const profile = fake.calls.find((c) => c.table === "user_profiles" && c.op === "insert")?.payload;
        expect(member).toMatchObject({ tenant_id: TENANT, user_id: "user-1", role: memberRole });
        expect(profile).toMatchObject({ role });
    });
});

describe("provisionInvitedUserIfNeeded — someone who already has an account", () => {
    const OTHER = "22222222-2222-4222-8222-222222222222";
    let memberInsertError: { message: string; code?: string } | null = null;

    beforeEach(() => {
        memberInsertError = null;
        fake = fakeServiceClient((call) => {
            if (call.table === "user_profiles" && call.op === "select") return { data: { id: "user-1" } };
            if (call.table === "team_invites" && call.op === "select") {
                return { data: [{ id: "invite-7", tenant_id: OTHER, role: "employee", invited_by: "admin-2", created_at: "2026-11-11T10:00:00.000Z" }] };
            }
            if (call.table === "tenant_members" && call.op === "insert") return { error: memberInsertError };
            return {};
        });
    });

    it("joins the invited store, accepts the invite and lands them there", async () => {
        const result = await provisionInvitedUserIfNeeded({ id: "user-1", email: "Owner@Example.com", emailConfirmed: true });
        expect(result).toEqual({ provisioned: true, reason: "accepted-existing" });
        expect(fake.calls.find((c) => c.table === "tenant_members" && c.op === "insert")?.payload)
            .toMatchObject({ tenant_id: OTHER, user_id: "user-1", role: "employee", status: "active" });
        expect(fake.calls.find((c) => c.table === "team_invites" && c.op === "update")?.payload)
            .toMatchObject({ status: "accepted", accepted_user_id: "user-1" });
        expect(fake.calls.find((c) => c.table === "user_profiles" && c.op === "update")?.payload)
            .toEqual({ current_tenant_id: OTHER });
        expect(fake.calls.some((c) => c.table === "user_profiles" && c.op === "insert")).toBe(false);
    });

    it("treats an existing membership as accepted without touching its role", async () => {
        memberInsertError = { message: "duplicate", code: "23505" };
        const result = await provisionInvitedUserIfNeeded({ id: "user-1", email: "owner@example.com", emailConfirmed: true });
        expect(result.provisioned).toBe(true);
        expect(fake.calls.some((c) => c.table === "tenant_members" && (c.op === "update" || c.op === "upsert"))).toBe(false);
    });
});

describe("provisionInvitedUserIfNeeded — unproven email", () => {
    it("never accepts an invite for an address the user has not confirmed", async () => {
        inviteRole = "admin";
        fake = fakeServiceClient((call) => respond(call));
        const result = await provisionInvitedUserIfNeeded({ id: "user-1", email: "hire@example.com", emailConfirmed: false });
        expect(result.provisioned).toBe(false);
        expect(fake.calls.some((c) => c.table === "tenant_members" && c.op === "insert")).toBe(false);
        expect(fake.calls.some((c) => c.table === "team_invites")).toBe(false);
    });
});
