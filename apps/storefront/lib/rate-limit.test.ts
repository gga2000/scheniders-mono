import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({ rpc }),
}));

import { clientIp, consumeRateLimit } from "./rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("consumeRateLimit", () => {
  it("passes the limiter's verdict through, with seconds until reset", async () => {
    const reset = new Date(Date.now() + 90_000).toISOString();
    rpc.mockResolvedValue({ data: [{ allowed: false, remaining: 0, reset_at: reset }], error: null });
    const r = await consumeRateLimit("k", 5, 60, "fail-closed");
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", { _key: "k", _limit: 5, _window_seconds: 60 });
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(80);
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(90);
  });

  it("fail-closed refuses when the limiter is unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await consumeRateLimit("k", 5, 60, "fail-closed")).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 0 });
  });

  it("fail-open serves, and logs, when the limiter is unavailable", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await consumeRateLimit("k", 5, 60, "fail-open")).toEqual({ allowed: true, remaining: 5, retryAfterSeconds: 0 });
    expect(console.error).toHaveBeenCalled();
  });
});

describe("clientIp", () => {
  it("takes the first forwarded hop, then x-real-ip, else unknown", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
