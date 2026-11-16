import { describe, expect, it, vi } from "vitest";

// The billing lock (Fermi A1) is read from the database: the store is not
// locked unless a test locks it.
const lockState = vi.hoisted(() => ({ locked: false }));
vi.mock("@/lib/billing/lock-refusal", async () => {
    const { NextResponse } = await import("next/server");
    return {
        billingLockRefusal: async () =>
            lockState.locked ? NextResponse.json({ code: "billing_locked" }, { status: 402 }) : null,
    };
});
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

import { PATCH, POST } from "./route";
import { hashInviteToken } from "@/lib/team-invites";

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

describe("POST /api/team/invite — join email", () => {
    let profileReads = 0;
    const newPerson = (call: FakeCall): FakeResult => {
        // Reads 1-2 are the caller (workspace + active check); read 3 is the invited email.
        if (call.table === "user_profiles" && call.op === "select") {
            profileReads += 1;
            return { data: profileReads < 3 ? { id: "caller", current_tenant_id: TENANT, is_active: true } : null };
        }
        if (call.table === "tenant_members" && call.op === "select") return { data: { role: "admin" } };
        if (call.table === "team_invites" && call.op === "insert") {
            return { data: { id: "invite-9", email: "new@example.com", role: "employee", status: "pending" } };
        }
        return {};
    };

    it("emails a new person Supabase's invite link", async () => {
        profileReads = 0;
        respond = newPerson;
        fake = fakeServiceClient((call) => respond(call));
        const res = await POST(request({ email: "new@example.com" }));
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ success: true, email_kind: "invite" });
        expect(fake.invited).toEqual(["new@example.com"]);
        expect(fake.otps).toEqual([]);
    });

    it("emails someone who already has an account a sign-in link instead", async () => {
        profileReads = 0;
        respond = newPerson;
        fake = fakeServiceClient((call) => respond(call), { inviteError: { message: "exists", code: "email_exists" } });
        const res = await POST(request({ email: "new@example.com" }));
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ email_kind: "magiclink" });
        expect(fake.otps).toEqual([{ email: "new@example.com", options: { shouldCreateUser: false } }]);
    });

    it("withdraws the invite and reports failure when no email could be sent", async () => {
        profileReads = 0;
        respond = newPerson;
        fake = fakeServiceClient((call) => respond(call), { inviteError: { message: "smtp down" } });
        vi.spyOn(console, "error").mockImplementation(() => {});
        const res = await POST(request({ email: "new@example.com" }));
        expect(res.status).toBe(502);
        const revoke = fake.calls.find((c) => c.table === "team_invites" && c.op === "update");
        expect(revoke?.payload).toMatchObject({ status: "revoked" });
    });
});

describe("POST /api/team/invite — link and phone invites (Fermi A2)", () => {
    const INVITE_ROW = { id: "invite-5", phone: "07701234567", role: "employee", status: "pending" };
    let insertResult: FakeResult;
    let pendingRow: { id: string; expires_at: string } | null;

    const admin = (call: FakeCall): FakeResult => {
        if (call.table === "user_profiles" && call.op === "select") {
            return { data: { id: "caller", current_tenant_id: TENANT, is_active: true } };
        }
        if (call.table === "tenant_members" && call.op === "select") return { data: { role: "admin" } };
        if (call.table === "tenants") return { data: { business_name: "متجر سارة" } };
        if (call.table === "team_invites" && call.op === "insert") return insertResult;
        if (call.table === "team_invites" && call.op === "select") return { data: pendingRow };
        if (call.table === "team_invites" && call.op === "update") return { data: INVITE_ROW };
        return {};
    };

    function phoneRequest(body: Record<string, unknown>) {
        return new Request("http://localhost/api/team/invite", {
            method: "POST",
            headers: { Authorization: "Bearer t", "content-type": "application/json" },
            body: JSON.stringify({ tenantId: TENANT, ...body }),
        });
    }

    function setUp() {
        insertResult = { data: INVITE_ROW };
        pendingRow = null;
        respond = admin;
        fake = fakeServiceClient((call) => respond(call));
    }

    it("a phone invite returns the join link and a WhatsApp chat with it, and sends no email", async () => {
        setUp();
        const res = await POST(phoneRequest({ phone: "+964 770 123 4567" }));
        expect(res.status).toBe(200);
        const body = (await res.json()) as { link: string; whatsappUrl: string };
        const token = body.link.replace("http://localhost/join/", "");
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(body.whatsappUrl.startsWith("https://wa.me/9647701234567?text=")).toBe(true);
        expect(decodeURIComponent(body.whatsappUrl.split("text=")[1] ?? "")).toContain(body.link);
        expect(decodeURIComponent(body.whatsappUrl)).toContain("متجر سارة");

        // Only the token's hash is stored; the link itself is never written.
        const insert = fake.calls.find((c) => c.table === "team_invites" && c.op === "insert");
        expect(insert?.payload).toMatchObject({ phone: "07701234567", email: null, token_hash: hashInviteToken(token) });
        expect(JSON.stringify(insert?.payload)).not.toContain(token);
        expect(fake.invited).toEqual([]);
    });

    it("refuses a number that is not an Iraqi mobile, and an email and a phone together", async () => {
        setUp();
        expect((await POST(phoneRequest({ phone: "12345" }))).status).toBe(400);
        expect((await POST(phoneRequest({ phone: "07701234567", email: "a@b.co" }))).status).toBe(400);
        expect(fake.calls.some((c) => c.table === "team_invites")).toBe(false);
    });

    it("a full team is refused with 402 and the Arabic upgrade message", async () => {
        setUp();
        insertResult = { error: { message: "team is full", code: "PT402", hint: "TEAM_LIMIT" } };
        const res = await POST(phoneRequest({ phone: "07701234567" }));
        expect(res.status).toBe(402);
        expect(await res.json()).toMatchObject({ code: "team_limit", error: expect.stringContaining("رقِّ الباقة") });
    });

    it("a second invite for a live pending one says to resend, and writes nothing", async () => {
        setUp();
        pendingRow = { id: "invite-5", expires_at: new Date(Date.now() + 86_400_000).toISOString() };
        const res = await POST(phoneRequest({ phone: "07701234567" }));
        expect(res.status).toBe(409);
        const read = fake.calls.find((c) => c.table === "team_invites" && c.op === "select");
        expect(read?.filters).toEqual(
            expect.arrayContaining([
                { method: "eq", args: ["tenant_id", TENANT] },
                { method: "eq", args: ["status", "pending"] },
                { method: "eq", args: ["phone", "07701234567"] },
            ]),
        );
        expect(fake.calls.some((c) => c.table === "team_invites" && c.op !== "select")).toBe(false);
    });

    it("says to resend, not 'team full', when the team is full and the person is already invited", async () => {
        setUp();
        insertResult = { error: { message: "team is full", code: "PT402", hint: "TEAM_LIMIT" } };
        pendingRow = { id: "invite-5", expires_at: new Date(Date.now() + 86_400_000).toISOString() };
        const res = await POST(phoneRequest({ phone: "07701234567" }));
        expect(res.status).toBe(409);
        expect(await res.json()).toMatchObject({ error: expect.stringContaining("إرسال من جديد") });
    });

    it("two admins inviting the same person at once: the loser is told to resend", async () => {
        setUp();
        insertResult = { error: { message: "duplicate", code: "23505" } };
        const res = await POST(phoneRequest({ phone: "07701234567" }));
        expect(res.status).toBe(409);
    });

    it("inviting again after the old invite expired renews it with a new link", async () => {
        setUp();
        pendingRow = { id: "invite-5", expires_at: new Date(Date.now() - 1000).toISOString() };
        const res = await POST(phoneRequest({ phone: "07701234567" }));
        expect(res.status).toBe(200);
        const update = fake.calls.find((c) => c.table === "team_invites" && c.op === "update");
        expect(update?.payload).toMatchObject({ token_hash: expect.stringMatching(/^[0-9a-f]{64}$/), expires_at: expect.any(String) });
        expect(update?.filters).toContainEqual({ method: "eq", args: ["id", "invite-5"] });
        expect(fake.calls.some((c) => c.table === "team_invites" && c.op === "insert")).toBe(false);
    });

    it("a locked store cannot invite", async () => {
        setUp();
        lockState.locked = true;
        try {
            const res = await POST(phoneRequest({ phone: "07701234567" }));
            expect(res.status).toBe(402);
            expect(fake.calls.some((c) => c.table === "team_invites")).toBe(false);
        } finally {
            lockState.locked = false;
        }
    });
});

describe("PATCH /api/team/invite — resend", () => {
    let invite: Record<string, unknown> | null;
    let updateResult: FakeResult;

    function setUp() {
        invite = { id: "invite-5", tenant_id: TENANT, status: "pending", email: null, phone: "07701234567" };
        updateResult = {};
        respond = (call) => {
            if (call.table === "user_profiles" && call.op === "select") return { data: { id: "caller", is_active: true } };
            if (call.table === "tenant_members" && call.op === "select") return { data: { role: "admin" } };
            if (call.table === "tenants") return { data: { business_name: "متجر سارة" } };
            if (call.table === "team_invites" && call.op === "select") return { data: invite };
            if (call.table === "team_invites" && call.op === "update") return updateResult;
            return {};
        };
        fake = fakeServiceClient((call) => respond(call));
    }

    const resend = () =>
        PATCH(new Request("http://localhost/api/team/invite?id=invite-5", { method: "PATCH", headers: { Authorization: "Bearer t" } }));

    it("gives a new link and a new 7 days; the old link stops working", async () => {
        setUp();
        const res = await resend();
        expect(res.status).toBe(200);
        const body = (await res.json()) as { link: string; whatsappUrl: string };
        const token = body.link.replace("http://localhost/join/", "");
        const update = fake.calls.find((c) => c.table === "team_invites" && c.op === "update");
        expect(update?.payload).toMatchObject({ token_hash: hashInviteToken(token) });
        const days = (new Date((update?.payload as { expires_at: string }).expires_at).getTime() - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(6.99);
        expect(body.whatsappUrl).toContain("wa.me/9647701234567");
    });

    it("an email invite is emailed again", async () => {
        setUp();
        invite = { ...invite, email: "new@example.com", phone: null };
        const res = await resend();
        expect(res.status).toBe(200);
        expect(fake.invited).toEqual(["new@example.com"]);
    });

    it("refuses an invite that is no longer pending", async () => {
        setUp();
        invite = { ...invite, status: "accepted" };
        expect((await resend()).status).toBe(409);
        expect(fake.calls.some((c) => c.table === "team_invites" && c.op === "update")).toBe(false);
    });

    it("an expired invite needs a free seat again", async () => {
        setUp();
        updateResult = { error: { message: "team is full", code: "PT402", hint: "TEAM_LIMIT" } };
        const res = await resend();
        expect(res.status).toBe(402);
        expect(await res.json()).toMatchObject({ code: "team_limit" });
    });
});
