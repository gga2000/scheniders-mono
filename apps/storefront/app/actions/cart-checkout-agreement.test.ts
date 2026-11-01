// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeDeliveryFee, type CartItem } from "@scheniders/shared";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

// =====================================================================
// The cart and the checkout must agree on price.
// =====================================================================
// The cart prices its lines with `resolveLineUnitPrice` (via the cart store's
// repricing) and the checkout server prices the submitted lines with the same
// function, from database rows. This drives the REAL cart store the way a
// shopper does — add from the PDP, change quantities, add a bump product on
// its own — then submits exactly what the cart holds to the REAL checkout
// action and asserts the order is accepted at the total the cart displayed.
// If the two ever drift, the shopper sees "prices changed" on a COD checkout
// for the store's own advertised pricing, and this test fails.
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
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("@/lib/checkout-rate-limit", () => ({ checkoutRateLimited: async () => null }));

import { submitCheckout } from "./checkout";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { useCart } from "@/lib/cart-store";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const PERFUME = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const ADDON = "b1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const SHIPPING = { default_rate: { fee_iqd: 5000, free_threshold_iqd: 100000 } };

const TIERS = [
  { min_quantity: 2, max_quantity: 2, price: 32500 },
  { min_quantity: 3, max_quantity: null, price: 30000 },
];

function product(id: string, price: number): Row {
  return {
    id,
    tenant_id: TENANT,
    name: id,
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

function install() {
  const fake = createFakeSupabase(
    {
      tenants: [{ id: TENANT, status: "active", restrictions: null, store_config_v2: { commerce: { shipping: SHIPPING } } }],
      products: [product(PERFUME, 35000), product(ADDON, 10000)],
      product_variants: [],
      product_tiered_pricing: TIERS.map((t) => ({ ...t, tenant_id: TENANT, product_id: PERFUME })),
      product_order_bumps: [
        { tenant_id: TENANT, product_id: PERFUME, bump_product_id: ADDON, discount_percentage: 30, is_active: true },
      ],
      abandoned_carts: [],
    },
    {
      rpc: {
        create_storefront_order: () => ({ data: { id: "11111111-1111-4111-8111-111111111111", order_id: "SH-1" }, error: null }),
      },
    },
  );
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

/** What pdp_add_to_cart / pdp_buy_box put in the cart. */
function pdpLine(productId: string, basePrice: number, qty: number, tiers?: typeof TIERS): CartItem {
  const line: CartItem = {
    product_id: productId,
    variant_id: null,
    name: productId,
    variant_name: null,
    price: basePrice,
    quantity: 1,
    image_url: null,
    base_price: basePrice,
    ...(tiers ? { price_tiers: tiers } : {}),
  };
  useCart.getState().addItem(line);
  if (qty !== 1) useCart.getState().updateQuantity(productId, null, qty);
  return line;
}

async function submitCart() {
  const items = useCart.getState().items.map((i) => ({
    product_id: i.product_id,
    variant_id: i.variant_id,
    name: i.name,
    variant_name: i.variant_name,
    price: i.price,
    quantity: i.quantity,
  }));
  return submitCheckout({
    tenantId: TENANT,
    customer: {
      customer_name: "Ali",
      phone: "07701234567",
      governorate_code: "BG",
      city: "Baghdad",
      address_details: "Street 14",
    },
    items,
  });
}

/** What cart_summary shows: the cart's own total plus the shared delivery fee. */
function cartDisplayedTotal(): number {
  const subtotal = useCart.getState().getTotal();
  const count = useCart.getState().items.reduce((n, i) => n + i.quantity, 0);
  return subtotal + computeDeliveryFee(subtotal, count, { shipping: SHIPPING, governorate: "BG" });
}

beforeEach(() => {
  vi.clearAllMocks();
  useCart.getState().clearCart();
});

describe("cart and checkout agree", () => {
  it.each([1, 2, 3, 7])("at quantity %i across a price ladder", async (qty) => {
    install();
    pdpLine(PERFUME, 35000, qty, TIERS);
    const displayed = cartDisplayedTotal();
    const res = await submitCart();
    expect(res.issues).toBeUndefined();
    expect(res.success).toBe(true);
    expect(res.total).toBe(displayed);
  });

  it("after the shopper lowers the quantity back below a break", async () => {
    install();
    pdpLine(PERFUME, 35000, 3, TIERS);
    useCart.getState().updateQuantity(PERFUME, null, 1);
    const displayed = cartDisplayedTotal();
    const res = await submitCart();
    expect(res.success).toBe(true);
    expect(res.total).toBe(displayed);
  });

  it("after adding the same product twice to cross a break", async () => {
    install();
    pdpLine(PERFUME, 35000, 2, TIERS);
    pdpLine(PERFUME, 35000, 1, TIERS);
    expect(useCart.getState().items[0]).toMatchObject({ quantity: 3, price: 30000 });
    const res = await submitCart();
    expect(res.success).toBe(true);
    expect(res.total).toBe(cartDisplayedTotal());
  });

  it("when a bump product is in the cart on its own, beside its parent", async () => {
    // No bump was offered, so none is charged — the cart shows full price and
    // the server must accept full price.
    install();
    pdpLine(PERFUME, 35000, 1, TIERS);
    pdpLine(ADDON, 10000, 1);
    const displayed = cartDisplayedTotal();
    const res = await submitCart();
    expect(res.success).toBe(true);
    expect(res.total).toBe(displayed);
  });

  it("and a cart line edited in the browser is still refused", async () => {
    const fake = install();
    pdpLine(PERFUME, 35000, 3, TIERS);
    useCart.setState({ items: useCart.getState().items.map((i) => ({ ...i, price: 100 })) });
    const res = await submitCart();
    expect(res.success).toBe(false);
    expect(res.issues?.[0]).toMatchObject({ reason: "price_changed", new_price: 30000 });
    expect(fake.rpcCalls.some((c) => c.fn === "create_storefront_order")).toBe(false);
  });
});
