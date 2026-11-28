import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserById = vi.fn();
const updateUserById = vi.fn();
const consumeRateLimit = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({ auth: { admin: { getUserById, updateUserById } } }),
}));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...args),
    rateLimitHeaders: () => ({ "Retry-After": "60" }),
}));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: vi.fn() }));

import { NextRequest } from "next/server";
import { newSignupWaitTicket } from "@/lib/signup-wait";
import { POST } from "./route";

const USER = "a0000000-0000-4000-8000-000000000001";
const { ticket, hash } = newSignupWaitTicket();

function request(body: unknown) {
    return new NextRequest("https://app.test/api/auth/signup/wait", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
        body: JSON.stringify(body),
    });
}

function account(fields: Record<string, unknown> = {}) {
    return {
        data: {
            user: {
                id: USER,
                created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
                email_confirmed_at: null,
                app_metadata: { provider: "email", signup_wait: hash },
                ...fields,
            },
        },
        error: null,
    };
}

describe("POST /api/auth/signup/wait", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 9, resetAt: null, retryAfterSeconds: 0 });
        updateUserById.mockResolvedValue({ data: {}, error: null });
    });

    it("says not yet while the email is unconfirmed, and leaves the ticket in place", async () => {
        getUserById.mockResolvedValue(account());
        const res = await POST(request({ user_id: USER, ticket }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, data: { confirmed: false } });
        expect(updateUserById).not.toHaveBeenCalled();
    });

    it("says confirmed once the link was opened elsewhere, and retires the ticket", async () => {
        getUserById.mockResolvedValue(account({ email_confirmed_at: new Date().toISOString() }));
        const res = await POST(request({ user_id: USER, ticket }));
        expect(await res.json()).toEqual({ success: true, data: { confirmed: true } });
        expect(updateUserById).toHaveBeenCalledWith(USER, { app_metadata: { signup_wait: null } });
    });

    it("answers nothing about an account without its ticket", async () => {
        getUserById.mockResolvedValue(account({ email_confirmed_at: new Date().toISOString() }));
        for (const body of [{ user_id: USER, ticket: newSignupWaitTicket().ticket }, { user_id: USER, ticket: hash }]) {
            const res = await POST(request(body));
            expect(res.status).toBe(404);
            expect(await res.json()).toEqual({ success: false, code: "unknown" });
        }
        getUserById.mockResolvedValue(account({ app_metadata: { provider: "email" } }));
        expect((await POST(request({ user_id: USER, ticket }))).status).toBe(404);
        getUserById.mockResolvedValue({ data: { user: null }, error: { message: "User not found" } });
        expect((await POST(request({ user_id: USER, ticket }))).status).toBe(404);
    });

    it("stops answering a day after sign-up", async () => {
        getUserById.mockResolvedValue(account({ created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }));
        const res = await POST(request({ user_id: USER, ticket }));
        expect(res.status).toBe(410);
    });

    it("refuses a malformed request before looking anything up", async () => {
        for (const body of [{ user_id: "not-a-uuid", ticket }, { user_id: USER }, null]) {
            expect((await POST(request(body))).status).toBe(400);
        }
        expect(getUserById).not.toHaveBeenCalled();
    });

    it("is rate limited per address and per account", async () => {
        getUserById.mockResolvedValue(account());
        await POST(request({ user_id: USER, ticket }));
        expect(consumeRateLimit.mock.calls.map((call) => call[0])).toEqual([`signup-wait:ip:203.0.113.9`, `signup-wait:user:${USER}`]);
        consumeRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: new Date(), retryAfterSeconds: 60 });
        expect((await POST(request({ user_id: USER, ticket }))).status).toBe(429);
    });
});
