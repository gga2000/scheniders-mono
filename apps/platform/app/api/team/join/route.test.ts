import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeServiceClient, type FakeCall, type FakeResult } from "@/lib/testing/fake-service-client";
import { hashInviteToken, newInviteToken } from "@/lib/team-invites";

const TENANT = "11111111-1111-4111-8111-111111111111";
const { token } = newInviteToken();

type Invite = { id: string; tenant_id: string; role: string; display_name: string | null; status: string; expires_at: string };
let invite: Invite | null;
let accept: () => FakeResult;
let caller: { id: string; email: string; user_metadata: Record<string, string> } | null;
let fake = fakeServiceClient((call) => respond(call));

function respond(call: FakeCall): FakeResult {
    if (call.table === "team_invites" && call.op === "select") {
        const byHash = call.filters.find((f) => f.method === "eq" && f.args[0] === "token_hash")?.args[1];
        return { data: byHash === hashInviteToken(token) ? invite : null };
    }
    if (call.table === "tenants") return { data: { business_name: "متجر سارة" } };
    return {};
}

vi.mock("@/lib/supabase-server", () => ({
    verifyAccessToken: async () => (caller ? { user: caller, error: null } : { user: null, error: "bad token" }),
    createSupabaseServiceClient: () => fake.client,
}));

import { GET, POST } from "./route";

beforeEach(() => {
    invite = {
        id: "invite-5",
        tenant_id: TENANT,
        role: "employee",
        display_name: null,
        status: "pending",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    };
    accept = () => ({ data: { success: true, tenant_id: TENANT, already_member: false } });
    caller = { id: "user-1", email: "sara@example.com", user_metadata: { full_name: "Sara" } };
    fake = fakeServiceClient((call) => respond(call), { rpc: () => accept() });
});

const preview = (value: string) => GET(new Request(`http://localhost/api/team/join?token=${encodeURIComponent(value)}`));
const join = (value: string, auth = true) =>
    POST(
        new Request("http://localhost/api/team/join", {
            method: "POST",
            headers: { "content-type": "application/json", ...(auth ? { Authorization: "Bearer t" } : {}) },
            body: JSON.stringify({ token: value }),
        }),
    );

describe("GET /api/team/join — preview", () => {
    it("names the store and the role, and nothing about the person", async () => {
        const res = await preview(token);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, storeName: "متجر سارة", role: "employee" });
    });

    it.each([
        ["an unknown link", () => token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), "not_found", 404],
        ["a malformed link", () => "short", "not_found", 404],
    ])("%s is not found", async (_label, value, reason, status) => {
        const res = await preview(value());
        expect(res.status).toBe(status);
        expect(await res.json()).toMatchObject({ reason });
    });

    it.each([
        ["expired", { expires_at: new Date(Date.now() - 1000).toISOString() }, "انتهت صلاحية الرابط"],
        ["revoked", { status: "revoked" }, "ألغى هذه الدعوة"],
        ["used", { status: "accepted" }, "مستخدم من قبل"],
    ])("a %s link says so in Arabic", async (reason, change, words) => {
        invite = { ...(invite as Invite), ...change };
        const res = await preview(token);
        expect(res.status).toBe(410);
        const body = (await res.json()) as { reason: string; error: string };
        expect(body.reason).toBe(reason);
        expect(body.error).toContain(words);
    });
});

describe("POST /api/team/join — accept", () => {
    it("needs a signed-in person", async () => {
        expect((await join(token, false)).status).toBe(401);
        caller = null;
        expect((await join(token)).status).toBe(401);
        expect(fake.rpcCalls).toHaveLength(0);
    });

    it("accepts in one database call and answers the staff access request", async () => {
        const res = await join(token);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, tenantId: TENANT });
        expect(fake.rpcCalls).toEqual([
            {
                name: "accept_team_invite",
                args: { _invite_id: "invite-5", _user_id: "user-1", _email: "sara@example.com", _display_name: "Sara" },
            },
        ]);
        const answered = fake.calls.find((c) => c.table === "access_requests");
        expect(answered?.op).toBe("update");
        expect(answered?.payload).toMatchObject({ status: "approved" });
        expect(answered?.filters).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
        expect(answered?.filters).toContainEqual({ method: "eq", args: ["status", "pending"] });
    });

    it("the owner's typed name wins over the account name", async () => {
        invite = { ...(invite as Invite), display_name: "سارة المبيعات" };
        await join(token);
        expect(fake.rpcCalls[0]?.args).toMatchObject({ _display_name: "سارة المبيعات" });
    });

    it("an expired or revoked link is refused before the database is asked to accept", async () => {
        invite = { ...(invite as Invite), expires_at: new Date(Date.now() - 1000).toISOString() };
        expect((await join(token)).status).toBe(410);
        invite = { ...(invite as Invite), expires_at: new Date(Date.now() + 1000).toISOString(), status: "revoked" };
        expect((await join(token)).status).toBe(410);
        expect(fake.rpcCalls).toHaveLength(0);
    });

    it("a used link is checked by the database: the same person gets in again", async () => {
        invite = { ...(invite as Invite), status: "accepted" };
        accept = () => ({ data: { success: true, tenant_id: TENANT, already_member: true } });
        fake = fakeServiceClient((call) => respond(call), { rpc: () => accept() });
        expect((await join(token)).status).toBe(200);
    });

    it("a used link is refused for anyone else", async () => {
        invite = { ...(invite as Invite), status: "accepted" };
        accept = () => ({ data: { success: false, error: "used" } });
        fake = fakeServiceClient((call) => respond(call), { rpc: () => accept() });
        const res = await join(token);
        expect(res.status).toBe(410);
        expect(await res.json()).toMatchObject({ reason: "used" });
        expect(fake.calls.some((c) => c.table === "access_requests")).toBe(false);
    });

    it("a full team answers 402 with the upgrade message", async () => {
        accept = () => ({ error: { message: "team is full", code: "PT402", hint: "TEAM_LIMIT" } });
        fake = fakeServiceClient((call) => respond(call), { rpc: () => accept() });
        const res = await join(token);
        expect(res.status).toBe(402);
        expect(await res.json()).toMatchObject({ code: "team_limit" });
    });
});
