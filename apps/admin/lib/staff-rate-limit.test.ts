import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => ({ rpc }) }));
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException }));

const { STAFF_LIMITS, staffRateLimit, tooManyWords } = await import("./staff-rate-limit");

const STAFF = "aaaaaaaa-1111-4222-8333-444444444444";
const NOW = Date.parse("2026-11-23T08:00:00Z");
/** What consume_rate_limit answers, as `.single()` gives it. */
const answers = (data: unknown, error: { message: string } | null = null) =>
  rpc.mockReturnValue({ single: async () => ({ data, error }) });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  rpc.mockReset();
  captureException.mockClear();
});
afterEach(() => vi.useRealTimers());

/*
 * Round 25 (security item 18): the costly and bulk console steps had no limit.
 */
describe("staffRateLimit", () => {
  it("counts the step for the signed-in staff login, with that step's limit and window", async () => {
    answers({ allowed: true, remaining: 19, reset_at: "2026-11-23T08:10:00Z" });
    expect(await staffRateLimit(STAFF, "analyze-profile")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", {
      _key: `console:analyze-profile:${STAFF}`,
      _limit: STAFF_LIMITS["analyze-profile"].limit,
      _window_seconds: STAFF_LIMITS["analyze-profile"].windowSeconds,
    });
  });

  it("answers 429 past the limit, with the wait in words and in Retry-After", async () => {
    answers({ allowed: false, remaining: 0, reset_at: "2026-11-23T08:04:30Z" });
    const refused = await staffRateLimit(STAFF, "export");
    expect(refused?.status).toBe(429);
    expect(refused?.headers.get("Retry-After")).toBe("270");
    expect(await refused?.json()).toEqual({ error: "Too many of these in a short time. Wait 5 minutes, then try again." });
  });

  it("lets the step go ahead when the counter cannot answer, and tells Sentry", async () => {
    answers(null, { message: "connection refused" });
    expect(await staffRateLimit(STAFF, "top-up")).toBeNull();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("says a wait of a minute or less as a minute", () => {
    expect(tooManyWords(1)).toBe("Too many of these in a short time. Wait a minute, then try again.");
    expect(tooManyWords(60)).toBe("Too many of these in a short time. Wait a minute, then try again.");
    expect(tooManyWords(61)).toBe("Too many of these in a short time. Wait 2 minutes, then try again.");
  });
});
