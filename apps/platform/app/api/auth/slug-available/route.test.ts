import { beforeEach, describe, expect, it, vi } from "vitest";

const consumeRateLimit = vi.fn();
const isSlugFree = vi.fn();
const suggestFreeSlug = vi.fn();

vi.mock("@/lib/tenant", () => ({
    isSlugFree: (...args: unknown[]) => isSlugFree(...args),
    suggestFreeSlug: (...args: unknown[]) => suggestFreeSlug(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...args),
    rateLimitHeaders: () => ({ "Retry-After": "60" }),
}));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: vi.fn() }));

import { NextRequest } from "next/server";
import { GET } from "./route";

function check(slug: string) {
    return GET(
        new NextRequest(`https://app.test/api/auth/slug-available?slug=${encodeURIComponent(slug)}`, {
            headers: { "x-forwarded-for": "203.0.113.9" },
        }),
    );
}

describe("GET /api/auth/slug-available (B11)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 100, resetAt: null, retryAfterSeconds: 0 });
        isSlugFree.mockResolvedValue(true);
        suggestFreeSlug.mockResolvedValue("noor-2");
    });

    it("says a free address is free", async () => {
        const res = await check(" Noor ");
        expect(await res.json()).toEqual({ available: true });
        expect(isSlugFree).toHaveBeenCalledWith("noor");
    });

    it("says a taken address is taken and offers a free one near it", async () => {
        isSlugFree.mockResolvedValue(false);
        expect(await (await check("noor")).json()).toEqual({ available: false, reason: "taken", suggestion: "noor-2" });
    });

    it("refuses a badly formed address without looking it up", async () => {
        expect(await (await check("no")).json()).toEqual({ available: false, reason: "format" });
        expect(isSlugFree).not.toHaveBeenCalled();
    });

    it("refuses a platform address and offers one the merchant can have", async () => {
        suggestFreeSlug.mockResolvedValue("store-admin-2");
        expect(await (await check("admin")).json()).toEqual({ available: false, reason: "reserved", suggestion: "store-admin-2" });
        expect(isSlugFree).not.toHaveBeenCalled();
    });

    it("limits checks per client IP", async () => {
        consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: null, retryAfterSeconds: 60 });
        const res = await check("noor");
        expect(res.status).toBe(429);
        expect(consumeRateLimit).toHaveBeenCalledWith("slug-check:203.0.113.9", expect.any(Number), expect.any(Number));
        expect(isSlugFree).not.toHaveBeenCalled();
    });
});
