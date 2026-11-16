import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { RequestCaller } from "@/lib/auth/require-request-caller";

type DbResult = { data: unknown; error: { code?: string; message: string } | null };
type DbCall = { method: string; args: unknown[] };

const state = vi.hoisted(() => ({
    caller: null as RequestCaller | null,
    requirements: [] as string[],
    calls: [] as DbCall[],
    queue: [] as DbResult[],
}));

vi.mock("@/lib/auth/require-request-caller", () => ({
    requireRequestCaller: async (_req: Request, requirement: string) => {
        state.requirements.push(requirement);
        if (!state.caller) throw new Error("test did not set a caller");
        return state.caller;
    },
}));

/** A PostgREST-shaped builder: every method chains and is recorded; awaiting takes the next queued answer. */
function fakeQuery(): unknown {
    return new Proxy(() => undefined, {
        get(_target, prop) {
            if (prop === "then") {
                return (resolve: (value: DbResult) => void) => resolve(state.queue.shift() ?? { data: null, error: null });
            }
            // `db.storage` is a property, not a call.
            if (prop === "storage") {
                state.calls.push({ method: "storage", args: [] });
                return fakeQuery();
            }
            return (...args: unknown[]) => {
                state.calls.push({ method: String(prop), args });
                return fakeQuery();
            };
        },
    });
}

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => fakeQuery() }));

import { GET, POST } from "./route";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const CASE = "33333333-3333-4333-8333-333333333333";

const member: RequestCaller = { ok: true, userId: USER, email: "owner@shop.test", tenantId: TENANT, role: "admin", platformAdmin: false };

const request = (method: "GET" | "POST", body?: unknown) =>
    new NextRequest("http://x/api/support", {
        method,
        headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

const caseRow = { id: CASE, status: "waiting_merchant", rating: null, solved_at: null, created_at: "2026-11-16T10:00:00Z", merchant_last_read_at: "2026-11-16T10:05:00Z" };
const message = (id: string, sender_kind: string, created_at: string) => ({ id, case_id: CASE, sender_kind, sender_name: null, body: id, created_at });

const eqCalls = () => state.calls.filter((c) => c.method === "eq").map((c) => c.args);
const rpcCall = () => state.calls.find((c) => c.method === "rpc");

beforeEach(() => {
    state.caller = member;
    state.requirements.length = 0;
    state.calls.length = 0;
    state.queue.length = 0;
});

describe("GET /api/support", () => {
    it("answers a signed-out caller with the guard's response and reads nothing", async () => {
        state.caller = { ok: false, response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
        const res = await GET(request("GET"));
        expect(res.status).toBe(401);
        expect(state.calls).toHaveLength(0);
    });

    it("is open to any member of the shop", async () => {
        state.queue.push({ data: [], error: null });
        await GET(request("GET"));
        expect(state.requirements).toEqual(["member"]);
    });

    it("reads only the caller's own cases in the caller's own shop", async () => {
        state.queue.push({ data: [], error: null });
        const res = await GET(request("GET"));
        expect(await res.json()).toEqual({ success: true, data: { case: null, messages: [], unread: 0 } });
        expect(eqCalls()).toEqual([["tenant_id", TENANT], ["opened_by", USER]]);
    });

    it("returns the thread oldest first and counts staff replies the merchant has not opened", async () => {
        state.queue.push(
            { data: [caseRow], error: null },
            {
                data: [
                    message("m4", "staff", "2026-11-16T10:09:00Z"),
                    message("m3", "merchant", "2026-11-16T10:07:00Z"),
                    message("m2", "staff", "2026-11-16T10:04:00Z"),
                    message("m1", "merchant", "2026-11-16T10:00:00Z"),
                ],
                error: null,
            },
        );
        const body = await (await GET(request("GET"))).json();
        expect(body.data.messages.map((m: { id: string }) => m.id)).toEqual(["m1", "m2", "m3", "m4"]);
        expect(body.data.unread).toBe(1);
        expect(body.data.case).toEqual({ id: CASE, status: "waiting_merchant", rating: null, solved_at: null, created_at: "2026-11-16T10:00:00Z" });
        // The messages read is scoped to the shop as well as to the caller's cases.
        expect(eqCalls()).toContainEqual(["tenant_id", TENANT]);
        expect(state.calls.find((c) => c.method === "in")?.args).toEqual(["case_id", [CASE]]);
    });
});

describe("GET /api/support pictures of the screen", () => {
    const SHOT = `${TENANT}/44444444-4444-4444-8444-444444444444.jpg`;
    const GONE = `${TENANT}/55555555-5555-4555-8555-555555555555.jpg`;
    const VOICE = `${TENANT}/66666666-6666-4666-8666-666666666666.webm`;

    it("links each picture through one signing call and drops the stored path", async () => {
        state.queue.push(
            { data: [caseRow], error: null },
            {
                data: [
                    { ...message("m2", "merchant", "2026-11-16T10:04:00Z"), context: { screenshot: GONE } },
                    { ...message("m1", "merchant", "2026-11-16T10:00:00Z"), context: { screenshot: SHOT, path: "/orders" } },
                    { ...message("m0", "merchant", "2026-11-16T09:00:00Z"), context: {} },
                ],
                error: null,
            },
            {
                data: [
                    { path: SHOT, signedUrl: "https://x/signed-shot", error: null },
                    { path: GONE, signedUrl: "", error: "Object not found" },
                ],
                error: null,
            },
        );
        const body = await (await GET(request("GET"))).json();
        expect(body.data.messages).toEqual([
            { ...message("m0", "merchant", "2026-11-16T09:00:00Z"), screenshot_url: null, voice_url: null },
            { ...message("m1", "merchant", "2026-11-16T10:00:00Z"), screenshot_url: "https://x/signed-shot", voice_url: null },
            { ...message("m2", "merchant", "2026-11-16T10:04:00Z"), screenshot_url: null, voice_url: null },
        ]);
        const signing = state.calls.filter((c) => c.method === "createSignedUrls");
        expect(signing).toHaveLength(1);
        expect(signing[0].args[0]).toEqual([SHOT, GONE]);
        expect(state.calls.find((c) => c.method === "from" && c.args[0] === "support-shots")).toBeDefined();
    });

    it("links pictures and voice notes from their own buckets, one call each", async () => {
        state.queue.push(
            { data: [caseRow], error: null },
            {
                data: [
                    { ...message("m1", "merchant", "2026-11-16T10:00:00Z"), context: { voice: VOICE } },
                    { ...message("m0", "merchant", "2026-11-16T09:00:00Z"), context: { screenshot: SHOT } },
                ],
                error: null,
            },
            { data: [{ path: SHOT, signedUrl: "https://x/signed-shot", error: null }], error: null },
            { data: [{ path: VOICE, signedUrl: "https://x/signed-voice", error: null }], error: null },
        );
        const body = await (await GET(request("GET"))).json();
        expect(body.data.messages).toEqual([
            { ...message("m0", "merchant", "2026-11-16T09:00:00Z"), screenshot_url: "https://x/signed-shot", voice_url: null },
            { ...message("m1", "merchant", "2026-11-16T10:00:00Z"), screenshot_url: null, voice_url: "https://x/signed-voice" },
        ]);
        const buckets = state.calls.filter((c) => c.method === "from").map((c) => c.args[0]);
        expect(buckets).toEqual(expect.arrayContaining(["support-shots", "support-voice"]));
        expect(state.calls.filter((c) => c.method === "createSignedUrls")).toHaveLength(2);
    });

    it("signs nothing when no message carries a picture", async () => {
        state.queue.push({ data: [caseRow], error: null }, { data: [message("m1", "merchant", "2026-11-16T10:00:00Z")], error: null });
        const body = await (await GET(request("GET"))).json();
        expect(body.data.messages[0].screenshot_url).toBeNull();
        expect(state.calls.some((c) => c.method === "storage")).toBe(false);
    });
});

describe("POST /api/support with a picture", () => {
    it("refuses a picture from another shop's folder before touching the database", async () => {
        const res = await POST(
            request("POST", {
                action: "send",
                body: "شوف",
                context: { screenshot: "99999999-9999-4999-8999-999999999999/44444444-4444-4444-8444-444444444444.jpg" },
            }),
        );
        expect(res.status).toBe(400);
        expect(state.calls).toHaveLength(0);
    });

    it("refuses a voice note from another shop's folder before touching the database", async () => {
        const res = await POST(
            request("POST", {
                action: "send",
                body: "رسالة صوتية",
                context: { voice: "99999999-9999-4999-8999-999999999999/44444444-4444-4444-8444-444444444444.webm" },
            }),
        );
        expect(res.status).toBe(400);
        expect(state.calls).toHaveLength(0);
    });

    it("refuses a path that is not a stored picture", async () => {
        const res = await POST(request("POST", { action: "send", body: "شوف", context: { screenshot: `${TENANT}/../x.jpg` } }));
        expect(res.status).toBe(400);
        expect(state.calls).toHaveLength(0);
    });

    it("sends the shop's own picture with the message", async () => {
        const shot = `${TENANT}/44444444-4444-4444-8444-444444444444.jpg`;
        state.queue.push({ data: { display_name: "Ali" }, error: null }, { data: null, error: null }, { data: [], error: null });
        const res = await POST(request("POST", { action: "send", body: "شوف", context: { screenshot: shot } }));
        expect(res.status).toBe(200);
        expect((rpcCall()?.args[1] as { p_context: unknown }).p_context).toEqual({ screenshot: shot });
    });
});

describe("POST /api/support", () => {
    it.each([
        ["no body", undefined],
        ["an empty message", { action: "send", body: " " }],
        ["an unknown action", { action: "solve", caseId: CASE }],
    ])("refuses %s before touching the database", async (_name, body) => {
        const res = await POST(request("POST", body));
        expect(res.status).toBe(400);
        expect(state.calls).toHaveLength(0);
    });

    it("sends as the session's shop and member, whatever the body claims", async () => {
        state.queue.push(
            { data: { display_name: "  أحمد  " }, error: null },
            { data: { case_id: CASE, message_id: "m1" }, error: null },
            { data: [], error: null },
        );
        const res = await POST(
            request("POST", {
                action: "send",
                body: "  الطلبات لا تظهر  ",
                tenantId: "99999999-9999-4999-8999-999999999999",
                userId: "99999999-9999-4999-8999-999999999999",
                context: { path: "/orders", errorCode: "orders.x", p_tenant_id: "99999999-9999-4999-8999-999999999999" },
            }),
        );
        expect(res.status).toBe(200);
        expect(rpcCall()?.args).toEqual([
            "support_merchant_send",
            {
                p_tenant_id: TENANT,
                p_user_id: USER,
                p_user_name: "أحمد",
                p_body: "الطلبات لا تظهر",
                p_context: { path: "/orders", errorCode: "orders.x" },
            },
        ]);
    });

    it("names the member by email when the profile has no display name", async () => {
        state.queue.push({ data: { display_name: null }, error: null }, { data: {}, error: null }, { data: [], error: null });
        await POST(request("POST", { action: "send", body: "hi" }));
        expect(rpcCall()?.args[1]).toMatchObject({ p_user_name: "owner@shop.test" });
    });

    it("rates as the session's shop and member", async () => {
        state.queue.push({ data: { case_id: CASE, reopened: true }, error: null }, { data: [], error: null });
        const res = await POST(request("POST", { action: "rate", caseId: CASE, rating: "no" }));
        expect(res.status).toBe(200);
        expect(rpcCall()?.args).toEqual([
            "support_merchant_rate",
            { p_tenant_id: TENANT, p_user_id: USER, p_case_id: CASE, p_rating: "no" },
        ]);
    });

    it.each([
        ["support_rate_limited", 429],
        ["support_case_not_found", 404],
        ["support_already_rated", 409],
    ])("answers the refusal %s with %i and its code", async (code, status) => {
        state.queue.push({ data: null, error: { code: "P0001", message: code } });
        const res = await POST(request("POST", { action: "rate", caseId: CASE, rating: "yes" }));
        expect(res.status).toBe(status);
        expect(await res.json()).toEqual({ success: false, error: code });
    });

    it("lets a real database failure surface instead of calling it a refusal", async () => {
        state.queue.push({ data: null, error: { code: "57014", message: "statement timeout" } });
        await expect(POST(request("POST", { action: "rate", caseId: CASE, rating: "yes" }))).rejects.toThrow(/statement timeout/);
    });

    it("marks only the caller's own cases as read", async () => {
        const res = await POST(request("POST", { action: "read" }));
        expect(res.status).toBe(200);
        expect(state.calls.find((c) => c.method === "from")?.args).toEqual(["support_cases"]);
        expect(eqCalls()).toEqual([["tenant_id", TENANT], ["opened_by", USER]]);
        expect(rpcCall()).toBeUndefined();
    });
});
