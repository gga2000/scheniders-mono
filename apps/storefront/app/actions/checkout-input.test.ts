import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

// =====================================================================
// submitCheckout input validation (lead 11)
// =====================================================================
// submitCheckout is an exported server action, so Next.js serves it as a
// public endpoint: any client can call it with any argument, not just the
// forms that import it. Its whole argument is validated before anything else.
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
const ORDER = "11111111-1111-4111-8111-111111111111";

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
            discounts: [{ code: "SAVE5", kind: "fixed", value: 5000 }],
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
    customer_points: [],
  };
}

function install() {
  const fake = createFakeSupabase(tables(), {
    rpc: { create_storefront_order: () => ({ data: { id: ORDER, order_id: "SH-0001" }, error: null }) },
  });
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const customer = {
  customer_name: "Ali Hassan",
  phone: "07701234567",
  governorate_code: "BG",
  city: "Baghdad",
  address_details: "Street 14",
};
const items = [{ product_id: PERFUME, variant_id: null, name: "x", variant_name: null, price: 35000, quantity: 2 }];
const valid = { tenantId: TENANT, customer, items };

const recorded = (fake: ReturnType<typeof install>) =>
  fake.rpcCalls.find((c) => c.fn === "create_storefront_order")?.args._order_data as
    | { secondary_phone: string | null }
    | undefined;

beforeEach(() => vi.clearAllMocks());

describe("submitCheckout input validation", () => {
  it.each([
    ["a string", "nope"],
    ["null", null],
    ["a non-uuid tenant", { ...valid, tenantId: "tenant-1" }],
    ["a missing customer", { tenantId: TENANT, items }],
    ["an unknown governorate", { ...valid, customer: { ...customer, governorate_code: "XX" } }],
    ["a blank name", { ...valid, customer: { ...customer, customer_name: "   " } }],
    ["an oversized address", { ...valid, customer: { ...customer, address_details: "x".repeat(1001) } }],
    ["a non-uuid product id", { ...valid, items: [{ ...items[0], product_id: "p1" }] }],
    ["a non-numeric price", { ...valid, items: [{ ...items[0], price: "35000" }] }],
    ["a fractional quantity", { ...valid, items: [{ ...items[0], quantity: 1.5 }] }],
    ["more than 100 lines", { ...valid, items: Array.from({ length: 101 }, () => items[0]) }],
    ["a too-short idempotency key", { ...valid, idempotencyKey: "k1" }],
  ])("rejects %s before touching the database", async (_label, input) => {
    const fake = install();
    const res = await submitCheckout(input);
    expect(res.success).toBe(false);
    expect(fake.rpcCalls).toEqual([]);
    expect(fake.writes).toEqual([]);
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("refuses an alternative number that is not a real Iraqi mobile, and stores a valid one canonically", async () => {
    const bad = install();
    const refused = await submitCheckout({ ...valid, customer: { ...customer, alt_phone: "12345" } });
    expect(refused.success).toBe(false);
    expect(recorded(bad)).toBeUndefined();

    const good = install();
    const ok = await submitCheckout({ ...valid, customer: { ...customer, alt_phone: "+964 780 123 4567" } });
    expect(ok.success).toBe(true);
    expect(recorded(good)?.secondary_phone).toBe("07801234567");
  });
});
