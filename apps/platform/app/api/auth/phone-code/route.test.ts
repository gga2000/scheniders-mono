import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const s = vi.hoisted(() => ({
    settings: { phone_code: true, welcome: false, welcome_video_url: null as string | null },
    limits: [] as string[],
    blocked: new Set<string>(),
    captcha: { ok: true } as { ok: true } | { ok: false; reason: string },
    wait: 0,
    sent: [] as [string, string][],
    sendOk: true,
}));

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/job-monitor", () => ({ withFailureReport: (_job: string, handler: unknown) => handler }));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: vi.fn() }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: async () => s.captcha }));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: async (key: string) => {
        s.limits.push(key);
        const blocked = [...s.blocked].some((prefix) => key.startsWith(prefix));
        return { allowed: !blocked, remaining: 0, resetAt: null, retryAfterSeconds: blocked ? 900 : 0 };
    },
    rateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/signup-phone-code", () => ({
    SIGNUP_CODE_RESEND_SECONDS: 60,
    loadSignupWhatsApp: async () => s.settings,
    signupCodeWait: async () => s.wait,
    sendSignupCode: async (_db: unknown, phone: string, ip: string) => {
        s.sent.push([phone, ip]);
        return s.sendOk ? { ok: true } : { ok: false, error: "nope" };
    },
}));

import { GET, POST } from "./route";

const post = (body: unknown) =>
    new NextRequest("https://schenidersapp.xyz/api/auth/phone-code", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": "203.0.113.9" },
        body: JSON.stringify(body),
    });

beforeEach(() => {
    s.settings = { phone_code: true, welcome: false, welcome_video_url: null };
    s.limits = [];
    s.blocked = new Set();
    s.captcha = { ok: true };
    s.wait = 0;
    s.sent = [];
    s.sendOk = true;
});

describe("/api/auth/phone-code (Fermi B11)", () => {
    it("tells the signup page whether it asks for a code", async () => {
        const res = await GET(new NextRequest("https://schenidersapp.xyz/api/auth/phone-code"));
        expect(await res.json()).toEqual({ success: true, data: { phone_code: true } });
        s.settings = { phone_code: false, welcome: false, welcome_video_url: null };
        expect(await (await GET(new NextRequest("https://schenidersapp.xyz/api/auth/phone-code"))).json()).toEqual({ success: true, data: { phone_code: false } });
        s.blocked.add("signup-code-switch:");
        expect((await GET(new NextRequest("https://schenidersapp.xyz/api/auth/phone-code"))).status).toBe(429);
    });

    it("sends a code to the number in its plain form, past the CAPTCHA and both limits", async () => {
        const res = await POST(post({ phone: "+964 770 123 4567", captcha_token: "tok" }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, data: { phone: "07701234567", resend_after: 60 } });
        expect(s.sent).toEqual([["07701234567", "203.0.113.9"]]);
        expect(s.limits).toEqual(["signup-code:ip:203.0.113.9", "signup-code:phone:07701234567"]);
    });

    it("sends nothing while the switch is off", async () => {
        s.settings = { phone_code: false, welcome: false, welcome_video_url: null };
        const res = await POST(post({ phone: "07701234567" }));
        expect(res.status).toBe(404);
        expect(s.sent).toEqual([]);
    });

    it("refuses what is not an Iraqi mobile", async () => {
        for (const phone of ["123", "07501", "+1 202 555 0100"]) {
            const res = await POST(post({ phone }));
            expect(res.status).toBe(422);
        }
        expect(s.sent).toEqual([]);
    });

    it("refuses a failed CAPTCHA, and fails closed when it cannot be checked", async () => {
        s.captcha = { ok: false, reason: "rejected" };
        expect((await POST(post({ phone: "07701234567" }))).status).toBe(403);
        s.captcha = { ok: false, reason: "unavailable" };
        expect((await POST(post({ phone: "07701234567" }))).status).toBe(503);
        expect(s.sent).toEqual([]);
    });

    it("waits a minute between codes to one number, and stops after a few in an hour", async () => {
        s.wait = 42;
        const early = await POST(post({ phone: "07701234567" }));
        expect(early.status).toBe(429);
        expect(await early.json()).toMatchObject({ error: "too_many", retry_after: 42 });
        s.wait = 0;
        s.blocked.add("signup-code:phone:");
        expect((await POST(post({ phone: "07701234567" }))).status).toBe(429);
        s.blocked = new Set(["signup-code:ip:"]);
        expect((await POST(post({ phone: "07701234567" }))).status).toBe(429);
        expect(s.sent).toEqual([]);
    });

    it("says so when WhatsApp did not take the code", async () => {
        s.sendOk = false;
        const res = await POST(post({ phone: "07701234567" }));
        expect(res.status).toBe(502);
        expect(await res.json()).toEqual({ success: false, error: "send_failed" });
    });
});
