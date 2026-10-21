import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeIraqiMobile } from "@scheniders/shared";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

// =====================================================================
// W6.6 — every storefront order carries the COD risk verdict
// =====================================================================
// `cod_risk_signals` (SQL) owns the rule; the checkout only stamps its
// verdict onto the order it hands create_storefront_order. Asserted on what the
// server RECORDS: the verdict rides in on the order row, it is asked for only
// once the server has verified the prices, and a failed lookup never blocks
// the order.
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

import { submitCheckout } from "./checkout";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PERFUME = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const OPEN_ORDER = "22222222-2222-4222-8222-222222222222";

function tables(): Record<string, Row[]> {
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
  };
}

type RiskResult = { data: unknown; error: { message: string } | null };

function install(risk: RiskResult) {
  const fake = createFakeSupabase(tables(), {
    rpc: {
      cod_risk_signals: () => risk,
      create_storefront_order: () => ({
        data: { id: "11111111-1111-4111-8111-111111111111", order_id: "SH-0001" },
        error: null,
      }),
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

function line(price: number) {
  return { product_id: PERFUME, variant_id: null, name: "client name", variant_name: null, price, quantity: 1 };
}

function recordedOrder(fake: ReturnType<typeof install>): Row | undefined {
  const call = fake.rpcCalls.find((c) => c.fn === "create_storefront_order");
  const data = call?.args._order_data;
  return data && typeof data === "object" ? (data as Row) : undefined;
}

beforeEach(() => vi.clearAllMocks());

describe("COD risk stamp on storefront orders", () => {
  it("asks the database for this buyer's verdict and records it on the order", async () => {
    const fake = install({
      data: {
        level: "high",
        value_tier: "newcomer",
        open_orders_24h: 1,
        duplicate_of_order_id: OPEN_ORDER,
        reasons: ["high_risk_customer", "duplicate_order", "address_incomplete"],
      },
      error: null,
    });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(35000)] });
    expect(res.success).toBe(true);

    const lookup = fake.rpcCalls.find((c) => c.fn === "cod_risk_signals");
    expect(lookup?.args).toEqual({
      _tenant_id: TENANT,
      _phone: normalizeIraqiMobile(customer.phone),
      _address: customer.address_details,
    });

    const order = recordedOrder(fake);
    expect(order?.needs_attention).toBe(true);
    expect(order?.attention_reasons).toEqual(["high_risk_customer", "duplicate_order", "address_incomplete"]);
    expect(order?.risk_metadata).toMatchObject({
      level: "high",
      source: "storefront",
      duplicate_of_order_id: OPEN_ORDER,
    });
    // The verdict never touches the money: the server's own price stands.
    expect(order?.price).toBe(35000);
  });

  it("stamps a clean buyer as needing no attention", async () => {
    const fake = install({ data: { level: "clean", value_tier: "vip", reasons: [] }, error: null });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(35000)] });
    expect(res.success).toBe(true);
    const order = recordedOrder(fake);
    expect(order?.needs_attention).toBe(false);
    expect(order?.attention_reasons).toEqual([]);
  });

  it("places the order without a stamp when the lookup fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fake = install({ data: null, error: { message: "cod_risk_signals unavailable" } });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(35000)] });
    expect(res.success).toBe(true);
    const order = recordedOrder(fake);
    expect(order).toBeDefined();
    expect(order).not.toHaveProperty("risk_metadata");
    expect(order).not.toHaveProperty("needs_attention");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("does not look the buyer up when the server rejects the prices", async () => {
    const fake = install({ data: { level: "clean", reasons: [] }, error: null });
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(1)] });
    expect(res.success).toBe(false);
    expect(fake.rpcCalls.some((c) => c.fn === "cod_risk_signals")).toBe(false);
    expect(recordedOrder(fake)).toBeUndefined();
  });
});
