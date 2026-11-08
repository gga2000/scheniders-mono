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
vi.mock("@/lib/gemini-order-extractor", () => ({
    extractOrderFromImage: vi.fn(),
}));

import { POST } from "./route";
import { verifyAccessToken } from "@/lib/supabase-server";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";
import { consumeRateLimit } from "@/lib/rate-limit";
import { extractOrderFromImage } from "@/lib/gemini-order-extractor";

function req(auth = "Bearer tok"): Request {
    const form = new FormData();
    form.set("image", new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", { type: "image/jpeg" }));
    const headers: Record<string, string> = {};
    if (auth) headers.Authorization = auth;
    return new Request("http://x/api/orders/analyze-image", { method: "POST", headers, body: form });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyAccessToken).mockResolvedValue({ user: { id: "u1" }, error: null } as never);
});

describe("POST /api/orders/analyze-image", () => {
    it("401s without a token", async () => {
        const res = await POST(req("") as never);
        expect(res.status).toBe(401);
        expect(extractOrderFromImage).not.toHaveBeenCalled();
    });

    it("403s a signed-in account that belongs to no store", async () => {
        vi.mocked(resolveActiveTenant).mockResolvedValueOnce({ ok: false, status: 403, error: "No store" } as never);
        const res = await POST(req() as never);
        expect(res.status).toBe(403);
        expect(extractOrderFromImage).not.toHaveBeenCalled();
    });

    it("403s a member without orders.create, before charging the meter", async () => {
        perm.allowed = false;
        const res = await POST(req() as never);
        perm.allowed = true;
        expect(res.status).toBe(403);
        expect(consumeRateLimit).not.toHaveBeenCalled();
        expect(extractOrderFromImage).not.toHaveBeenCalled();
    });

    it("meters per store, not per user, before reading the upload", async () => {
        const empty = new Request("http://x/api/orders/analyze-image", {
            method: "POST",
            headers: { Authorization: "Bearer tok" },
            body: new FormData(),
        });
        const res = await POST(empty as never);
        expect(res.status).toBe(400);
        expect(consumeRateLimit).toHaveBeenCalledWith("analyze-image:t1", 60, 60);
    });

    it("refuses (503) when the limiter cannot answer, without calling Gemini", async () => {
        vi.mocked(consumeRateLimit).mockResolvedValueOnce({
            allowed: true, remaining: 60, resetAt: null, retryAfterSeconds: 0, error: "db down",
        });
        const res = await POST(req() as never);
        expect(res.status).toBe(503);
        expect(extractOrderFromImage).not.toHaveBeenCalled();
    });
});
