import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpc, consumeRateLimit } = vi.hoisted(() => ({ rpc: vi.fn(), consumeRateLimit: vi.fn() }));
// lookup_order is EXECUTE-granted to service_role only (migration
// 20261021090300): called with the anon key it is a limiter-free oracle. The
// route must go through the service client; any other client is a failure.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(() => ({ rpc })),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    throw new Error("lookup_order must be called with the service client");
  }),
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...actual, consumeRateLimit };
});

import { POST } from "./route";

const TENANT = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://x/api/orders/lookup", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const ok = { allowed: true, remaining: 5, retryAfterSeconds: 0 };
const ROW = {
  order_number: "4260910007",
  status: "shipped",
  customer_name: "علي",
  governorate: "BG",
  stage: "shipped",
  review_product_slug: "fusion",
};

beforeEach(() => {
  vi.clearAllMocks();
  consumeRateLimit.mockResolvedValue(ok);
});

describe("POST /api/orders/lookup", () => {
  it("400s without both an order number and a phone, before touching the limiter or the RPC", async () => {
    expect((await POST(req({ tenant_id: TENANT, order_number: "4260910007" }))).status).toBe(400);
    expect((await POST(req({ tenant_id: TENANT, phone: "07701234567" }))).status).toBe(400);
    expect((await POST(req({ tenant_id: "nope", order_number: "1", phone: "07701234567" }))).status).toBe(400);
    expect((await POST(req({ tenant_id: TENANT, order_number: "   ", phone: "07701234567" }))).status).toBe(400);
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes tenant, phone and order number to lookup_order, and returns only the public fields", async () => {
    rpc.mockResolvedValue({ data: [{ ...ROW, phone: "07701234567", total: 99 }], error: null });
    const res = await POST(req({ tenant_id: TENANT, order_number: "4260910007", phone: "0770 123 4567" }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("lookup_order", {
      p_tenant_id: TENANT,
      p_phone: "0770 123 4567",
      p_order_number: "4260910007",
    });
    // Whatever the RPC returns, the response is the fixed allow-list.
    expect(Object.keys(await res.json()).sort()).toEqual(
      ["customer_name", "governorate", "order_number", "review_product_slug", "stage", "status"].sort(),
    );
  });

  it("404s when the phone does not own the order", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const res = await POST(req({ tenant_id: TENANT, order_number: "4260910007", phone: "07709999999" }));
    expect(res.status).toBe(404);
  });

  it("limits per IP, per order and per hashed phone — never keying on the raw number", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await POST(req({ tenant_id: TENANT, order_number: "4260910007", phone: "07701234567" }, { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    const keys = consumeRateLimit.mock.calls.map((c) => String(c[0]));
    expect(keys).toContain("track:ip:203.0.113.7");
    expect(keys).toContain(`track:order:${TENANT}:4260910007`);
    expect(keys.some((k) => k.startsWith("track:phone:"))).toBe(true);
    expect(keys.join(" ")).not.toContain("7701234567");
    // Every bucket states its failure mode; tracking fails open.
    for (const call of consumeRateLimit.mock.calls) expect(call[3]).toBe("fail-open");
  });

  it("skips the per-IP bucket when the edge reports no address", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await POST(req({ tenant_id: TENANT, order_number: "4260910007", phone: "07701234567" }));
    const keys = consumeRateLimit.mock.calls.map((c) => String(c[0]));
    expect(keys.some((k) => k.startsWith("track:ip:"))).toBe(false);
    expect(keys).toHaveLength(2);
  });

  it("buckets the same phone together however it is typed", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await POST(req({ tenant_id: TENANT, order_number: "1", phone: "07701234567" }));
    await POST(req({ tenant_id: TENANT, order_number: "2", phone: "+964 770 123 4567" }));
    const phoneKeys = consumeRateLimit.mock.calls.map((c) => String(c[0])).filter((k) => k.startsWith("track:phone:"));
    expect(phoneKeys).toHaveLength(2);
    expect(phoneKeys[0]).toBe(phoneKeys[1]);
  });

  it("429s with Retry-After, without calling the RPC, when any bucket is exhausted", async () => {
    consumeRateLimit
      .mockResolvedValueOnce(ok)
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 120 })
      .mockResolvedValueOnce(ok);
    const res = await POST(req({ tenant_id: TENANT, order_number: "4260910007", phone: "07701234567" }, { "x-real-ip": "198.51.100.2" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(rpc).not.toHaveBeenCalled();
  });
});
