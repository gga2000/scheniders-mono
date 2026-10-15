import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

// =====================================================================
// The server is the only source of price truth.
// =====================================================================
// Every test here posts what a browser could post — including prices it has
// no business sending — and asserts on what the server RECORDS: the line
// prices and totals handed to create_order_atomic, and the total returned to
// the client. Tenant filters are exercised for real: the in-memory double
// applies `.eq("tenant_id", …)`, so another tenant's cheaper tier or offer
// only stays out of the order if the checkout actually scoped its query.
// =====================================================================

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));
vi.mock("@/lib/capi", () => ({ sendPurchaseCapi: vi.fn() }));

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
      create_order_atomic: () => ({
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
  const call = fake.rpcCalls.find((c) => c.fn === "create_order_atomic");
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
