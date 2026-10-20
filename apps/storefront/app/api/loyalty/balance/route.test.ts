import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import * as route from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT = "0e0e0e0e-b5a6-4789-8f12-cd34ef567890";
const PHONE = "07701234567";
const ORDER_NUMBER = "4260910007";

type RpcHandler = (args: Row) => { data: unknown; error: { message: string } | null };

const allowed: RpcHandler = () => ({
  data: [{ allowed: true, remaining: 5, reset_at: new Date(Date.now() + 60_000).toISOString() }],
  error: null,
});
/** lookup_order: the phone owns ORDER_NUMBER in TENANT, nothing else. */
const owns: RpcHandler = (args) => ({
  data:
    args.p_tenant_id === TENANT && args.p_order_number === ORDER_NUMBER && String(args.p_phone).endsWith("7701234567")
      ? [{ order_number: ORDER_NUMBER, status: "delivered" }]
      : [],
  error: null,
});

function install(rpc: Record<string, RpcHandler> = {}) {
  const fake = createFakeSupabase(
    {
      customer_points: [
        { tenant_id: TENANT, phone: PHONE, balance: 40 },
        { tenant_id: OTHER_TENANT, phone: PHONE, balance: 900 },
      ],
    },
    { rpc: { consume_rate_limit: allowed, lookup_order: owns, ...rpc } },
  );
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://x/api/loyalty/balance", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const body = (over: Record<string, unknown> = {}) => ({
  tenant_id: TENANT,
  phone: PHONE,
  order_number: ORDER_NUMBER,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/api/loyalty/balance", () => {
  it("no longer answers a GET with a phone in the query string", () => {
    // The old GET returned any phone's balance to anyone.
    expect("GET" in route).toBe(false);
  });

  it("requires an order of that phone as proof — a phone alone gets nothing", async () => {
    const fake = install();
    const res = await route.POST(req({ tenant_id: TENANT, phone: PHONE }));
    expect(res.status).toBe(400);
    expect(fake.rpcCalls.filter((c) => c.fn === "lookup_order")).toEqual([]);
  });

  it("returns the balance when the phone owns the order", async () => {
    const fake = install();
    const res = await route.POST(req(body({ phone: "0770 123 4567", order_number: ` ${ORDER_NUMBER} ` })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ balance: 40 });
    expect(fake.rpcCalls.find((c) => c.fn === "lookup_order")?.args).toEqual({
      p_tenant_id: TENANT,
      p_phone: PHONE,
      p_order_number: ORDER_NUMBER,
    });
  });

  it("404s, without reading the balance, when the phone does not own the order", async () => {
    install();
    const wrongPhone = await route.POST(req(body({ phone: "07709999999" })));
    const wrongOrder = await route.POST(req(body({ order_number: "4260910008" })));
    const wrongTenant = await route.POST(req(body({ tenant_id: OTHER_TENANT })));
    for (const res of [wrongPhone, wrongOrder, wrongTenant]) {
      expect(res.status).toBe(404);
      expect(await res.json()).not.toHaveProperty("balance");
    }
  });

  it("answers the same 404 whether or not the phone has points", async () => {
    install({ lookup_order: () => ({ data: [], error: null }) });
    const res = await route.POST(req(body()));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns 0 for an owner who has no points row yet", async () => {
    install();
    const fake = createFakeSupabase({ customer_points: [] }, { rpc: { consume_rate_limit: allowed, lookup_order: owns } });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
    const res = await route.POST(req(body()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ balance: 0 });
  });

  it("limits per IP, per order and per hashed phone, fail-closed, before the ownership check", async () => {
    const fake = install();
    await route.POST(req(body(), { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    const keys = fake.rpcCalls.filter((c) => c.fn === "consume_rate_limit").map((c) => String(c.args._key));
    expect(keys).toContain("loyalty:ip:203.0.113.7");
    expect(keys).toContain(`loyalty:order:${TENANT}:${ORDER_NUMBER}`);
    expect(keys.some((k) => k.startsWith("loyalty:phone:"))).toBe(true);
    expect(keys.join(" ")).not.toContain("7701234567");
  });

  it("429s with Retry-After when a bucket is exhausted, and does not check ownership", async () => {
    const fake = install({
      consume_rate_limit: () => ({
        data: [{ allowed: false, remaining: 0, reset_at: new Date(Date.now() + 120_000).toISOString() }],
        error: null,
      }),
    });
    const res = await route.POST(req(body()));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(fake.rpcCalls.filter((c) => c.fn === "lookup_order")).toEqual([]);
  });

  it("refuses when the limiter is unavailable (fail-closed)", async () => {
    const fake = install({ consume_rate_limit: () => ({ data: null, error: { message: "down" } }) });
    const res = await route.POST(req(body()));
    expect(res.status).toBe(429);
    expect(fake.rpcCalls.filter((c) => c.fn === "lookup_order")).toEqual([]);
  });

  it("503s when the ownership check itself fails, rather than answering 'not found'", async () => {
    install({ lookup_order: () => ({ data: null, error: { message: "boom" } }) });
    const res = await route.POST(req(body()));
    expect(res.status).toBe(503);
  });

  it("400s on a malformed body or a phone that is not an Iraqi mobile", async () => {
    install();
    expect((await route.POST(req({ tenant_id: "nope", phone: PHONE, order_number: ORDER_NUMBER }))).status).toBe(400);
    expect((await route.POST(req(body({ order_number: "   " })))).status).toBe(400);
    expect((await route.POST(req(body({ phone: "12345" })))).status).toBe(400);
  });
});
