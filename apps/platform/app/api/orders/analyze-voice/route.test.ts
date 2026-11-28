// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const perm = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/supabase-server", () => ({
    verifyAccessToken: vi.fn(),
    createSupabaseServerClientWithToken: () => ({
        rpc: async () => ({ data: perm.allowed, error: null }),
    }),
}));
vi.mock("@/lib/auth/resolve-active-tenant", () => ({
    resolveActiveTenant: vi.fn(async () => ({ ok: true, tenantId: "t1", role: "employee", platformAdmin: false })),
}));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: vi.fn(async () => ({ allowed: true, remaining: 1, resetAt: null, retryAfterSeconds: 0 })),
    rateLimitHeaders: () => ({}),
}));
vi.mock("@/lib/voice/order-from-voice", () => ({
    extractOrderFromVoice: vi.fn(),
}));

import { POST } from "./route";
import { verifyAccessToken } from "@/lib/supabase-server";
import { consumeRateLimit } from "@/lib/rate-limit";
import { extractOrderFromVoice } from "@/lib/voice/order-from-voice";

/** First bytes of a WebM (EBML) recording, padded past the 12-byte sniff. */
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const HEARD = { customer_name: "حيدر", phone: "07701234567", secondary_phone: "", city: "بغداد", address: "الكرادة", notes: "" };

function req(audio: Blob | null, auth = "Bearer tok"): Request {
    const form = new FormData();
    if (audio) form.set("audio", new File([audio], "order", { type: "audio/webm" }));
    const headers: Record<string, string> = {};
    if (auth) headers.Authorization = auth;
    return new Request("http://x/api/orders/analyze-voice", { method: "POST", headers, body: form });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAccessToken).mockResolvedValue({ user: { id: "u1" }, error: null } as never);
});

describe("POST /api/orders/analyze-voice", () => {
    it("401s without a token", async () => {
        const res = await POST(req(new Blob([WEBM]), "") as never);
        expect(res.status).toBe(401);
        expect(extractOrderFromVoice).not.toHaveBeenCalled();
    });

    it("403s a member without orders.create, before charging the meter", async () => {
        perm.allowed = false;
        const res = await POST(req(new Blob([WEBM])) as never);
        perm.allowed = true;
        expect(res.status).toBe(403);
        expect(consumeRateLimit).not.toHaveBeenCalled();
        expect(extractOrderFromVoice).not.toHaveBeenCalled();
    });

    it("meters 100 listens per store per day", async () => {
        await POST(req(null) as never);
        expect(consumeRateLimit).toHaveBeenCalledWith("analyze-voice:t1", 100, 86_400);
    });

    it("429s once the store's day is used up, without calling Gemini", async () => {
        vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: null, retryAfterSeconds: 3600 });
        const res = await POST(req(new Blob([WEBM])) as never);
        expect(res.status).toBe(429);
        expect(extractOrderFromVoice).not.toHaveBeenCalled();
    });

    it("400s with no recording", async () => {
        const res = await POST(req(null) as never);
        expect(res.status).toBe(400);
    });

    it("413s a recording over 2 MB", async () => {
        const big = new Uint8Array(2_097_153);
        big.set(WEBM);
        const res = await POST(req(new Blob([big])) as never);
        expect(res.status).toBe(413);
        expect(extractOrderFromVoice).not.toHaveBeenCalled();
    });

    it("415s bytes that are not a recording, whatever the label says", async () => {
        const res = await POST(req(new Blob([new Uint8Array(16).fill(0x41)])) as never);
        expect(res.status).toBe(415);
        expect(extractOrderFromVoice).not.toHaveBeenCalled();
    });

    it("returns what Gemini heard, sending the type read from the bytes", async () => {
        vi.mocked(extractOrderFromVoice).mockResolvedValueOnce(HEARD);
        const res = await POST(req(new Blob([WEBM])) as never);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, data: HEARD });
        expect(vi.mocked(extractOrderFromVoice).mock.calls[0][1]).toBe("audio/webm");
    });

    it("502s without the upstream detail when Gemini fails", async () => {
        vi.mocked(extractOrderFromVoice).mockRejectedValueOnce(new Error("GEMINI_API_KEY is not configured"));
        const res = await POST(req(new Blob([WEBM])) as never);
        expect(res.status).toBe(502);
        expect(JSON.stringify(await res.json())).not.toContain("GEMINI");
    });
});
