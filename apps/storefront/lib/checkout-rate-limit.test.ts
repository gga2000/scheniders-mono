import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({ rpc }),
}));

import {
  checkoutRateLimited,
  CHECKOUT_LIMIT_PER_IP,
  CHECKOUT_LIMIT_PER_PHONE,
  CHECKOUT_WINDOW_SECONDS_PER_IP,
  CHECKOUT_WINDOW_SECONDS_PER_PHONE,
} from "./checkout-rate-limit";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PHONE = "07701234567";

function verdict(allowed: boolean, resetInSeconds = 300) {
  return { data: [{ allowed, remaining: allowed ? 1 : 0, reset_at: new Date(Date.now() + resetInSeconds * 1000).toISOString() }], error: null };
}

type LimiterArgs = { _key: string; _limit: number; _window_seconds: number };
function calls(): LimiterArgs[] {
  return rpc.mock.calls.map((c) => c[1] as LimiterArgs);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("checkoutRateLimited", () => {
  it("consumes one IP bucket and one hashed (tenant, phone) bucket", async () => {
    rpc.mockResolvedValue(verdict(true));
    const r = await checkoutRateLimited(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), TENANT, PHONE);
    expect(r).toBeNull();
    const [ip, phone] = calls();
    expect(ip).toEqual({ _key: "checkout:ip:203.0.113.7", _limit: CHECKOUT_LIMIT_PER_IP, _window_seconds: CHECKOUT_WINDOW_SECONDS_PER_IP });
    expect(phone._key).toMatch(/^checkout:phone:[0-9a-f]{32}$/);
    expect(phone._key).not.toContain("7701234567");
    expect(phone).toMatchObject({ _limit: CHECKOUT_LIMIT_PER_PHONE, _window_seconds: CHECKOUT_WINDOW_SECONDS_PER_PHONE });
  });

  it("keys the phone per tenant and on its last ten digits", async () => {
    rpc.mockResolvedValue(verdict(true));
    await checkoutRateLimited(new Headers(), TENANT, "07701234567");
    await checkoutRateLimited(new Headers(), TENANT, "+964 770 123 4567");
    await checkoutRateLimited(new Headers(), "0e0e0e0e-b5a6-4789-8f12-cd34ef567890", "07701234567");
    const keys = calls().map((c) => c._key);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("skips the IP bucket when the edge gave no address", async () => {
    rpc.mockResolvedValue(verdict(true));
    await checkoutRateLimited(new Headers(), TENANT, PHONE);
    expect(calls().map((c) => c._key.split(":")[1])).toEqual(["phone"]);
  });

  it("returns the longest wait when a bucket is exhausted", async () => {
    rpc.mockImplementation(async (_fn: string, args: LimiterArgs) =>
      args._key.startsWith("checkout:ip:") ? verdict(true) : verdict(false, 1800));
    const r = await checkoutRateLimited(new Headers({ "x-real-ip": "198.51.100.4" }), TENANT, PHONE);
    expect(r).toBeGreaterThan(1790);
    expect(r).toBeLessThanOrEqual(1800);
  });

  it("lets the order through when the limiter is down (fail-open)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await checkoutRateLimited(new Headers({ "x-real-ip": "198.51.100.4" }), TENANT, PHONE)).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });

  it("keeps the limits generous enough for shoppers behind one carrier address", () => {
    // At least one order every 30 s from a single address, and room for a
    // shopper to correct an order a few times.
    expect(CHECKOUT_LIMIT_PER_IP / CHECKOUT_WINDOW_SECONDS_PER_IP).toBeGreaterThanOrEqual(1 / 30);
    expect(CHECKOUT_LIMIT_PER_PHONE).toBeGreaterThanOrEqual(3);
  });
});
