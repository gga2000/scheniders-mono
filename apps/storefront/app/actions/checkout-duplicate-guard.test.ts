import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createFakeSupabase,
  type FakeSupabaseOptions,
  type Row,
} from "@/lib/testing/fake-supabase";

// =====================================================================
// Soft duplicate guard + retryable failures (spec 2026-10-21 §2).
// =====================================================================
// submitCheckout hands the order to create_storefront_order with the PAID
// product ids (never the server-added gift) and the window; a duplicate
// answer creates nothing, refunds a redemption, records no side effects and
// names no order. A failure the platform caused is flagged retryable (503);
// one the request caused is not (422).
// =====================================================================

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/capi", () => ({ sendPurchaseCapi: vi.fn() }));
vi.mock("@/lib/draft-view", () => ({
  isDraftViewRequest: vi.fn(async () => false),
}));
// The loyalty proof's per-IP limiter reads the request's address.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.7" })),
}));
// Piece 1's instant WhatsApp confirmation: queued for a new order only.
vi.mock("@/lib/order-confirmation-queue", () => ({ queueOrderConfirmation: vi.fn() }));
// The checkout rate limit has its own suite (checkout-rate-limit.test.ts).
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/checkout-rate-limit", () => ({ checkoutRateLimited: async () => null }));

import { submitCheckout } from "./checkout";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { queueOrderConfirmation } from "@/lib/order-confirmation-queue";
import { DUPLICATE_ORDER_WINDOW_MINUTES } from "@/lib/order-duplicate-guard";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PERFUME = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const GIFT = "c1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const NEW_ORDER = "11111111-1111-4111-8111-111111111111";
const EXISTING = "22222222-2222-4222-8222-222222222222";

function product(id: string, price: number): Row {
  return {
    id,
    tenant_id: TENANT,
    name: `Product ${id.slice(0, 4)}`,
    short_name: null,
    price,
    website_price: null,
    status: "active",
    is_visible: true,
    is_archived: false,
    is_supply: false,
    stock_quantity: 50,
    reserved_quantity: 0,
  };
}

function tables(): Record<string, Row[]> {
  return {
    tenants: [
      {
        id: TENANT,
        status: "active",
        restrictions: null,
        store_config_v2: {
          commerce: {
            shipping: { default_rate: { fee_iqd: 5000 } },
            free_gift: { enabled: true, product_id: GIFT, threshold_iqd: 60000 },
            loyalty: { enabled: true, earn_per_iqd: 0.001, redeem_value_iqd: 1, max_redeem_pct: 100 },
          },
        },
      },
    ],
    products: [product(PERFUME, 35000), product(GIFT, 12000)],
    product_variants: [],
    product_tiered_pricing: [],
    product_order_bumps: [],
    abandoned_carts: [],
    referrals: [],
    orders: [],
    customer_points: [{ tenant_id: TENANT, phone: "07701234567", balance: 2000 }],
  };
}

function install(
  t: Record<string, Row[]>,
  rpc: FakeSupabaseOptions["rpc"],
  failingTables: string[] = [],
) {
  const fake = createFakeSupabase(t, { rpc, failingTables });
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const created = () => ({ data: { id: NEW_ORDER, order_id: "SH-0001" }, error: null });

const customer = {
  customer_name: "Ali Hassan",
  phone: "07701234567",
  governorate_code: "BG",
  city: "Baghdad",
  address_details: "Street 14",
};

function line(productId: string, price: number, quantity: number) {
  return { product_id: productId, variant_id: null, name: "client name", variant_name: null, price, quantity };
}

const pointsDeltas = (fake: ReturnType<typeof install>) =>
  fake.rpcCalls
    .filter((c) => c.fn === "adjust_customer_points")
    .map((c) => [c.args._reason, c.args._delta]);

beforeEach(() => vi.clearAllMocks());

describe("submitCheckout → create_storefront_order", () => {
  it("hands over the order, its tenant, the PAID product ids (not the gift) and the window", async () => {
    const fake = install(tables(), { create_storefront_order: created });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 2)] });
    expect(res.success).toBe(true);
    const call = fake.rpcCalls.find((c) => c.fn === "create_storefront_order");
    expect(call?.args._tenant_id).toBe(TENANT);
    expect(call?.args._paid_product_ids).toEqual([PERFUME]);
    expect(call?.args._duplicate_window_minutes).toBe(DUPLICATE_ORDER_WINDOW_MINUTES);
    const order = call?.args._order_data as { items: Array<{ product_id: string }> };
    // The gift is on the order, but it is not something the buyer chose.
    expect(order.items.map((i) => i.product_id)).toEqual([PERFUME, GIFT]);
    expect(fake.rpcCalls.some((c) => c.fn === "create_order_atomic")).toBe(false);
    // A new order still gets Piece 1's confirmation through the new RPC.
    expect(queueOrderConfirmation).toHaveBeenCalledWith({ id: NEW_ORDER, tenantId: TENANT });
  });

  it("answers a duplicate with no new order's side effects and no order identifiers", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "proof-root");
    const fake = install(tables(), {
      create_storefront_order: () => ({
        data: {
          id: EXISTING,
          order_id: "SH-0007",
          price: 35000,
          discount_amount: 0,
          delivery_fee: 5000,
          idempotent_replay: true,
          duplicate_guard: true,
        },
        error: null,
      }),
      // The redemption's proof (lib/loyalty-proof): the limiter allows it and
      // the phone placed order 4260910007 in this store.
      consume_rate_limit: () => ({
        data: [{ allowed: true, remaining: 5, reset_at: new Date(Date.now() + 60_000).toISOString() }],
        error: null,
      }),
      lookup_order: () => ({ data: [{ order_number: "4260910007", status: "delivered" }], error: null }),
    });
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [line(PERFUME, 35000, 1)],
      redeemPoints: 2000,
      loyaltyOrderNumber: "4260910007",
    });
    expect(res).toEqual({ success: true, replayed: true, duplicate: true });
    // The redemption this call made is given back: no order used it.
    expect(pointsDeltas(fake)).toEqual([
      ["redeem", -2000],
      ["redeem_refund", 2000],
    ]);
    expect(fake.writes.some((w) => w.table === "abandoned_carts")).toBe(false);
    expect(fake.writes.some((w) => w.table === "referrals")).toBe(false);
    // The existing order had its WhatsApp confirmation when it was placed.
    expect(queueOrderConfirmation).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("still answers an idempotency replay as that order, not as a duplicate", async () => {
    install(tables(), {
      create_storefront_order: () => ({
        data: { id: EXISTING, order_id: "SH-0007", price: 35000, discount_amount: 0, delivery_fee: 5000, idempotent_replay: true },
        error: null,
      }),
    });
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      idempotencyKey: "k-0000-0001",
      items: [line(PERFUME, 35000, 1)],
    });
    expect(res).toMatchObject({ success: true, orderId: EXISTING, orderNumber: "SH-0007", replayed: true });
    expect(res.duplicate).toBeUndefined();
  });
});

describe("retryable failures", () => {
  it("flags a catalogue read that did not complete", async () => {
    install(tables(), { create_storefront_order: created }, ["products"]);
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(res.success).toBe(false);
    expect(res.retryable).toBe(true);
  });

  it("flags a variant read that did not complete", async () => {
    install(tables(), { create_storefront_order: created }, ["product_variants"]);
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(res.success).toBe(false);
    expect(res.retryable).toBe(true);
  });

  it("flags an order RPC that timed out", async () => {
    install(tables(), {
      create_storefront_order: () => ({
        data: null,
        error: { message: "canceling statement due to statement timeout", code: "57014" },
      }),
    });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(res.success).toBe(false);
    expect(res.retryable).toBe(true);
  });

  it("does not flag an order the database refused", async () => {
    install(tables(), {
      create_storefront_order: () => ({
        data: null,
        error: { message: "new row violates check constraint", code: "23514" },
      }),
    });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(res.success).toBe(false);
    expect(res.retryable).toBe(false);
  });

  it("does not flag a store that does not exist", async () => {
    const t = tables();
    t.tenants = [];
    install(t, { create_storefront_order: created });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(res.success).toBe(false);
    expect(res.retryable).toBeUndefined();
  });

  it("keeps line issues un-flagged (the 422 new_price self-heal)", async () => {
    install(tables(), { create_storefront_order: created });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 1, 1)] });
    expect(res.success).toBe(false);
    expect(res.issues?.[0]).toMatchObject({ reason: "price_changed", new_price: 35000 });
    expect(res.retryable).toBeUndefined();
  });
});
