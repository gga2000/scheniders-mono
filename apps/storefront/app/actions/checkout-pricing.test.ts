import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

// =====================================================================
// The server is the only source of price truth.
// =====================================================================
// Every test here posts what a browser could post — including prices it has
// no business sending — and asserts on what the server RECORDS: the line
// prices and totals handed to create_storefront_order, and the total returned to
// the client. Tenant filters are exercised for real: the in-memory double
// applies `.eq("tenant_id", …)`, so another tenant's cheaper tier or offer
// only stays out of the order if the checkout actually scoped its query.
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
import { verifyUpsellProof } from "@/lib/order-upsell-proof";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT = "0e0e0e0e-b5a6-4789-8f12-cd34ef567890";
const PERFUME = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";

function product(id: string, price: number, over: Row = {}): Row {
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
    ...over,
  };
}

function baseTables(over: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    tenants: [
      {
        id: TENANT,
        status: "active",
        restrictions: null,
        store_config_v2: { commerce: { shipping: { default_rate: { fee_iqd: 5000 } } } },
      },
    ],
    products: [product(PERFUME, 35000)],
    product_variants: [],
    product_tiered_pricing: [
      { tenant_id: TENANT, product_id: PERFUME, min_quantity: 2, max_quantity: 2, price: 32500 },
      { tenant_id: TENANT, product_id: PERFUME, min_quantity: 3, max_quantity: null, price: 30000 },
      // Another tenant's row for the same product id must never price it.
      { tenant_id: OTHER_TENANT, product_id: PERFUME, min_quantity: 1, max_quantity: null, price: 1 },
    ],
    product_order_bumps: [],
    abandoned_carts: [],
    ...over,
  };
}

function install(tables: Record<string, Row[]>, failingTables: string[] = []) {
  const fake = createFakeSupabase(tables, {
    failingTables,
    rpc: {
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
  address_details: "Street 14",
};

function line(productId: string, price: number, quantity: number) {
  return { product_id: productId, variant_id: null, name: "client name", variant_name: null, price, quantity };
}

type OrderData = {
  items: Array<{ product_id: string; price: number; quantity: number }>;
  price: number;
  delivery_fee: number;
  discount_amount: number;
};

function recordedOrder(fake: ReturnType<typeof install>): OrderData | undefined {
  const call = fake.rpcCalls.find((c) => c.fn === "create_storefront_order");
  return call?.args._order_data as OrderData | undefined;
}

beforeEach(() => vi.clearAllMocks());

describe("quantity price breaks", () => {
  it("charges the tier the shopper was shown", async () => {
    const fake = install(baseTables());
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 30000, 3)] });
    expect(res.success).toBe(true);
    const order = recordedOrder(fake);
    expect(order?.items[0]).toMatchObject({ product_id: PERFUME, price: 30000, quantity: 3 });
    expect(order?.price).toBe(90000);
    expect(res.total).toBe(90000 + 5000);
  });

  it("rejects a tampered unit price and quotes the server's own", async () => {
    const fake = install(baseTables());
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 1, 3)] });
    expect(res.success).toBe(false);
    expect(res.issues).toEqual([
      { product_id: PERFUME, variant_id: null, reason: "price_changed", new_price: 30000 },
    ]);
    expect(recordedOrder(fake)).toBeUndefined();
  });

  it("rejects the tier price at a quantity that has not earned it", async () => {
    const fake = install(baseTables());
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 30000, 1)] });
    expect(res.issues?.[0]).toMatchObject({ reason: "price_changed", new_price: 35000 });
    expect(recordedOrder(fake)).toBeUndefined();
  });

  it("ignores another tenant's tier for the same product id", async () => {
    const fake = install(baseTables());
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 1, 1)] });
    expect(res.issues?.[0]).toMatchObject({ reason: "price_changed", new_price: 35000 });
    expect(recordedOrder(fake)).toBeUndefined();
  });

  it("fails closed when the tiers cannot be read", async () => {
    const fake = install(baseTables(), ["product_tiered_pricing"]);
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(res.success).toBe(false);
    expect(recordedOrder(fake)).toBeUndefined();
  });
});

const ADDON = "b1b2c3d4-e5f6-4789-ab12-cd34ef567890";

function bumpTables(over: Row = {}): Record<string, Row[]> {
  return baseTables({
    products: [product(PERFUME, 35000), product(ADDON, 10000)],
    product_order_bumps: [
      {
        tenant_id: TENANT,
        product_id: PERFUME,
        bump_product_id: ADDON,
        discount_percentage: 30,
        is_active: true,
        ...over,
      },
    ],
  });
}

describe("order bumps", () => {
  it("honours the bump price when the parent is in the same order", async () => {
    const fake = install(bumpTables());
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [line(PERFUME, 35000, 1), line(ADDON, 7000, 1)],
    });
    expect(res.success).toBe(true);
    expect(recordedOrder(fake)?.items[1]).toMatchObject({ product_id: ADDON, price: 7000 });
    expect(recordedOrder(fake)?.price).toBe(42000);
  });

  it("refuses the bump price on its own — it is not a coupon", async () => {
    const fake = install(bumpTables());
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(ADDON, 7000, 1)] });
    expect(res.issues?.[0]).toMatchObject({ product_id: ADDON, reason: "price_changed", new_price: 10000 });
    expect(recordedOrder(fake)).toBeUndefined();
  });

  it("charges full price for an add-on bought beside its parent without the offer", async () => {
    // The cart has no bump UI; the shopper was shown 10,000 and pays 10,000.
    const fake = install(bumpTables());
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [line(PERFUME, 35000, 1), line(ADDON, 10000, 1)],
    });
    expect(res.success).toBe(true);
    expect(recordedOrder(fake)?.items[1]).toMatchObject({ product_id: ADDON, price: 10000 });
  });

  it("discounts one unit of the add-on, never a stack of it", async () => {
    const fake = install(bumpTables());
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [line(PERFUME, 35000, 1), line(ADDON, 7000, 50)],
    });
    expect(res.issues?.[0]).toMatchObject({ product_id: ADDON, reason: "price_changed", new_price: 10000 });
    expect(recordedOrder(fake)).toBeUndefined();
  });

  it("P1-1: refuses N duplicate one-unit add-on lines at the bump price", async () => {
    const fake = install(bumpTables());
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [line(PERFUME, 35000, 1), line(ADDON, 7000, 1), line(ADDON, 7000, 1), line(ADDON, 7000, 1)],
    });
    expect(res.success).toBe(false);
    expect(res.issues?.filter((x) => x.product_id === ADDON && x.reason === "invalid_quantity")).toHaveLength(2);
    expect(recordedOrder(fake)).toBeUndefined();
  });

  it("P1-1: discounts one unit of an add-on per order, even across its variants", async () => {
    const t = bumpTables();
    t.product_variants = [
      { id: "v-small", tenant_id: TENANT, product_id: ADDON, price: 10000, is_enabled: true },
      { id: "v-large", tenant_id: TENANT, product_id: ADDON, price: 10000, is_enabled: true },
    ];
    const fake = install(t);
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [
        line(PERFUME, 35000, 1),
        { ...line(ADDON, 7000, 1), variant_id: "v-small" },
        { ...line(ADDON, 7000, 1), variant_id: "v-large" },
      ],
    });
    expect(res.issues).toEqual([
      { product_id: ADDON, variant_id: "v-large", reason: "price_changed", new_price: 10000 },
    ]);
    expect(recordedOrder(fake)).toBeUndefined();
  });

  it("P2-2: reciprocal bumps cannot discount every line", async () => {
    const t = bumpTables();
    t.product_order_bumps.push({
      tenant_id: TENANT,
      product_id: ADDON,
      bump_product_id: PERFUME,
      discount_percentage: 30,
      is_active: true,
    });
    const fake = install(t);
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [line(PERFUME, 24500, 1), line(ADDON, 7000, 1)],
    });
    expect(res.success).toBe(false);
    expect(res.issues?.map((x) => [x.product_id, x.new_price])).toEqual([
      [PERFUME, 35000],
      [ADDON, 10000],
    ]);
    expect(recordedOrder(fake)).toBeUndefined();
  });

  it("refuses a deeper discount than the merchant set", async () => {
    const fake = install(bumpTables());
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [line(PERFUME, 35000, 1), line(ADDON, 1000, 1)],
    });
    expect(res.success).toBe(false);
    expect(recordedOrder(fake)).toBeUndefined();
  });

  it("ignores an inactive offer", async () => {
    const fake = install(bumpTables({ is_active: false }));
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [line(PERFUME, 35000, 1), line(ADDON, 7000, 1)],
    });
    expect(res.success).toBe(false);
    expect(recordedOrder(fake)).toBeUndefined();
  });

  it("ignores another tenant's offer", async () => {
    const fake = install(bumpTables({ tenant_id: OTHER_TENANT }));
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [line(PERFUME, 35000, 1), line(ADDON, 7000, 1)],
    });
    expect(res.success).toBe(false);
    expect(recordedOrder(fake)).toBeUndefined();
  });

  it("fails closed when the offers cannot be read", async () => {
    const fake = install(bumpTables(), ["product_order_bumps"]);
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(res.success).toBe(false);
    expect(recordedOrder(fake)).toBeUndefined();
  });
});

describe("P1-2: products sold by variant", () => {
  const SHIRT = "e1b2c3d4-e5f6-4789-ab12-cd34ef567890";
  function variantTables(variants: Row[]): Record<string, Row[]> {
    return baseTables({ products: [product(SHIRT, 25000)], product_variants: variants });
  }

  it("refuses a variant-less line, which would buy the XL at the parent price", async () => {
    const fake = install(
      variantTables([{ id: "v-xl", tenant_id: TENANT, product_id: SHIRT, price: 32000, is_enabled: true }]),
    );
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(SHIRT, 25000, 1)] });
    expect(res.issues).toEqual([{ product_id: SHIRT, variant_id: null, reason: "unavailable" }]);
    expect(recordedOrder(fake)).toBeUndefined();
  });

  it("prices a line that names the variant from the variant row", async () => {
    const fake = install(
      variantTables([{ id: "v-xl", tenant_id: TENANT, product_id: SHIRT, price: 32000, is_enabled: true }]),
    );
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [{ ...line(SHIRT, 32000, 1), variant_id: "v-xl" }],
    });
    expect(res.success).toBe(true);
    expect(recordedOrder(fake)?.items[0]).toMatchObject({ variant_id: "v-xl", price: 32000 });
  });

  it("refuses a disabled variant, and a variant-less line is fine once all are disabled", async () => {
    install(variantTables([{ id: "v-xl", tenant_id: TENANT, product_id: SHIRT, price: 32000, is_enabled: false }]));
    const viaVariant = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [{ ...line(SHIRT, 32000, 1), variant_id: "v-xl" }],
    });
    expect(viaVariant.issues?.[0]).toMatchObject({ reason: "unavailable" });
    const plain = await submitCheckout({ tenantId: TENANT, customer, items: [line(SHIRT, 25000, 1)] });
    expect(plain.success).toBe(true);
  });

  it("ignores another tenant's variant rows for the same product id", async () => {
    install(variantTables([{ id: "v-x", tenant_id: OTHER_TENANT, product_id: SHIRT, price: 1, is_enabled: true }]));
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(SHIRT, 25000, 1)] });
    expect(res.success).toBe(true);
  });
});

describe("P2-1: stacked discounts", () => {
  const A = "a2b2c3d4-e5f6-4789-ab12-cd34ef567890";
  const B = "a3b2c3d4-e5f6-4789-ab12-cd34ef567890";

  it("never discount more than the subtotal, so the courier still collects delivery", async () => {
    // Coupon 30,000 and bundle 25,000 are each within the 40,000 subtotal,
    // but together they are 55,000: the old sum recorded a -10,000 total.
    const t = baseTables({ products: [product(A, 20000), product(B, 20000)] });
    t.tenants[0].store_config_v2 = {
      commerce: {
        shipping: { default_rate: { fee_iqd: 5000 } },
        discounts: [{ code: "BIG", kind: "fixed", value: 30000 }],
        bundles: [{ id: "pair", product_ids: [A, B], kind: "fixed", value: 25000 }],
      },
    };
    const fake = install(t);
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      couponCode: "BIG",
      items: [line(A, 20000, 1), line(B, 20000, 1)],
    });
    expect(res.success).toBe(true);
    expect(recordedOrder(fake)?.discount_amount).toBe(40000);
    expect(res.total).toBe(5000);
  });
});

describe("P2-3: an idempotent replay has no side effects", () => {
  const KEY = "retry-key-0001";
  const EXISTING = "33333333-3333-4333-8333-333333333333";

  function loyaltyTables(orders: Row[] = []): Record<string, Row[]> {
    const t = baseTables({ orders, customer_points: [{ tenant_id: TENANT, phone: "07701234567", balance: 5000 }] });
    t.tenants[0].store_config_v2 = {
      commerce: {
        shipping: { default_rate: { fee_iqd: 5000 } },
        loyalty: { enabled: true, earn_per_iqd: 0.001, redeem_value_iqd: 1, max_redeem_pct: 100 },
      },
    };
    return t;
  }
  const pointsCalls = (fake: ReturnType<typeof createFakeSupabase>) =>
    fake.rpcCalls.filter((c) => c.fn === "adjust_customer_points");

  it("a retry of an order that already exists earns and mints nothing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "proof-root");
    const fake = createFakeSupabase(
      loyaltyTables([
        {
          id: EXISTING,
          order_id: "SH-0007",
          tenant_id: TENANT,
          idempotency_key: KEY,
          // Stored net of the discount: 35,000 of lines less 2,000.
          price: 33000,
          discount_amount: 2000,
          delivery_fee: 5000,
        },
      ]),
      { rpc: { create_storefront_order: () => ({ data: null, error: { message: "must not be called" } }) } },
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      idempotencyKey: KEY,
      items: [line(PERFUME, 35000, 1)],
    });
    expect(res).toMatchObject({ success: true, orderId: EXISTING, orderNumber: "SH-0007", total: 38000 });
    expect(res.upsellToken).toBeUndefined();
    expect(pointsCalls(fake)).toEqual([]);
    expect(fake.rpcCalls.some((c) => c.fn === "create_storefront_order")).toBe(false);
    vi.unstubAllEnvs();
  });

  it("another tenant's order with the same key is not a replay", async () => {
    const fake = createFakeSupabase(
      loyaltyTables([{ id: EXISTING, order_id: "X-1", tenant_id: OTHER_TENANT, idempotency_key: KEY, price: 1 }]),
      { rpc: { create_storefront_order: () => ({ data: { id: "11111111-1111-4111-8111-111111111111", order_id: "SH-1" }, error: null }) } },
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
    const res = await submitCheckout({ tenantId: TENANT, customer, idempotencyKey: KEY, items: [line(PERFUME, 35000, 1)] });
    expect(res.orderId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("losing a concurrent race reports the existing order and earns nothing, when the RPC reports the replay", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "proof-root");
    const fake = createFakeSupabase(loyaltyTables(), {
      rpc: {
        create_storefront_order: () => ({
          data: { id: EXISTING, order_id: "SH-0007", price: 33000, discount_amount: 2000, delivery_fee: 5000, idempotent_replay: true },
          error: null,
        }),
      },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      idempotencyKey: KEY,
      items: [line(PERFUME, 35000, 1)],
    });
    expect(res).toMatchObject({ success: true, orderId: EXISTING, total: 38000 });
    expect(res.upsellToken).toBeUndefined();
    expect(pointsCalls(fake)).toEqual([]);
    vi.unstubAllEnvs();
  });
});

describe("post-purchase proof", () => {
  it("is minted only for the order this response created, under its tenant", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "proof-root");
    install(baseTables());
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(verifyUpsellProof(res.upsellToken, "proof-root")).toMatchObject({
      tenantId: TENANT,
      orderId: "11111111-1111-4111-8111-111111111111",
    });
    vi.unstubAllEnvs();
  });

  it("is not minted for a rejected order", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "proof-root");
    install(baseTables());
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 1, 1)] });
    expect(res.upsellToken).toBeUndefined();
    vi.unstubAllEnvs();
  });
});

const GIFT = "c1b2c3d4-e5f6-4789-ab12-cd34ef567890";

function giftTables(giftOver: Row = {}, commerceOver: Row = {}): Record<string, Row[]> {
  const tables = baseTables({
    products: [product(PERFUME, 35000), product(GIFT, 12000, giftOver)],
  });
  tables.tenants[0].store_config_v2 = {
    commerce: {
      shipping: { default_rate: { fee_iqd: 5000 } },
      free_gift: { enabled: true, product_id: GIFT, threshold_iqd: 60000 },
      ...commerceOver,
    },
  };
  return tables;
}

describe("free gift", () => {
  it("is added by the server, at zero, once the paid subtotal reaches the threshold", async () => {
    const fake = install(giftTables());
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 32500, 2)] });
    expect(res.success).toBe(true);
    const order = recordedOrder(fake);
    expect(order?.items).toHaveLength(2);
    expect(order?.items[1]).toMatchObject({ product_id: GIFT, price: 0, quantity: 1 });
    // The gift adds nothing to what is collected.
    expect(order?.price).toBe(65000);
    expect(res.total).toBe(65000 + 5000);
  });

  it("is not added below the threshold", async () => {
    const fake = install(giftTables());
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    expect(res.success).toBe(true);
    expect(recordedOrder(fake)?.items).toHaveLength(1);
  });

  it("cannot be claimed by posting it at zero", async () => {
    const fake = install(giftTables());
    const res = await submitCheckout({
      tenantId: TENANT,
      customer,
      items: [line(PERFUME, 32500, 2), line(GIFT, 0, 1)],
    });
    expect(res.issues).toEqual([
      { product_id: GIFT, variant_id: null, reason: "price_changed", new_price: 12000 },
    ]);
    expect(recordedOrder(fake)).toBeUndefined();
  });

  it("is skipped, not failed, when the gift is Draft or out of stock", async () => {
    for (const over of [{ status: "draft" }, { stock_quantity: 0 }]) {
      const fake = install(giftTables(over));
      const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 32500, 2)] });
      expect(res.success).toBe(true);
      expect(recordedOrder(fake)?.items).toHaveLength(1);
    }
  });

  it("does not complete a bundle the shopper never paid into", async () => {
    // A merchant bundle naming the gift product would otherwise complete the
    // moment the server appended the gift, and pay out 2,000 nobody earned.
    const fake = install(
      giftTables({}, { bundles: [{ id: "b", product_ids: [PERFUME, GIFT], kind: "fixed", value: 2000 }] }),
    );
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 32500, 2)] });
    expect(res.success).toBe(true);
    expect(recordedOrder(fake)?.discount_amount).toBe(0);
    expect(res.total).toBe(65000 + 5000);
  });
});

describe("line item snapshot", () => {
  // The orders page draws each line from the order's own items (photo from
  // image_url, chip colour from tag_color), the way every other source
  // snapshots them. A storefront line without them showed a blank box.
  it("records the product's photo and tag colour on every line, the gift included", async () => {
    const tables = giftTables({ image_url: "https://cdn.test/gift.webp", tag_color: "#0ea5e9" });
    tables.products[0] = { ...tables.products[0], image_url: "https://cdn.test/perfume.webp", tag_color: "#f97316" };
    const fake = install(tables);
    const res = await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 32500, 2)] });
    expect(res.success).toBe(true);
    expect(recordedOrder(fake)?.items).toEqual([
      expect.objectContaining({ product_id: PERFUME, image_url: "https://cdn.test/perfume.webp", tag_color: "#f97316" }),
      expect.objectContaining({ product_id: GIFT, image_url: "https://cdn.test/gift.webp", tag_color: "#0ea5e9" }),
    ]);
  });

  it("leaves both out when the product has none", async () => {
    const fake = install(baseTables());
    await submitCheckout({ tenantId: TENANT, customer, items: [line(PERFUME, 35000, 1)] });
    const item = recordedOrder(fake)?.items[0];
    expect(item).not.toHaveProperty("image_url");
    expect(item).not.toHaveProperty("tag_color");
  });
});
