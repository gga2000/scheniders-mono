import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type Row } from "@/lib/testing/fake-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import { GET, POST } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { signUpsellProof, UPSELL_WINDOW_MS } from "@/lib/order-upsell-proof";

// =====================================================================
// The upsell grows an order that real money will be collected for, so
// these tests are about who may grow it, when, and at what price.
// =====================================================================

const SECRET = "test-service-role-key-for-hmac-derivation";
const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const OTHER_TENANT = "0e0e0e0e-b5a6-4789-8f12-cd34ef567890";
const ORDER = "11111111-1111-4111-8111-111111111111";
const OTHER_ORDER = "22222222-2222-4222-8222-222222222222";
const PARENT = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const ADDON = "b1b2c3d4-e5f6-4789-ab12-cd34ef567890";

const parentLine = { product_id: PARENT, variant_id: null, name: "X", variant_name: null, price: 30000, quantity: 1 };

function order(over: Row = {}): Row {
  return {
    id: ORDER,
    tenant_id: TENANT,
    status: "new",
    items: [parentLine],
    price: 30000,
    delivery_fee: 5000,
    discount_amount: 0,
    governorate_code: "BG",
    created_at: new Date().toISOString(),
    version: 3,
    deleted_at: null,
    ...over,
  };
}

function tables(over: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    orders: [order()],
    tenants: [
      {
        id: TENANT,
        status: "active",
        restrictions: null,
        store_config_v2: { commerce: { shipping: { default_rate: { fee_iqd: 5000, free_threshold_iqd: 60000 } } } },
      },
    ],
    product_order_bumps: [
      {
        tenant_id: TENANT,
        product_id: PARENT,
        bump_product_id: ADDON,
        discount_percentage: 20,
        headline: null,
        description: null,
        is_active: true,
        display_order: 0,
      },
    ],
    products: [
      {
        id: ADDON,
        tenant_id: TENANT,
        name: "Addon",
        short_name: null,
        image_url: null,
        price: 10000,
        website_price: null,
        status: "active",
        is_visible: true,
        is_archived: false,
        is_supply: false,
        stock_quantity: 5,
        reserved_quantity: 0,
      },
    ],
    product_tiered_pricing: [],
    ...over,
  };
}

function install(t: Record<string, Row[]>) {
  const fake = createFakeSupabase(t);
  vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
  return fake;
}

const proofFor = (orderId = ORDER, tenantId = TENANT, nowMs = Date.now()) =>
  signUpsellProof({ tenantId, orderId }, SECRET, nowMs);

const ctx = (id = ORDER) => ({ params: Promise.resolve({ id }) });
const getReq = (proof: string | null, id = ORDER) =>
  new Request(`http://x/api/checkout/orders/${id}/upsell`, {
    headers: proof ? { "x-upsell-proof": proof } : {},
  });
const postReq = (body: unknown, proof: string | null, id = ORDER) =>
  new Request(`http://x/api/checkout/orders/${id}/upsell`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(proof ? { "x-upsell-proof": proof } : {}) },
    body: JSON.stringify(body),
  });

const storedOrder = (fake: ReturnType<typeof install>) =>
  fake.tables.orders.find((o) => o.id === ORDER) as Row & { items: Row[]; price: number; delivery_fee: number };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SECRET);
});

describe("who may see or accept an offer", () => {
  it("lists the add-ons of what was ordered for the browser holding the proof", async () => {
    install(tables());
    const res = await GET(getReq(proofFor()), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.offers).toEqual([
      expect.objectContaining({ product_id: ADDON, base_price: 10000, offer_price: 8000 }),
    ]);
  });

  it.each([
    ["no proof", null],
    ["a forged proof", "v1.e30.AAAA"],
    ["a proof for a different order", proofFor(OTHER_ORDER)],
    ["a proof signed with another key", signUpsellProof({ tenantId: TENANT, orderId: ORDER }, "other-key")],
    ["an expired proof", proofFor(ORDER, TENANT, Date.now() - UPSELL_WINDOW_MS - 1000)],
  ])("is the same 404 with %s, and the order is untouched", async (_label, proof) => {
    const fake = install(tables());
    expect((await GET(getReq(proof), ctx())).status).toBe(404);
    expect((await POST(postReq({ product_id: ADDON }, proof), ctx())).status).toBe(404);
    expect(fake.writes).toEqual([]);
  });

  it("takes the tenant from the proof, so a proof for another store finds nothing", async () => {
    const fake = install(tables());
    const res = await POST(postReq({ product_id: ADDON }, proofFor(ORDER, OTHER_TENANT)), ctx());
    expect(res.status).toBe(404);
    expect(fake.writes).toEqual([]);
  });

  it("is off entirely when the server has no key to verify with", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const fake = install(tables());
    expect((await POST(postReq({ product_id: ADDON }, proofFor()), ctx())).status).toBe(404);
    expect(fake.writes).toEqual([]);
  });
});

describe("when an order can still grow", () => {
  it.each([
    ["ops have confirmed it", { status: "confirmed" }],
    ["it is pending checkout", { status: "pending_checkout" }],
    ["it is older than the window", { created_at: new Date(Date.now() - UPSELL_WINDOW_MS - 60_000).toISOString() }],
    ["it was deleted", { deleted_at: new Date().toISOString() }],
  ])("not when %s", async (_label, over) => {
    const fake = install(tables({ orders: [order(over)] }));
    expect((await GET(getReq(proofFor()), ctx())).status).toBe(404);
    expect((await POST(postReq({ product_id: ADDON }, proofFor()), ctx())).status).toBe(404);
    expect(fake.writes).toEqual([]);
  });

  it("not when an admin has paused the store", async () => {
    const t = tables();
    t.tenants[0].status = "limited";
    t.tenants[0].restrictions = { blocks: { new_orders: true } };
    const fake = install(t);
    expect((await POST(postReq({ product_id: ADDON }, proofFor()), ctx())).status).toBe(404);
    expect(fake.writes).toEqual([]);
  });
});

describe("what lands on the order", () => {
  it("appends one line at the server-derived price and returns what the courier will collect", async () => {
    const fake = install(tables());
    const res = await POST(postReq({ product_id: ADDON, price: 1 }, proofFor()), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, offer_price: 8000, total: 38000 + 5000 });
    const stored = storedOrder(fake);
    expect(stored.items).toEqual([parentLine, expect.objectContaining({ product_id: ADDON, price: 8000, quantity: 1 })]);
    expect(stored.price).toBe(38000);
    expect(stored.version).toBe(4);
  });

  it("re-prices delivery with the shared engine when the add-on clears the free threshold", async () => {
    // 55,000 + 8,000 = 63,000 ≥ the 60,000 free-delivery threshold.
    const fake = install(tables({ orders: [order({ price: 55000, items: [{ ...parentLine, price: 55000 }] })] }));
    const res = await POST(postReq({ product_id: ADDON }, proofFor()), ctx());
    expect(await res.json()).toMatchObject({ success: true, total: 63000 });
    expect(storedOrder(fake).delivery_fee).toBe(0);
  });

  it("leaves a delivery fee the merchant set by hand alone", async () => {
    const fake = install(tables({ orders: [order({ price: 55000, delivery_fee: 2500, items: [{ ...parentLine, price: 55000 }] })] }));
    await POST(postReq({ product_id: ADDON }, proofFor()), ctx());
    expect(storedOrder(fake).delivery_fee).toBe(2500);
  });

  it("keeps the order's discount in the total it reports", async () => {
    install(tables({ orders: [order({ discount_amount: 3000 })] }));
    const res = await POST(postReq({ product_id: ADDON }, proofFor()), ctx());
    expect(await res.json()).toMatchObject({ total: 38000 - 3000 + 5000 });
  });

  it("P2-1: never reports a total below delivery when the stored discount exceeds the lines", async () => {
    install(tables({ orders: [order({ discount_amount: 50000, delivery_fee: 5000 })] }));
    const res = await POST(postReq({ product_id: ADDON }, proofFor()), ctx());
    expect(await res.json()).toMatchObject({ success: true, total: 5000 });
  });

  it("applies the discount to the add-on's own one-unit tier, like the checkout bump", async () => {
    install(
      tables({
        product_tiered_pricing: [
          { tenant_id: TENANT, product_id: ADDON, min_quantity: 1, max_quantity: null, price: 9000 },
          { tenant_id: OTHER_TENANT, product_id: ADDON, min_quantity: 1, max_quantity: null, price: 1 },
        ],
      }),
    );
    const res = await POST(postReq({ product_id: ADDON }, proofFor()), ctx());
    expect(await res.json()).toMatchObject({ offer_price: 7200 });
  });

  it("is idempotent: a second accept reports the order without appending again", async () => {
    const fake = install(tables());
    await POST(postReq({ product_id: ADDON }, proofFor()), ctx());
    const again = await POST(postReq({ product_id: ADDON }, proofFor()), ctx());
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ success: true, already_added: true, total: 43000 });
    expect(storedOrder(fake).items).toHaveLength(2);
    expect(fake.writes.filter((w) => w.op === "update")).toHaveLength(1);
  });

  it("writes nothing over a change made between its read and its write", async () => {
    // Ops edit the order mid-request (the trigger bumps its version), so the
    // optimistic update matches no row.
    const fake = createFakeSupabase(tables(), {
      beforeUpdate: (table, t) => {
        if (table === "orders") t.orders[0].version = 99;
      },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
    const res = await POST(postReq({ product_id: ADDON }, proofFor()), ctx());
    expect(res.status).toBe(409);
    const stored = fake.tables.orders[0] as Row & { items: Row[] };
    expect(stored.items).toHaveLength(1);
    expect(stored.price).toBe(30000);
  });

  it("treats losing a race to its own double submit as success, appending once", async () => {
    // The first request's write lands between this one's read and write.
    let raced = false;
    const fake = createFakeSupabase(tables(), {
      beforeUpdate: (table, t) => {
        if (table !== "orders" || raced) return;
        raced = true;
        const o = t.orders[0] as Row & { items: Row[]; version: number };
        o.items = [...o.items, { product_id: ADDON, variant_id: null, name: "Addon", variant_name: null, price: 8000, quantity: 1 }];
        o.price = 38000;
        o.version += 1;
      },
    });
    vi.mocked(createSupabaseServiceClient).mockReturnValue(fake.client);
    const res = await POST(postReq({ product_id: ADDON }, proofFor()), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, already_added: true, total: 43000 });
    expect((fake.tables.orders[0] as Row & { items: Row[] }).items).toHaveLength(2);
  });

  it("refuses a product nobody offered", async () => {
    const fake = install(tables());
    const res = await POST(postReq({ product_id: "c1b2c3d4-e5f6-4789-ab12-cd34ef567890" }, proofFor()), ctx());
    expect(res.status).toBe(409);
    expect(fake.writes).toEqual([]);
  });

  it("never duplicates something already on the order", async () => {
    const fake = install(tables());
    const res = await POST(postReq({ product_id: PARENT }, proofFor()), ctx());
    expect(await res.json()).toMatchObject({ success: true, already_added: true });
    expect(fake.writes).toEqual([]);
  });

  it.each([
    ["Draft", { status: "draft" }],
    ["out of stock", { stock_quantity: 0 }],
    ["hidden", { is_visible: false }],
    ["a supply item", { is_supply: true }],
    ["another tenant's", { tenant_id: OTHER_TENANT }],
  ])("never offers or appends an add-on that is %s", async (_label, over) => {
    const t = tables();
    Object.assign(t.products[0], over);
    const fake = install(t);
    expect((await (await GET(getReq(proofFor()), ctx())).json()).offers).toEqual([]);
    expect((await POST(postReq({ product_id: ADDON }, proofFor()), ctx())).status).toBe(409);
    expect(fake.writes).toEqual([]);
  });

  it("never appends a variant-less line for a product sold by variant", async () => {
    const fake = install(tables({ product_variants: [{ id: "v1", tenant_id: TENANT, product_id: ADDON, price: 12000 }] }));
    expect((await (await GET(getReq(proofFor()), ctx())).json()).offers).toEqual([]);
    expect((await POST(postReq({ product_id: ADDON }, proofFor()), ctx())).status).toBe(409);
    expect(fake.writes).toEqual([]);
  });

  it("does not chain: an accepted add-on does not unlock its own add-ons", async () => {
    const NEXT = "d1b2c3d4-e5f6-4789-ab12-cd34ef567890";
    const t = tables({
      orders: [order({ items: [parentLine, { ...parentLine, product_id: ADDON, price: 8000 }] })],
    });
    t.product_order_bumps.push({ ...t.product_order_bumps[0], product_id: ADDON, bump_product_id: NEXT });
    t.products.push({ ...t.products[0], id: NEXT });
    const fake = install(t);
    expect((await POST(postReq({ product_id: NEXT }, proofFor()), ctx())).status).toBe(409);
    expect(fake.writes).toEqual([]);
  });

  it("P2-4: a free gift line is never the parent of an upsell", async () => {
    // The order's only bump-eligible line is the zero-price gift the checkout
    // added; it was never bought, so it earns no discounted add-on.
    const GIFT = "e2b2c3d4-e5f6-4789-ab12-cd34ef567890";
    const t = tables({
      orders: [order({ items: [{ ...parentLine, product_id: "f0b2c3d4-e5f6-4789-ab12-cd34ef567890" }, { ...parentLine, product_id: GIFT, price: 0 }] })],
    });
    t.product_order_bumps[0].product_id = GIFT;
    const fake = install(t);
    expect((await (await GET(getReq(proofFor()), ctx())).json()).offers).toEqual([]);
    expect((await POST(postReq({ product_id: ADDON }, proofFor()), ctx())).status).toBe(409);
    expect(fake.writes).toEqual([]);
  });

  it("ignores another tenant's offer for the same product ids", async () => {
    const t = tables();
    t.product_order_bumps[0].tenant_id = OTHER_TENANT;
    const fake = install(t);
    expect((await POST(postReq({ product_id: ADDON }, proofFor()), ctx())).status).toBe(409);
    expect(fake.writes).toEqual([]);
  });

  it("keeps stored lines it does not understand instead of dropping them", async () => {
    const odd = { product_id: PARENT, legacy: true };
    const fake = install(tables({ orders: [order({ items: [parentLine, odd] })] }));
    await POST(postReq({ product_id: ADDON }, proofFor()), ctx());
    expect(storedOrder(fake).items.slice(0, 2)).toEqual([parentLine, odd]);
  });

  it("rejects malformed input before touching the database", async () => {
    const res = await POST(postReq({ product_id: "nope" }, proofFor()), ctx());
    expect(res.status).toBe(400);
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });
});
