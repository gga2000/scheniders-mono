import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const s = vi.hoisted(() => ({
    answer: { result: "ok", proof: "row-1" } as { result: string; proof?: string },
    checked: [] as [string, string][],
    allowed: true,
}));

vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => ({}) }));
vi.mock("@/lib/job-monitor", () => ({ withFailureReport: (_job: string, handler: unknown) => handler }));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: async () => ({ allowed: s.allowed, remaining: 0, resetAt: null, retryAfterSeconds: 60 }),
    rateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/signup-phone-code", () => ({
    SIGNUP_CODE_PATTERN: /^\d{6}$/,
    checkSignupCode: async (_db: unknown, phone: string, code: string) => {
        s.checked.push([phone, code]);
        return s.answer;
    },
}));

import { POST } from "./route";

const post = (body: unknown) =>
    new NextRequest("https://schenidersapp.xyz/api/auth/phone-code/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });

beforeEach(() => {
    s.answer = { result: "ok", proof: "row-1" };
    s.checked = [];
    s.allowed = true;
});

describe("/api/auth/phone-code/verify (Fermi B11)", () => {
    it("hands back the proof for the right code", async () => {
        const res = await POST(post({ phone: "0770 123 4567", code: " 123456 " }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, data: { proof: "row-1" } });
        expect(s.checked).toEqual([["07701234567", "123456"]]);
    });

    it("answers wrong, locked and expired so the page can say which", async () => {
        for (const [result, status] of [["wrong", 422], ["locked", 429], ["expired", 410]] as const) {
            s.answer = { result };
            const res = await POST(post({ phone: "07701234567", code: "000000" }));
            expect(res.status).toBe(status);
            expect(await res.json()).toEqual({ success: false, error: result });
        }
    });

    it("never checks a code that is not six digits, or a number that is not a mobile", async () => {
        for (const body of [{ phone: "07701234567", code: "12345" }, { phone: "07701234567", code: "abcdef" }, { phone: "123", code: "123456" }, null]) {
            expect((await POST(post(body))).status).toBe(422);
        }
        expect(s.checked).toEqual([]);
    });

    it("limits checks per address", async () => {
        s.allowed = false;
        expect((await POST(post({ phone: "07701234567", code: "123456" }))).status).toBe(429);
        expect(s.checked).toEqual([]);
    });
});
