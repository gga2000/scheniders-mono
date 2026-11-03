import { describe, it, expect, vi, beforeEach } from "vitest";

// A stand-in for Next's data cache with the one rule that matters here: a
// callback that throws stores nothing, so the last good value survives.
const store = new Map<string, unknown>();
vi.mock("next/cache", () => ({
  unstable_cache:
    <T>(fn: () => Promise<T>, keyParts: string[]) =>
    async (): Promise<T> => {
      const key = keyParts.join("|");
      if (store.has(key)) return store.get(key) as T;
      const value = await fn();
      store.set(key, value);
      return value;
    },
}));

const { cachedRead } = await import("./cached-read");

describe("cachedRead", () => {
  beforeEach(() => store.clear());

  it("caches a healthy read", async () => {
    const read = vi.fn(async () => ["envoy"]);
    expect(await cachedRead(["k"], { revalidate: 60 }, read)).toEqual(["envoy"]);
    expect(await cachedRead(["k"], { revalidate: 60 }, read)).toEqual(["envoy"]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("returns a degraded read's fallback without caching it", async () => {
    const degraded = vi.fn(async (health: { failed: boolean }) => {
      health.failed = true;
      return [] as string[];
    });
    expect(await cachedRead(["k"], { revalidate: 60 }, degraded)).toEqual([]);
    expect(store.has("k")).toBe(false);

    // The next request reads again and caches the good answer.
    const healthy = vi.fn(async () => ["envoy"]);
    expect(await cachedRead(["k"], { revalidate: 60 }, healthy)).toEqual(["envoy"]);
    expect(store.get("k")).toEqual(["envoy"]);
  });

  it("rethrows errors that are not a degraded read", async () => {
    await expect(
      cachedRead(["k"], { revalidate: 60 }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
