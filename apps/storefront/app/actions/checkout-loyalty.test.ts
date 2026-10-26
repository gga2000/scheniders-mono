import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

// =====================================================================
// Loyalty at checkout: redeem here, earn on delivery (never here).
// =====================================================================
// Points are credited by the database (trg_loyalty_order_changed) when an
// order reaches delivered/completed, and reversed if it leaves that state.
// A credit at placement as well would pay a cash-on-delivery order that is
// never delivered — and, once it is, pay it twice over the same ledger.
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

function tables(balance = 0): Record<string, Row[]> {
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
    customer_points: balance > 0 ? [{ tenant_id: TENANT, phone: "07701234567", balance }] : [],
  };
}

function install(t: Record<string, Row[]>) {
  const fake = createFakeSupabase(t, {
    rpc: { create_storefront_order: () => ({ data: { id: ORDER, order_id: "SH-0001" }, error: null }) },
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

beforeEach(() => vi.clearAllMocks());

describe("loyalty at checkout", () => {
  it("credits no points when the order is placed — delivery does", async () => {
    const fake = install(tables());
    const res = await submitCheckout({ tenantId: TENANT, customer, items });
    expect(res.success).toBe(true);
    expect(pointsCalls(fake)).toEqual([]);
  });

  it("still redeems at placement, priced into the recorded discount", async () => {
    const fake = install(tables(3000));
    const res = await submitCheckout({ tenantId: TENANT, customer, items, redeemPoints: 3000 });
    expect(res.success).toBe(true);
    expect(pointsCalls(fake)).toEqual([["redeem", -3000]]);
    const order = fake.rpcCalls.find((c) => c.fn === "create_storefront_order")?.args._order_data as
      | { discount_amount: number }
      | undefined;
    expect(order?.discount_amount).toBe(3000);
    expect(res.total).toBe(35000 - 3000 + 5000);
  });
});
