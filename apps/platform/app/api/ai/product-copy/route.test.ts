import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase-server", () => ({
    verifyAccessToken: vi.fn(),
}));
vi.mock("@/lib/auth/resolve-active-tenant", () => ({
    resolveActiveTenant: vi.fn(async () => ({ ok: true, tenantId: "t1", role: "employee", platformAdmin: false })),
}));
vi.mock("@/lib/auth/caller-has-permission", () => ({
    callerHasPermission: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: vi.fn(async () => ({ allowed: true, remaining: 1, resetAt: null, retryAfterSeconds: 0 })),
    rateLimitHeaders: () => ({}),
}));

import { POST } from "./route";
import { verifyAccessToken } from "@/lib/supabase-server";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";
import { consumeRateLimit } from "@/lib/rate-limit";
import { callerHasPermission } from "@/lib/auth/caller-has-permission";

function req(body: unknown, auth = "Bearer tok"): Request {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (auth) headers.Authorization = auth;
    return new Request("http://x/api/ai/product-copy", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
}

const COPY = {
    en: { title: "Soy Candle", description: "Clean burn." },
    ar: { title: "شمعة", description: "وصف." },
    ku: { title: "مۆم", description: "پێناسە." },
};

beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("POST /api/ai/product-copy", () => {
    it("401s without a token", async () => {
        const res = await POST(req({ name: "X" }, "") as never);
        expect(res.status).toBe(401);
    });

    it("401s on an invalid token", async () => {
        (verifyAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: null,
            error: "bad",
        });
        const res = await POST(req({ name: "X" }) as never);
        expect(res.status).toBe(401);
    });

    it("403s a signed-in account that belongs to no store", async () => {
        (verifyAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" }, error: null });
        vi.mocked(resolveActiveTenant).mockResolvedValueOnce({ ok: false, status: 403, error: "No store" } as never);
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const res = await POST(req({ name: "X" }) as never);
        expect(res.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("403s a member without products.edit before spending the store's AI budget", async () => {
        (verifyAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" }, error: null });
        const { NextResponse } = await import("next/server");
        vi.mocked(callerHasPermission).mockResolvedValueOnce({
            ok: false,
            response: NextResponse.json({ success: false }, { status: 403 }),
        });
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const res = await POST(req({ name: "X" }) as never);
        expect(res.status).toBe(403);
        expect(vi.mocked(callerHasPermission).mock.calls[0][2]).toBe("products.edit");
        expect(consumeRateLimit).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("429s once the store's hourly AI budget is spent, and 503s when the limiter is down", async () => {
        (verifyAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" }, error: null });
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: null, retryAfterSeconds: 60 });
        expect((await POST(req({ name: "X" }) as never)).status).toBe(429);
        vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: true, remaining: 1, resetAt: null, retryAfterSeconds: 0, error: "db down" });
        expect((await POST(req({ name: "X" }) as never)).status).toBe(503);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(vi.mocked(consumeRateLimit).mock.calls[0][0]).toBe("ai-product-copy:t1");
    });

    it("400s on invalid input", async () => {
        (verifyAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: "u1" },
            error: null,
        });
        const res = await POST(req({ name: "" }) as never);
        expect(res.status).toBe(400);
    });

    it("returns trilingual copy on success", async () => {
        (verifyAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: "u1" },
            error: null,
        });
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ content: [{ type: "text", text: JSON.stringify(COPY) }] }),
        }));
        vi.stubGlobal("fetch", fetchMock);

        const res = await POST(req({ name: "Soy Candle", tone: "luxury" }) as never);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.copy.ar.title).toBe("شمعة");
        expect(json.copy.ku.description).toBe("پێناسە.");
        // model + structured output wired
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
        const sentBody = JSON.parse(init.body);
        expect(sentBody.model).toBe("claude-opus-4-8");
        expect(sentBody.output_config.format.type).toBe("json_schema");
    });

    it("502s when the model returns malformed copy", async () => {
        (verifyAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({
            user: { id: "u1" },
            error: null,
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                json: async () => ({ content: [{ type: "text", text: "{not valid}" }] }),
            })),
        );
        const res = await POST(req({ name: "X" }) as never);
        expect(res.status).toBe(502);
    });
});
