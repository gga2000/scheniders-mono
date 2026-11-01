import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

// =====================================================================
// Piece 1: the instant WhatsApp confirmation is queued for an order THIS
// call created, and for nothing else. A replay (pre-lookup or the RPC's
// idempotent_replay), a draft-view test order, a failed insert and a priced-
// out cart queue nothing.
// =====================================================================

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceClient: vi.fn() }));
vi.mock("@/lib/capi", () => ({ sendPurchaseCapi: vi.fn() }));
vi.mock("@/lib/draft-view", () => ({ isDraftViewRequest: vi.fn(async () => false) }));
vi.mock("@/lib/order-confirmation-queue", () => ({ queueOrderConfirmation: vi.fn() }));
// The checkout rate limit has its own suite (checkout-rate-limit.test.ts).
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/checkout-rate-limit", () => ({ checkoutRateLimited: async () => null }));

import { submitCheckout } from "./checkout";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isDraftViewRequest } from "@/lib/draft-view";
import { queueOrderConfirmation } from "@/lib/order-confirmation-queue";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PERFUME = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const CREATED = "11111111-1111-4111-8111-111111111111";
const EXISTING = "22222222-2222-4222-8222-222222222222";
const KEY = "idem-key-0001";

type RpcResult = { data: unknown; error: { message: string } | null };

function tables(orders: Row[]): Record<string, Row[]> {
  return {
    tenants: [
      {
        id: TENANT,
        status: "active",
        restrictions: null,
        store_config_v2: { commerce: { shipping: { default_rate: { fee_iqd: 5000 } } } },
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
        stock_quantity: 50,
        reserved_quantity: 0,
      },
    ],
    product_variants: [],
    product_tiered_pricing: [],
    product_order_bumps: [],
    abandoned_carts: [],
    orders,
  };
}

function install(opts: { orders?: Row[]; createOrder?: () => RpcResult } = {}) {
  const fake = createFakeSupabase(tables(opts.orders ?? []), {
    rpc: {
      create_storefront_order:
        opts.createOrder ??
        (() => ({
          data: { id: CREATED, order_id: "SH-0001", price: 35000, discount_amount: 0, delivery_fee: 5000 },
          error: null,
        })),
    },
  });
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const customer = {
  customer_name: "Ali Hassan",
  phone: "07701234567",
  governorate_code: "BG",
  city: "Baghdad",
  address_details: "Karrada",
};

function line(price = 35000) {
  return { product_id: PERFUME, variant_id: null, name: "client name", variant_name: null, price, quantity: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isDraftViewRequest).mockResolvedValue(false);
});

describe("submitCheckout queues the instant WhatsApp confirmation", () => {
  it("for the order it just created, by id and tenant", async () => {
    install();
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line()] });
    expect(res.success).toBe(true);
    expect(queueOrderConfirmation).toHaveBeenCalledTimes(1);
    expect(queueOrderConfirmation).toHaveBeenCalledWith({ id: CREATED, tenantId: TENANT });
  });

  it("for a first submit carrying an idempotency key", async () => {
    install();
    const res = await submitCheckout({ tenantId: TENANT, idempotencyKey: KEY, customer, items: [line()] });
    expect(res.success).toBe(true);
    expect(queueOrderConfirmation).toHaveBeenCalledWith({ id: CREATED, tenantId: TENANT });
  });

  it("never for a replay the pre-lookup answers", async () => {
    const fake = install({
      orders: [
        {
          id: EXISTING,
          tenant_id: TENANT,
          idempotency_key: KEY,
          order_id: "SH-0007",
          price: 35000,
          discount_amount: 0,
          delivery_fee: 5000,
        },
      ],
    });
    const res = await submitCheckout({ tenantId: TENANT, idempotencyKey: KEY, customer, items: [line()] });
    expect(res).toMatchObject({ success: true, orderId: EXISTING, replayed: true });
    expect(fake.rpcCalls.some((c) => c.fn === "create_storefront_order")).toBe(false);
    expect(queueOrderConfirmation).not.toHaveBeenCalled();
  });

  it("never for a concurrent replay the RPC reports", async () => {
    install({
      createOrder: () => ({
        data: {
          id: EXISTING,
          order_id: "SH-0007",
          price: 35000,
          discount_amount: 0,
          delivery_fee: 5000,
          idempotent_replay: true,
        },
        error: null,
      }),
    });
    const res = await submitCheckout({ tenantId: TENANT, idempotencyKey: KEY, customer, items: [line()] });
    expect(res).toMatchObject({ success: true, orderId: EXISTING, replayed: true });
    expect(queueOrderConfirmation).not.toHaveBeenCalled();
  });

  it("never for a draft-view test order", async () => {
    vi.mocked(isDraftViewRequest).mockResolvedValue(true);
    const fake = install();
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line()] });
    expect(res.success).toBe(true);
    expect(fake.writes.some((w) => w.table === "orders" && w.payload.is_test === true)).toBe(true);
    expect(queueOrderConfirmation).not.toHaveBeenCalled();
  });

  it("never when the insert fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    install({ createOrder: () => ({ data: null, error: { message: "insert failed" } }) });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line()] });
    expect(res.success).toBe(false);
    expect(queueOrderConfirmation).not.toHaveBeenCalled();
  });

  it("never when the server rejects the prices", async () => {
    install();
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(1)] });
    expect(res.success).toBe(false);
    expect(queueOrderConfirmation).not.toHaveBeenCalled();
  });
});
