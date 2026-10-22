import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

// =====================================================================
// Loyalty at checkout: redeem only with proof, earn on delivery.
// =====================================================================
// Points are credited by the database (trg_loyalty_order_changed) when an
// order reaches delivered/completed, and reversed if it leaves that state.
// A credit at placement as well would pay a cash-on-delivery order that is
// never delivered — and, once it is, pay it twice over the same ledger.
//
// Redemption needs a previous order number of the phone in this store,
// re-checked by lookup_order (lib/loyalty-proof): the phone number alone is
// not a secret, so anyone who knows a customer's number could otherwise spend
// their points as a discount on their own order.
// =====================================================================

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/capi", () => ({ sendPurchaseCapi: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.7" })),
}));

import { submitCheckout } from "./checkout";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT = "0e0e0e0e-b5a6-4789-8f12-cd34ef567890";
const PERFUME = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const ORDER = "11111111-1111-4111-8111-111111111111";
const PREVIOUS_ORDER = "4260910007";

type RpcHandler = (args: Row) => { data: unknown; error: { message: string } | null };

const allowed: RpcHandler = () => ({
  data: [{ allowed: true, remaining: 5, reset_at: new Date(Date.now() + 60_000).toISOString() }],
  error: null,
});
/** lookup_order: the shopper's phone placed PREVIOUS_ORDER in TENANT, nothing else. */
const owns: RpcHandler = (args) => ({
  data:
    args.p_tenant_id === TENANT && args.p_order_number === PREVIOUS_ORDER && args.p_phone === "07701234567"
      ? [{ order_number: PREVIOUS_ORDER, status: "delivered" }]
      : [],
  error: null,
});

function tables(balance = 0, tenantId = TENANT): Record<string, Row[]> {
  return {
    tenants: [
      {
        id: tenantId,
        status: "active",
        restrictions: null,
        store_config_v2: {
          commerce: {
            shipping: { default_rate: { fee_iqd: 5000 } },
            loyalty: { enabled: true, earn_per_iqd: 0.001, redeem_value_iqd: 1, max_redeem_pct: 100 },
          },
        },
      },
    ],
    products: [
      {
        id: PERFUME,
        tenant_id: tenantId,
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
    customer_points: balance > 0 ? [{ tenant_id: tenantId, phone: "07701234567", balance }] : [],
  };
}

function install(t: Record<string, Row[]>, rpc: Record<string, RpcHandler> = {}) {
  const fake = createFakeSupabase(t, {
    rpc: {
      create_order_atomic: () => ({ data: { id: ORDER, order_id: "SH-0001" }, error: null }),
      consume_rate_limit: allowed,
      lookup_order: owns,
      ...rpc,
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

const pointsCalls = (fake: ReturnType<typeof install>) =>
  fake.rpcCalls
    .filter((c) => c.fn === "adjust_customer_points")
    .map((c) => [c.args._reason, c.args._delta]);

const placedOrder = (fake: ReturnType<typeof install>) =>
  fake.rpcCalls.find((c) => c.fn === "create_order_atomic")?.args._order_data as
    | { price: number; discount_amount: number }
    | undefined;

beforeEach(() => vi.clearAllMocks());

describe("loyalty at checkout", () => {
  it("credits no points when the order is placed — delivery does", async () => {
    const fake = install(tables());
    const res = await submitCheckout({ tenantId: TENANT, customer, items });
    expect(res.success).toBe(true);
    expect(pointsCalls(fake)).toEqual([]);
  });

  it("redeems with a previous order of that phone in this store, priced into the recorded discount", async () => {
    const fake = install(tables(3000));
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items,
      redeemPoints: 3000,
      loyaltyOrderNumber: ` ${PREVIOUS_ORDER} `,
    });
    expect(res.success).toBe(true);
    // The proof was re-checked server-side, for this tenant and this phone.
    expect(fake.rpcCalls.find((c) => c.fn === "lookup_order")?.args).toEqual({
      p_tenant_id: TENANT,
      p_phone: "07701234567",
      p_order_number: PREVIOUS_ORDER,
    });
    expect(pointsCalls(fake)).toEqual([["redeem", -3000]]);
    expect(placedOrder(fake)?.discount_amount).toBe(3000);
    // NEW-P1-12: price is recorded net of the discount.
    expect(placedOrder(fake)?.price).toBe(35000 - 3000);
    expect(res.total).toBe(35000 - 3000 + 5000);
  });

  it("refuses a redemption backed only by the phone number — no points move, no order", async () => {
    const fake = install(tables(3000));
    const res = await submitCheckout({ tenantId: TENANT, customer, items, redeemPoints: 3000 });
    expect(res.success).toBe(false);
    expect(pointsCalls(fake)).toEqual([]);
    // Refused before any RPC runs.
    expect(fake.rpcCalls).toEqual([]);
  });

  it("refuses a redemption whose order number is not that phone's", async () => {
    const fake = install(tables(3000));
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items,
      redeemPoints: 3000,
      loyaltyOrderNumber: "4260910008",
    });
    expect(res.success).toBe(false);
    expect(pointsCalls(fake)).toEqual([]);
    expect(fake.rpcCalls.some((c) => c.fn === "create_order_atomic")).toBe(false);
  });

  it("refuses an order number from another store, even for the same phone", async () => {
    // The phone's previous order is in TENANT; the redemption is in OTHER_TENANT.
    const fake = install(tables(3000, OTHER_TENANT));
    const res = await submitCheckout({
      tenantId: OTHER_TENANT,
      customer,
      items,
      redeemPoints: 3000,
      loyaltyOrderNumber: PREVIOUS_ORDER,
    });
    expect(res.success).toBe(false);
    expect(fake.rpcCalls.find((c) => c.fn === "lookup_order")?.args.p_tenant_id).toBe(OTHER_TENANT);
    expect(pointsCalls(fake)).toEqual([]);
    expect(fake.rpcCalls.some((c) => c.fn === "create_order_atomic")).toBe(false);
  });

  it("refuses, without checking ownership, when the proof limiter is exhausted or down", async () => {
    const fake = install(tables(3000), {
      consume_rate_limit: () => ({ data: null, error: { message: "down" } }),
    });
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items,
      redeemPoints: 3000,
      loyaltyOrderNumber: PREVIOUS_ORDER,
    });
    expect(res.success).toBe(false);
    expect(fake.rpcCalls.filter((c) => c.fn === "lookup_order")).toEqual([]);
    expect(pointsCalls(fake)).toEqual([]);
  });

  it("refuses when the ownership check itself fails", async () => {
    const fake = install(tables(3000), {
      lookup_order: () => ({ data: null, error: { message: "boom" } }),
    });
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items,
      redeemPoints: 3000,
      loyaltyOrderNumber: PREVIOUS_ORDER,
    });
    expect(res.success).toBe(false);
    expect(pointsCalls(fake)).toEqual([]);
    expect(fake.rpcCalls.some((c) => c.fn === "create_order_atomic")).toBe(false);
  });

  it("refunds the points when the order then fails", async () => {
    const fake = install(tables(3000), {
      create_order_atomic: () => ({ data: null, error: { message: "boom" } }),
    });
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items,
      redeemPoints: 3000,
      loyaltyOrderNumber: PREVIOUS_ORDER,
    });
    expect(res.success).toBe(false);
    expect(pointsCalls(fake)).toEqual([
      ["redeem", -3000],
      ["redeem_refund", 3000],
    ]);
  });

  it("a retry of the same submission does not spend points twice", async () => {
    const fake = install(tables(3000));
    const submission = {
      tenantId: TENANT,
      customer,
      items,
      idempotencyKey: "retry-key-0001",
      redeemPoints: 3000,
      loyaltyOrderNumber: PREVIOUS_ORDER,
    };
    const first = await submitCheckout(submission);
    // What create_order_atomic recorded for that key.
    const placed = placedOrder(fake);
    fake.tables.orders.push({
      id: ORDER,
      order_id: "SH-0001",
      tenant_id: TENANT,
      idempotency_key: "retry-key-0001",
      price: placed?.price ?? null,
      delivery_fee: 5000,
    });
    const retry = await submitCheckout(submission);
    expect(first.success).toBe(true);
    expect(retry.success).toBe(true);
    expect(retry.replayed).toBe(true);
    expect(pointsCalls(fake)).toEqual([["redeem", -3000]]);
  });
});
