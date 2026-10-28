import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

// =====================================================================
// Referral at checkout: who gets the friend's discount, and how much.
// =====================================================================
// referral_check (SQL) is the one eligibility rule: the code exists in THIS
// tenant, it is not the buyer's own, and the buyer's normalised phone has no
// earlier live order here. These tests pin what the checkout does with its
// verdict — the tenant and phone it asks about, that the discount is stacked
// under the subtotal like every other, and that the attribution row the
// delivery trigger pays the referrer from is written once, for a new order.
// =====================================================================

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/capi", () => ({ sendPurchaseCapi: vi.fn() }));
// A real shopper, not a draft-view session: the check reads the request's
// cookies, which do not exist outside a Next request scope.
vi.mock("@/lib/draft-view", () => ({
  isDraftViewRequest: vi.fn(async () => false),
}));
// The checkout rate limit has its own suite (checkout-rate-limit.test.ts).
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/checkout-rate-limit", () => ({ checkoutRateLimited: async () => null }));

import { submitCheckout } from "./checkout";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PERFUME = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const ORDER = "11111111-1111-4111-8111-111111111111";
const BUYER = "07701234567";
const REFERRER = "07709876543";

function tables(commerce: Row = {}, over: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    tenants: [
      {
        id: TENANT,
        status: "active",
        restrictions: null,
        store_config_v2: {
          commerce: {
            shipping: { default_rate: { fee_iqd: 5000 } },
            loyalty: { enabled: true, earn_per_iqd: 0.001, redeem_value_iqd: 1, max_redeem_pct: 100 },
            referral: { enabled: true, friend_discount_pct: 10, friend_max_discount_iqd: 5000, referrer_points: 50 },
            ...commerce,
          },
        },
      },
    ],
    products: [
      {
        id: PERFUME,
        tenant_id: TENANT,
        name: "Perfume",
        short_name: null,
        price: 35000,
        website_price: null,
        status: "active",
        is_visible: true,
        is_archived: false,
        is_supply: false,
      },
    ],
    product_variants: [],
    product_tiered_pricing: [],
    product_order_bumps: [],
    abandoned_carts: [],
    orders: [],
    referrals: [],
    customer_points: [{ tenant_id: TENANT, phone: BUYER, balance: 50000 }],
    ...over,
  };
}

type Verdict = { ok: boolean; reason: string; referrer_phone: string | null };

function install(t: Record<string, Row[]>, verdict: Verdict | "error" = { ok: true, reason: "ok", referrer_phone: REFERRER }) {
  const fake = createFakeSupabase(t, {
    rpc: {
      referral_check: () =>
        verdict === "error" ? { data: null, error: { message: "boom" } } : { data: [verdict], error: null },
      create_storefront_order: () => ({ data: { id: ORDER, order_id: "SH-0001" }, error: null }),
    },
  });
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const customer = {
  customer_name: "Ali Hassan",
  phone: "+964 770 123 4567",
  governorate_code: "BG",
  city: "Baghdad",
  address_details: "Street 14",
};
const items = [{ product_id: PERFUME, variant_id: null, name: "x", variant_name: null, price: 35000, quantity: 1 }];

const recorded = (fake: ReturnType<typeof install>) =>
  fake.rpcCalls.find((c) => c.fn === "create_storefront_order")?.args._order_data as
    | { discount_amount: number; price: number }
    | undefined;
const checks = (fake: ReturnType<typeof install>) => fake.rpcCalls.filter((c) => c.fn === "referral_check");
const attributions = (fake: ReturnType<typeof install>) => fake.writes.filter((w) => w.table === "referrals");

beforeEach(() => vi.clearAllMocks());

describe("referral at checkout", () => {
  it("prices the friend's discount from the published config and records who referred", async () => {
    const fake = install(tables());
    const res = await submitCheckout({ tenantId: TENANT, customer, items, referralCode: "ab3k 7m" });
    expect(res.success).toBe(true);
    // 10 % of 35,000, under the 5,000 cap.
    expect(recorded(fake)?.discount_amount).toBe(3500);
    expect(res.total).toBe(35000 - 3500 + 5000);
    expect(res.discount).toEqual({ code: "AB3K7M", amount: 3500 });
    expect(attributions(fake).map((w) => w.payload)).toEqual([
      {
        tenant_id: TENANT,
        order_id: ORDER,
        code: "AB3K7M",
        referrer_phone: REFERRER,
        referee_phone: BUYER,
        discount_iqd: 3500,
      },
    ]);
  });

  it("asks about THIS tenant and the buyer's normalised phone", async () => {
    const fake = install(tables());
    await submitCheckout({ tenantId: TENANT, customer, items, referralCode: "AB3K7M" });
    expect(checks(fake).map((c) => c.args)).toEqual([{ _tenant_id: TENANT, _code: "AB3K7M", _phone: BUYER }]);
  });

  it("gives nothing when the check refuses the buyer (own code, or not a first order)", async () => {
    for (const reason of ["self", "not_first_order", "unknown"]) {
      const fake = install(tables(), { ok: false, reason, referrer_phone: reason === "unknown" ? null : REFERRER });
      const res = await submitCheckout({ tenantId: TENANT, customer, items, referralCode: "AB3K7M" });
      expect(res.success).toBe(true);
      expect(recorded(fake)?.discount_amount).toBe(0);
      expect(res.discount).toBeUndefined();
      expect(attributions(fake)).toEqual([]);
    }
  });

  it("never pays a buyer for their own code, whatever the check says", async () => {
    const fake = install(tables(), { ok: true, reason: "ok", referrer_phone: BUYER });
    const res = await submitCheckout({ tenantId: TENANT, customer, items, referralCode: "AB3K7M" });
    expect(recorded(fake)?.discount_amount).toBe(0);
    expect(res.discount).toBeUndefined();
    expect(attributions(fake)).toEqual([]);
  });

  it("stacks under the subtotal: a 100 % friend's discount takes the lines to zero, never negative", async () => {
    const fake = install(
      tables({ referral: { enabled: true, friend_discount_pct: 100, referrer_points: 50 } }),
    );
    const res = await submitCheckout({ tenantId: TENANT, customer, items, referralCode: "AB3K7M" });
    expect(res.success).toBe(true);
    expect(recorded(fake)?.discount_amount).toBe(35000);
    // Stored net of the discount: the lines are free, the courier collects delivery.
    expect(recorded(fake)?.price).toBe(0);
    expect(res.total).toBe(5000);
  });

  it("does not stack on a coupon — and does not even look the code up", async () => {
    const fake = install(
      tables({ discounts: [{ code: "SAVE5", kind: "fixed", value: 5000 }] }),
    );
    const res = await submitCheckout({ tenantId: TENANT, customer, items, couponCode: "SAVE5", referralCode: "AB3K7M" });
    expect(res.success).toBe(true);
    expect(checks(fake)).toEqual([]);
    expect(attributions(fake)).toEqual([]);
  });

  it("fails closed when the check cannot run — before any order is placed", async () => {
    const fake = install(tables(), "error");
    const res = await submitCheckout({ tenantId: TENANT, customer, items, referralCode: "AB3K7M" });
    expect(res.success).toBe(false);
    expect(recorded(fake)).toBeUndefined();
    expect(fake.rpcCalls.filter((c) => c.fn === "adjust_customer_points")).toEqual([]);
  });

  it("is off unless the merchant turned it on", async () => {
    const fake = install(tables({ referral: { enabled: false, friend_discount_pct: 10 } }));
    const res = await submitCheckout({ tenantId: TENANT, customer, items, referralCode: "AB3K7M" });
    expect(res.success).toBe(true);
    expect(recorded(fake)?.discount_amount).toBe(0);
    expect(checks(fake)).toEqual([]);
  });

  it("an idempotent replay checks nothing and attributes nothing", async () => {
    const fake = install(
      tables({}, {
        orders: [
          { id: ORDER, order_id: "SH-0001", tenant_id: TENANT, idempotency_key: "replay-k-0001", price: 31500, discount_amount: 3500, delivery_fee: 5000 },
        ],
      }),
    );
    const res = await submitCheckout({ tenantId: TENANT, customer, items, referralCode: "AB3K7M", idempotencyKey: "replay-k-0001" });
    expect(res).toMatchObject({ success: true, orderId: ORDER, total: 36500 });
    expect(checks(fake)).toEqual([]);
    expect(attributions(fake)).toEqual([]);
  });

  it("a replay reported by the RPC attributes nothing", async () => {
    const fake = createFakeSupabase(tables(), {
      rpc: {
        referral_check: () => ({ data: [{ ok: true, reason: "ok", referrer_phone: REFERRER }], error: null }),
        create_storefront_order: () => ({
          data: { id: ORDER, order_id: "SH-0001", price: 31500, discount_amount: 3500, delivery_fee: 5000, idempotent_replay: true },
          error: null,
        }),
      },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
    const res = await submitCheckout({ tenantId: TENANT, customer, items, referralCode: "AB3K7M", idempotencyKey: "replay-k-0002" });
    expect(res.success).toBe(true);
    expect(fake.writes.filter((w) => w.table === "referrals")).toEqual([]);
  });
});
