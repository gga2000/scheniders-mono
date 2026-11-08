import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ upserts: 0 }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: "t1", status: "active", store_config_v2: null }, error: null }),
        }),
      }),
      upsert: async () => {
        if (table === "newsletter_subscribers") state.upserts += 1;
        return { error: null };
      },
    }),
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "1.2.3.4",
  consumeRateLimit: vi.fn(async () => ({ allowed: true, remaining: 1, retryAfterSeconds: 0 })),
}));

import { POST } from "./route";
import { consumeRateLimit } from "@/lib/rate-limit";

const TENANT = "11111111-1111-4111-8111-111111111111";
const req = () =>
  new Request("http://x/api/newsletter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: TENANT, email: "a@example.com" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  state.upserts = 0;
});

describe("POST /api/newsletter", () => {
  it("caps sign-ups per caller and per store, fail-closed", async () => {
    await POST(req());
    expect(consumeRateLimit).toHaveBeenCalledWith("newsletter:ip:1.2.3.4", 5, 3600, "fail-closed");
    expect(consumeRateLimit).toHaveBeenCalledWith(`newsletter:store:${TENANT}`, 200, 3600, "fail-closed");
  });

  it("an exhausted caller never charges the store's bucket", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    await POST(req());
    expect(consumeRateLimit).toHaveBeenCalledTimes(1);
  });

  it("stores nothing once a cap is reached", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    const res = await POST(req());
    expect(res.status).toBe(429);
    expect(state.upserts).toBe(0);
  });
});
