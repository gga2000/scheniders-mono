import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";

const { createSupabasePublicClient } = await import("./server");

describe("public client read health", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("stays healthy on a 2xx answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
    const health = { failed: false };
    await createSupabasePublicClient(health).from("products").select("id");
    expect(health.failed).toBe(false);
  });

  it("stays healthy when the database refuses the query (4xx)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ code: "42703", message: "x" }), { status: 400 })),
    );
    const health = { failed: false };
    await createSupabasePublicClient(health).from("products").select("id");
    expect(health.failed).toBe(false);
  });

  it("marks a 5xx answer as failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const health = { failed: false };
    await createSupabasePublicClient(health).from("products").select("id");
    expect(health.failed).toBe(true);
  });

  it("marks a fetch that never answers (timeout) as failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }),
    );
    const health = { failed: false };
    // postgrest-js retries a failed GET with 1s/2s/4s backoff before giving up.
    vi.useFakeTimers();
    const pending = createSupabasePublicClient(health).from("products").select("id").then((r) => r);
    await vi.runAllTimersAsync();
    const { error } = await pending;
    vi.useRealTimers();
    expect(error).not.toBeNull();
    expect(health.failed).toBe(true);
  });
});
