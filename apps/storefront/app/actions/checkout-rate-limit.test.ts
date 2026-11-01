import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

// =====================================================================
// F-041: placing a storefront order is rate limited per IP and per phone,
// and an idempotent replay is answered without counting against either.
// submitCheckout is a server action (callable without the API route), so the
// limit lives in it, not only in /api/checkout/orders.
// =====================================================================

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/capi", () => ({ sendPurchaseCapi: vi.fn() }));
// A real shopper, not a draft-view session (that check reads request cookies).
vi.mock("@/lib/draft-view", () => ({ isDraftViewRequest: vi.fn(async () => false) }));
vi.mock("@/lib/order-confirmation-queue", () => ({ queueOrderConfirmation: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }),
}));
vi.mock("@/lib/checkout-rate-limit", () => ({ checkoutRateLimited: vi.fn() }));

import { submitCheckout } from "./checkout";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { checkoutRateLimited } from "@/lib/checkout-rate-limit";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PERFUME = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";

function install(orders: Row[] = []) {
  const fake = createFakeSupabase(
    {
      tenants: [{ id: TENANT, status: "active", restrictions: null, store_config_v2: null }],
      products: [{
        id: PERFUME, tenant_id: TENANT, name: "Perfume", short_name: null, price: 35000, website_price: null,
        status: "active", is_visible: true, is_archived: false, is_supply: false, stock_quantity: 50, reserved_quantity: 0,
      }],
      product_variants: [],
      product_tiered_pricing: [],
      product_order_bumps: [],
      abandoned_carts: [],
      orders,
    },
    {
      rpc: {
        create_storefront_order: () => ({ data: { id: "11111111-1111-4111-8111-111111111111", order_id: "4261020001" }, error: null }),
      },
    },
  );
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const order = {
  tenantId: TENANT,
  customer: { customer_name: "Ali", phone: "0770 123 4567", governorate_code: "BG", city: "Baghdad", address_details: "Street 14" },
  items: [{ product_id: PERFUME, variant_id: null, name: "Perfume", variant_name: null, price: 35000, quantity: 1 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("submitCheckout rate limit", () => {
  it("refuses with a wait time and creates nothing when a bucket is exhausted", async () => {
    vi.mocked(checkoutRateLimited).mockResolvedValue(120);
    const fake = install();
    const res = await submitCheckout(order);
    expect(res).toMatchObject({ success: false, retryAfterSeconds: 120 });
    expect(fake.rpcCalls.some((c) => c.fn === "create_storefront_order")).toBe(false);
  });

  it("checks the request's address and the normalised phone for this tenant", async () => {
    vi.mocked(checkoutRateLimited).mockResolvedValue(null);
    const fake = install();
    const res = await submitCheckout(order);
    expect(res.success).toBe(true);
    const [headers, tenantId, phone] = vi.mocked(checkoutRateLimited).mock.calls[0];
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(tenantId).toBe(TENANT);
    expect(phone).toBe("07701234567");
    expect(fake.rpcCalls.some((c) => c.fn === "create_storefront_order")).toBe(true);
  });

  it("answers a replay of a placed order without consuming the limit", async () => {
    vi.mocked(checkoutRateLimited).mockResolvedValue(120);
    install([{
      id: "22222222-2222-4222-8222-222222222222", tenant_id: TENANT, idempotency_key: "idem-key-0001",
      order_id: "4261020001", price: 35000, discount_amount: 0, delivery_fee: 0,
    }]);
    const res = await submitCheckout({ ...order, idempotencyKey: "idem-key-0001" });
    expect(res).toMatchObject({ success: true, orderNumber: "4261020001" });
    expect(checkoutRateLimited).not.toHaveBeenCalled();
  });
});
