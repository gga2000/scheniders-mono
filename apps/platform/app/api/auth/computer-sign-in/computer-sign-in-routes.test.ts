import { beforeEach, describe, expect, it, vi } from "vitest";

// One fake table: each query records its calls and resolves to the next
// queued result, in the order the route runs its queries.
type Call = [method: string, ...args: unknown[]];
const queries: Call[][] = [];
const results: { data: unknown; error: unknown }[] = [];
function table() {
    const calls: Call[] = [];
    queries.push(calls);
    const done = () => Promise.resolve(results.shift() ?? { data: null, error: null });
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const method of ["select", "insert", "update", "eq", "is", "not", "gt"]) {
        chain[method] = (...args: unknown[]) => {
            calls.push([method, ...args]);
            return chain;
        };
    }
    chain.maybeSingle = done;
    chain.single = done;
    return chain;
}

const getUserById = vi.fn();
const generateLink = vi.fn();
const verifyOtp = vi.fn();
const caller = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({ from: () => table(), auth: { admin: { getUserById, generateLink } } }),
    createSupabaseServerClient: () => Promise.resolve({ auth: { verifyOtp } }),
}));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: () => Promise.resolve({ allowed: true, remaining: 9, resetAt: null, retryAfterSeconds: 0 }),
    rateLimitHeaders: () => ({ "Retry-After": "60" }),
}));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: vi.fn() }));
vi.mock("@/lib/auth/require-request-caller", () => ({ requireRequestCaller: () => Promise.resolve(caller.current) }));

import { NextRequest, NextResponse } from "next/server";
import { SIGN_IN_ANSWER_MARGIN_MS, SIGN_IN_CODE_LIFE_MS } from "@/lib/computer-sign-in";
import { newSecretTicket, secretTicketMatches } from "@/lib/secret-ticket";
import { POST as create } from "./route";
import { POST as wait } from "./wait/route";
import { GET as look, POST as reply } from "./[id]/route";

const ID = "7f3c9a2e-4b1d-4e8a-9c55-2d6b1a0e8f41";
const USER = "a0000000-0000-4000-8000-000000000001";
const { ticket, hash } = newSecretTicket();
const params = { params: Promise.resolve({ id: ID }) };

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    return new NextRequest(`https://app.test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers },
        body: JSON.stringify(body),
    });
}

function row(fields: Record<string, unknown> = {}) {
    return {
        id: ID,
        secret_hash: hash,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        browser: "Chrome",
        os: "Windows",
        country: "IQ",
        approved_user_id: null,
        approved_at: null,
        declined_at: null,
        used_at: null,
        ...fields,
    };
}

const approved = () => row({ approved_user_id: USER, approved_at: new Date(Date.now() - 1000).toISOString() });

beforeEach(() => {
    vi.clearAllMocks();
    queries.length = 0;
    results.length = 0;
    caller.current = { ok: true, userId: USER, tenantId: "t1", role: "admin", platformAdmin: false, readOnly: false };
    getUserById.mockResolvedValue({ data: { user: { id: USER, email: "owner@shop.test" } }, error: null });
    generateLink.mockResolvedValue({ data: { properties: { hashed_token: "hashed" } }, error: null });
    verifyOtp.mockResolvedValue({ data: {}, error: null });
});

describe("POST /api/auth/computer-sign-in", () => {
    it("keeps only the secret's hash, and names the computer and its country", async () => {
        results.push({ data: { id: ID }, error: null });
        const res = await create(
            post("/api/auth/computer-sign-in", { touch: false }, {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "x-vercel-ip-country": "iq",
            }),
        );
        const body = await res.json();
        expect(body.data.id).toBe(ID);
        const [, inserted] = queries[0].find(([method]) => method === "insert") as [string, Record<string, unknown>];
        expect(inserted).toMatchObject({ browser: "Chrome", os: "Windows", country: "IQ" });
        expect(inserted.secret_hash).not.toBe(body.data.secret);
        expect(secretTicketMatches(body.data.secret, String(inserted.secret_hash))).toBe(true);
        expect(Date.parse(String(inserted.expires_at)) - Date.now()).toBeLessThanOrEqual(SIGN_IN_CODE_LIFE_MS);
    });

    it("drops a country header that is not a country code", async () => {
        results.push({ data: { id: ID }, error: null });
        await create(post("/api/auth/computer-sign-in", {}, { "x-vercel-ip-country": "XX1" }));
        const [, inserted] = queries[0].find(([method]) => method === "insert") as [string, Record<string, unknown>];
        expect(inserted.country).toBeNull();
    });
});

describe("POST /api/auth/computer-sign-in/wait", () => {
    it("answers nothing without the right secret", async () => {
        results.push({ data: approved(), error: null });
        const res = await wait(post("/api/auth/computer-sign-in/wait", { id: ID, secret: newSecretTicket().ticket }));
        expect(res.status).toBe(404);
        results.push({ data: null, error: null });
        expect((await wait(post("/api/auth/computer-sign-in/wait", { id: ID, secret: ticket }))).status).toBe(404);
        expect(generateLink).not.toHaveBeenCalled();
    });

    it("says waiting until the phone answers", async () => {
        results.push({ data: row(), error: null });
        const res = await wait(post("/api/auth/computer-sign-in/wait", { id: ID, secret: ticket }));
        expect(await res.json()).toEqual({ success: true, data: { state: "waiting" } });
        expect(queries).toHaveLength(1);
    });

    it("after the phone's yes, spends the code once and signs the computer in", async () => {
        results.push({ data: approved(), error: null }, { data: { approved_user_id: USER }, error: null });
        const res = await wait(post("/api/auth/computer-sign-in/wait", { id: ID, secret: ticket }));
        expect(await res.json()).toEqual({ success: true, data: { state: "signed_in" } });
        const spend = queries[1];
        expect(spend).toContainEqual(["is", "used_at", null]);
        expect(spend).toContainEqual(["not", "approved_user_id", "is", null]);
        expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "owner@shop.test" });
        expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "hashed", type: "magiclink" });
    });

    it("a second ask that loses the spend gets no session", async () => {
        results.push({ data: approved(), error: null }, { data: null, error: null });
        const res = await wait(post("/api/auth/computer-sign-in/wait", { id: ID, secret: ticket }));
        expect(await res.json()).toEqual({ success: true, data: { state: "expired" } });
        expect(generateLink).not.toHaveBeenCalled();
        expect(verifyOtp).not.toHaveBeenCalled();
    });

    it("says failed when the token is refused", async () => {
        results.push({ data: approved(), error: null }, { data: { approved_user_id: USER }, error: null });
        verifyOtp.mockResolvedValue({ data: {}, error: { message: "Token has expired" } });
        const res = await wait(post("/api/auth/computer-sign-in/wait", { id: ID, secret: ticket }));
        expect(await res.json()).toEqual({ success: true, data: { state: "failed" } });
    });
});

describe("/api/auth/computer-sign-in/<id> from the phone", () => {
    it("shows which computer asks, and treats a code in its last seconds as gone", async () => {
        results.push({ data: row(), error: null });
        const res = await look(new NextRequest(`https://app.test/api/auth/computer-sign-in/${ID}`), params);
        expect((await res.json()).data).toMatchObject({ browser: "Chrome", os: "Windows", country: "IQ", state: "waiting" });
        results.push({ data: row({ expires_at: new Date(Date.now() + SIGN_IN_ANSWER_MARGIN_MS - 1000).toISOString() }), error: null });
        const late = await look(new NextRequest(`https://app.test/api/auth/computer-sign-in/${ID}`), params);
        expect((await late.json()).data.state).toBe("expired");
    });

    it("yes names the person on the code, only while it is unanswered and not about to run out", async () => {
        results.push({ data: { id: ID }, error: null });
        const before = Date.now();
        const res = await reply(post(`/api/auth/computer-sign-in/${ID}`, { answer: "yes" }), params);
        expect(await res.json()).toEqual({ success: true, data: { answer: "yes" } });
        const update = queries[0];
        expect(update[0]).toEqual(["update", expect.objectContaining({ approved_user_id: USER })]);
        expect(update).toContainEqual(["is", "approved_at", null]);
        expect(update).toContainEqual(["is", "declined_at", null]);
        const [, , floor] = update.find(([method]) => method === "gt") as [string, string, string];
        expect(Date.parse(floor)).toBeGreaterThanOrEqual(before + SIGN_IN_ANSWER_MARGIN_MS);
    });

    it("no only marks the code declined", async () => {
        results.push({ data: { id: ID }, error: null });
        await reply(post(`/api/auth/computer-sign-in/${ID}`, { answer: "no" }), params);
        const [, change] = queries[0][0] as [string, Record<string, unknown>];
        expect(Object.keys(change)).toEqual(["declined_at"]);
    });

    it("a code already answered or gone is 410", async () => {
        results.push({ data: null, error: null });
        const res = await reply(post(`/api/auth/computer-sign-in/${ID}`, { answer: "yes" }), params);
        expect(res.status).toBe(410);
    });

    it("a look-only support view cannot answer", async () => {
        caller.current = { ok: false, response: NextResponse.json({ success: false }, { status: 403 }) };
        const res = await reply(post(`/api/auth/computer-sign-in/${ID}`, { answer: "yes" }), params);
        expect(res.status).toBe(403);
        expect(queries).toHaveLength(0);
    });
});
