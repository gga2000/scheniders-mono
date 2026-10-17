import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import { POST as mint } from "./code/route";
import { GET as validate } from "./validate/route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { signUpsellProof } from "@/lib/order-upsell-proof";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT = "0e0e0e0e-b5a6-4789-8f12-cd34ef567890";
const ORDER = "11111111-1111-4111-8111-111111111111";
const SECRET = "proof-root";

const program = {
  commerce: {
    referral: { enabled: true, friend_discount_pct: 10, friend_max_discount_iqd: 5000, referrer_points: 50 },
    loyalty: { enabled: true },
  },
};

function tables(over: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    tenants: [
      { id: TENANT, store_config_v2: program },
      { id: OTHER_TENANT, store_config_v2: program },
    ],
    orders: [{ id: ORDER, tenant_id: TENANT, phone: "07701234567", deleted_at: null }],
    ...over,
  };
}

type RpcHandlers = Record<string, (args: Row) => { data: unknown; error: { message: string } | null }>;
const allow: RpcHandlers = {
  consume_rate_limit: () => ({ data: [{ allowed: true, remaining: 10, reset_at: new Date().toISOString() }], error: null }),
};

function install(t: Record<string, Row[]>, rpc: RpcHandlers = {}) {
  const fake = createFakeSupabase(t, { rpc: { ...allow, ...rpc } });
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/referral/code", () => {
  const req = (body: unknown, proof?: string) =>
    new Request("http://x/api/referral/code", {
      method: "POST",
      headers: { "content-type": "application/json", ...(proof ? { "x-upsell-proof": proof } : {}) },
      body: JSON.stringify(body),
    });
  const proofFor = (tenantId: string, orderId: string) => signUpsellProof({ tenantId, orderId }, SECRET);
  const mintCalls = (fake: ReturnType<typeof install>) => fake.rpcCalls.filter((c) => c.fn === "mint_referral_code");

  it("mints for the browser holding the checkout's proof, for the ORDER's phone", async () => {
    const fake = install(tables(), { mint_referral_code: () => ({ data: "AB3K7M", error: null }) });
    const res = await mint(req({ order_id: ORDER }, proofFor(TENANT, ORDER)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: "AB3K7M" });
    expect(mintCalls(fake)).toEqual([
      { fn: "mint_referral_code", args: { _tenant_id: TENANT, _phone: "07701234567" } },
    ]);
  });

  it("an order id and the phone it was placed with are not enough", async () => {
    // Both travel well beyond the buyer's browser (merchant tools, webhooks,
    // the courier), and a code is worth points.
    const fake = install(tables(), { mint_referral_code: () => ({ data: "AB3K7M", error: null }) });
    const res = await mint(req({ tenant_id: TENANT, order_id: ORDER, phone: "07701234567" }));
    expect(res.status).toBe(404);
    expect(mintCalls(fake)).toEqual([]);
  });

  it("refuses a forged proof, and a proof for a different order", async () => {
    const fake = install(tables(), { mint_referral_code: () => ({ data: "AB3K7M", error: null }) });
    const forged = signUpsellProof({ tenantId: TENANT, orderId: ORDER }, "not-the-secret");
    expect((await mint(req({ order_id: ORDER }, forged))).status).toBe(404);
    const other = proofFor(TENANT, "22222222-2222-4222-8222-222222222222");
    expect((await mint(req({ order_id: ORDER }, other))).status).toBe(404);
    expect(mintCalls(fake)).toEqual([]);
  });

  it("takes the tenant from the proof — another store's proof cannot reach this order", async () => {
    const fake = install(tables(), { mint_referral_code: () => ({ data: "AB3K7M", error: null }) });
    const res = await mint(req({ order_id: ORDER }, proofFor(OTHER_TENANT, ORDER)));
    expect(res.status).toBe(404);
    expect(mintCalls(fake)).toEqual([]);
  });

  it("is 404 for a deleted order, or a store with referrals off", async () => {
    let fake = install(
      tables({ orders: [{ id: ORDER, tenant_id: TENANT, phone: "07701234567", deleted_at: "2026-01-01" }] }),
    );
    expect((await mint(req({ order_id: ORDER }, proofFor(TENANT, ORDER)))).status).toBe(404);
    fake = install(tables({ tenants: [{ id: TENANT, store_config_v2: { commerce: {} } }] }));
    expect((await mint(req({ order_id: ORDER }, proofFor(TENANT, ORDER)))).status).toBe(404);
    expect(mintCalls(fake)).toEqual([]);
  });
});

describe("GET /api/referral/validate", () => {
  const req = (q: Record<string, string>, ip = "203.0.113.7") =>
    new Request(`http://x/api/referral/validate?${new URLSearchParams(q)}`, {
      headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
    });
  const checkCalls = (fake: ReturnType<typeof install>) => fake.rpcCalls.filter((c) => c.fn === "referral_check");

  it("returns the friend's terms for an eligible code, checked in this tenant for this phone", async () => {
    const fake = install(tables(), {
      referral_check: () => ({ data: [{ ok: true, reason: "ok", referrer_phone: "07701111111" }], error: null }),
    });
    const res = await validate(req({ tenant_id: TENANT, code: "ab3k 7m", phone: "+964 770 222 2222" }));
    const body = await res.json();
    expect(body).toEqual({ valid: true, friend_discount_pct: 10, friend_max_discount_iqd: 5000 });
    expect(JSON.stringify(body)).not.toContain("0770111");
    expect(checkCalls(fake)).toEqual([
      { fn: "referral_check", args: { _tenant_id: TENANT, _code: "AB3K7M", _phone: "07702222222" } },
    ]);
  });

  it("answers nothing about the person holding a phone number", async () => {
    // "self" would say which number owns the code; "not_first_order" that the
    // number has ordered here. Both collapse to one answer.
    for (const reason of ["self", "not_first_order"]) {
      install(tables(), {
        referral_check: () => ({ data: [{ ok: false, reason, referrer_phone: "07701111111" }], error: null }),
      });
      const body = await (await validate(req({ tenant_id: TENANT, code: "AB3K7M", phone: "07709999999" }))).json();
      expect(body).toEqual({ valid: false, reason: "ineligible" });
    }
  });

  it("is 'off' when the program is off, 'unknown' for a malformed code", async () => {
    install(tables({ tenants: [{ id: TENANT, store_config_v2: { commerce: {} } }] }));
    expect(await (await validate(req({ tenant_id: TENANT, code: "AB3K7M" }))).json()).toEqual({ valid: false, reason: "off" });
    expect(await (await validate(req({ tenant_id: TENANT, code: "0O1I" }))).json()).toEqual({ valid: false, reason: "unknown" });
  });

  it("bounds code guessing per caller: every guess spends from one window", async () => {
    // Each guess is a different code, so a per-code window alone never fills.
    const counts = new Map<string, number>();
    const fake = install(tables(), {
      consume_rate_limit: (args) => {
        const key = String(args._key);
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        return { data: [{ allowed: n <= Number(args._limit), remaining: 0, reset_at: new Date().toISOString() }], error: null };
      },
      referral_check: () => ({ data: [{ ok: false, reason: "unknown", referrer_phone: null }], error: null }),
    });
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      const code = `AAAA${alphabet[i]}${alphabet[i + 1]}`;
      statuses.push((await validate(req({ tenant_id: TENANT, code }))).status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(20);
    expect(statuses.slice(20)).toEqual([429, 429, 429, 429, 429]);
    // Refused guesses never reach the lookup.
    expect(checkCalls(fake)).toHaveLength(20);
  });

  it("fails closed when the limiter cannot answer", async () => {
    const fake = install(tables(), {
      consume_rate_limit: () => ({ data: null, error: { message: "down" } }),
      referral_check: () => ({ data: [{ ok: true, reason: "ok", referrer_phone: "07701111111" }], error: null }),
    });
    expect((await validate(req({ tenant_id: TENANT, code: "AB3K7M" }))).status).toBe(429);
    expect(checkCalls(fake)).toEqual([]);
  });
});
