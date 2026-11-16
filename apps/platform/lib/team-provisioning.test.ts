import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeServiceClient, type FakeCall, type FakeResult } from "@/lib/testing/fake-service-client";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

let profile: { id: string } | null = null;
let invites: { id: string; tenant_id: string; display_name: string | null }[] = [];
let accept: (args: { _invite_id: string }) => FakeResult = () => ({ data: { success: true } });
let fake = fakeServiceClient((call) => respond(call));

function respond(call: FakeCall): FakeResult {
    if (call.table === "user_profiles" && call.op === "select") return { data: profile };
    if (call.table === "team_invites" && call.op === "select") return { data: invites };
    return {};
}

function freshFake() {
    fake = fakeServiceClient((call) => respond(call), {
        rpc: (name, args) => (name === "accept_team_invite" ? accept(args as { _invite_id: string }) : {}),
    });
}

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => fake.client,
}));

import { provisionInvitedUserIfNeeded } from "./team-provisioning";

beforeEach(() => {
    profile = null;
    invites = [{ id: "invite-1", tenant_id: TENANT, display_name: "New Hire" }];
    accept = () => ({ data: { success: true, tenant_id: TENANT } });
    freshFake();
});

describe("provisionInvitedUserIfNeeded — a new person", () => {
    it("takes the invite in one database call, with the owner's name for them", async () => {
        const result = await provisionInvitedUserIfNeeded({
            id: "user-1",
            email: "Hire@Example.com",
            name: "Google Name",
            emailConfirmed: true,
        });
        expect(result).toEqual({ provisioned: true, reason: "ok" });
        expect(fake.rpcCalls).toEqual([
            {
                name: "accept_team_invite",
                args: { _invite_id: "invite-1", _user_id: "user-1", _email: "hire@example.com", _display_name: "New Hire" },
            },
        ]);
        // The profile and membership are written inside accept_team_invite, never here.
        expect(fake.calls.some((c) => c.op !== "select")).toBe(false);
    });

    it("uses their account name when the owner typed none", async () => {
        invites = [{ id: "invite-1", tenant_id: TENANT, display_name: null }];
        await provisionInvitedUserIfNeeded({ id: "user-1", email: "hire@example.com", name: "Google Name", emailConfirmed: true });
        expect(fake.rpcCalls[0]?.args).toMatchObject({ _display_name: "Google Name" });
    });

    it("reads only pending invites that have not expired, oldest first", async () => {
        await provisionInvitedUserIfNeeded({ id: "user-1", email: "hire@example.com", emailConfirmed: true });
        const read = fake.calls.find((c) => c.table === "team_invites");
        expect(read?.filters).toEqual(
            expect.arrayContaining([
                { method: "eq", args: ["email", "hire@example.com"] },
                { method: "eq", args: ["status", "pending"] },
                { method: "gt", args: ["expires_at", expect.any(String)] },
                { method: "order", args: ["created_at", { ascending: true }] },
            ]),
        );
    });

    it("queues someone with no invite for staff review", async () => {
        invites = [];
        const result = await provisionInvitedUserIfNeeded({ id: "user-1", email: "stranger@example.com", emailConfirmed: true });
        expect(result).toEqual({ provisioned: false, reason: "no-invite-logged" });
        expect(fake.calls.find((c) => c.table === "access_requests")?.op).toBe("upsert");
        expect(fake.rpcCalls).toHaveLength(0);
    });

    it("reports a refused invite (store full) as not provisioned", async () => {
        accept = () => ({ error: { message: "team is full", code: "PT402", hint: "TEAM_LIMIT" } });
        freshFake();
        const result = await provisionInvitedUserIfNeeded({ id: "user-1", email: "hire@example.com", emailConfirmed: true });
        expect(result).toEqual({ provisioned: false, reason: "accept-failed" });
    });
});

describe("provisionInvitedUserIfNeeded — someone who already has an account", () => {
    beforeEach(() => {
        profile = { id: "user-1" };
        invites = [
            { id: "invite-6", tenant_id: TENANT, display_name: null },
            { id: "invite-7", tenant_id: OTHER, display_name: null },
        ];
    });

    it("takes every invite, so both stores join their store switcher", async () => {
        const result = await provisionInvitedUserIfNeeded({ id: "user-1", email: "owner@example.com", emailConfirmed: true });
        expect(result).toEqual({ provisioned: true, reason: "accepted-existing" });
        expect(fake.rpcCalls.map((c) => (c.args as { _invite_id: string })._invite_id)).toEqual(["invite-6", "invite-7"]);
    });

    it("one store refusing does not stop the next", async () => {
        accept = (args) =>
            args._invite_id === "invite-6"
                ? { data: { success: false, error: "revoked" } }
                : { data: { success: true, tenant_id: OTHER } };
        freshFake();
        const result = await provisionInvitedUserIfNeeded({ id: "user-1", email: "owner@example.com", emailConfirmed: true });
        expect(result).toEqual({ provisioned: true, reason: "accepted-existing" });
        expect(fake.rpcCalls).toHaveLength(2);
    });

    it("with no invite, changes nothing and queues nothing", async () => {
        invites = [];
        const result = await provisionInvitedUserIfNeeded({ id: "user-1", email: "owner@example.com", emailConfirmed: true });
        expect(result).toEqual({ provisioned: false, reason: "already-provisioned" });
        expect(fake.calls.some((c) => c.table === "access_requests")).toBe(false);
    });
});

describe("provisionInvitedUserIfNeeded — unproven email", () => {
    it("never accepts an invite for an address the user has not confirmed", async () => {
        const result = await provisionInvitedUserIfNeeded({ id: "user-1", email: "hire@example.com", emailConfirmed: false });
        expect(result.provisioned).toBe(false);
        expect(fake.rpcCalls).toHaveLength(0);
        expect(fake.calls.some((c) => c.table === "team_invites")).toBe(false);
    });
});
