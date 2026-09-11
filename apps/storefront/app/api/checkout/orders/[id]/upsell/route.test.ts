import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceClient: vi.fn(),
}));

import { GET, POST } from "./route";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const TENANT = "f1e2d3c4-b5a6-4789-8f12-cd34ef567890";
const ORDER = "11111111-1111-4111-8111-111111111111";
const PARENT = "a1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const ADDON = "b1b2c3d4-e5f6-4789-ab12-cd34ef567890";
const PHONE = "07701234567";

/** A tiny query-builder stub: `.from(table)` returns chained no-ops that
 *  resolve to whatever `rows[table]` holds. `update` records its payload. */
function makeSvc(rows: Record<string, unknown>, opts: { updateReturns?: unknown } = {}) {
  const updates: unknown[] = [];
  const chain = (table: string) => {
    const result = { data: rows[table] ?? null, error: null };
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "update"]) {
      c[m] = (...args: unknown[]) => {
        if (m === "update") updates.push(args[0]);
        return c;
      };
    }
    c.maybeSingle = () => Promise.resolve(
      updates.length && table === "orders" && "updateReturns" in opts
        ? { data: opts.updateReturns, error: null }
        : result,
    );
    c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    return c;
  };
  return { from: chain, updates };
}

function freshOrder(over: Record<string, unknown> = {}) {
  return {
    id: ORDER, tenant_id: TENANT, status: "new", phone: "9647701234567",
    items: [{ product_id: PARENT, variant_id: null, name: "X", variant_name: null, price: 30000, quantity: 1 }],
    price: 30000, delivery_fee: 5000, created_at: new Date().toISOString(), version: 3, deleted_at: null,
    ...over,
  };
}

const bump = { product_id: PARENT, bump_product_id: ADDON, discount_percentage: 20, headline: null, description: null, is_active: true, display_order: 0 };
const addon = { id: ADDON, name: "Addon", short_name: null, image_url: null, price: 10000, website_price: null, status: "active", is_visible: true, is_archived: false, is_supply: false, stock_quantity: 5, reserved_quantity: 0 };
// products.status is NOT NULL in the database, so a row is never statusless.
const draftAddon = { ...addon, status: "draft" };

const ctx = { params: Promise.resolve({ id: ORDER }) };
const getReq = (phone = PHONE) =>
  new Request(`http://x/api/checkout/orders/${ORDER}/upsell?tenant_id=${TENANT}&phone=${phone}`);
const postReq = (body: unknown) =>
  new Request(`http://x/api/checkout/orders/${ORDER}/upsell`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /upsell", () => {
  it("lists the add-ons of what was ordered, priced at the discount", async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSvc({ orders: freshOrder(), product_order_bumps: [bump], products: [addon] }) as never,
    );
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.offers).toHaveLength(1);
    expect(body.offers[0]).toMatchObject({ product_id: ADDON, base_price: 10000, offer_price: 8000 });
  });

  it("does not offer an add-on the merchant set back to Draft", async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSvc({ orders: freshOrder(), product_order_bumps: [bump], products: [draftAddon] }) as never,
    );
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).offers).toHaveLength(0);
  });

  it("is a 404 for the wrong phone — indistinguishable from no such order", async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSvc({ orders: freshOrder(), product_order_bumps: [bump], products: [addon] }) as never,
    );
    expect((await GET(getReq("07709999999"), ctx)).status).toBe(404);
  });

  it("refuses once ops have touched the order", async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSvc({ orders: freshOrder({ status: "confirmed" }) }) as never,
    );
    expect((await GET(getReq(), ctx)).status).toBe(404);
  });

  it("refuses an order older than the window", async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSvc({ orders: freshOrder({ created_at: old }) }) as never,
    );
    expect((await GET(getReq(), ctx)).status).toBe(404);
  });

  it("offers nothing that is already in the order", async () => {
    const order = freshOrder({ items: [
      { product_id: PARENT, variant_id: null, name: "X", variant_name: null, price: 30000, quantity: 1 },
      { product_id: ADDON, variant_id: null, name: "A", variant_name: null, price: 8000, quantity: 1 },
    ]});
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSvc({ orders: order, product_order_bumps: [bump], products: [addon] }) as never,
    );
    expect((await (await GET(getReq(), ctx)).json()).offers).toEqual([]);
  });

  it("offers nothing that is out of stock", async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSvc({ orders: freshOrder(), product_order_bumps: [bump], products: [{ ...addon, stock_quantity: 0 }] }) as never,
    );
    expect((await (await GET(getReq(), ctx)).json()).offers).toEqual([]);
  });
});

describe("POST /upsell", () => {
  it("appends the line at the server-derived price and returns the new total", async () => {
    const svc = makeSvc(
      { orders: freshOrder(), product_order_bumps: [bump], products: [addon] },
      { updateReturns: { price: 38000, delivery_fee: 5000 } },
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never);
    const res = await POST(postReq({ tenant_id: TENANT, phone: PHONE, product_id: ADDON }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, offer_price: 8000, total: 43000 });
    // The written line carries the SERVER's price, whatever the client sent.
    const payload = svc.updates[0] as { items: Array<{ product_id: string; price: number }>; price: number };
    expect(payload.items.at(-1)).toMatchObject({ product_id: ADDON, price: 8000, quantity: 1 });
    expect(payload.price).toBe(38000);
  });

  it("rejects a product that is not an eligible offer", async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSvc({ orders: freshOrder(), product_order_bumps: [bump], products: [addon] }) as never,
    );
    const res = await POST(postReq({ tenant_id: TENANT, phone: PHONE, product_id: PARENT }), ctx);
    expect(res.status).toBe(409);
  });

  it("reports a conflict when the optimistic update matches no row", async () => {
    const svc = makeSvc(
      { orders: freshOrder(), product_order_bumps: [bump], products: [addon] },
      { updateReturns: null },
    );
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never);
    const res = await POST(postReq({ tenant_id: TENANT, phone: PHONE, product_id: ADDON }), ctx);
    expect(res.status).toBe(409);
  });

  it("rejects malformed input before touching the database", async () => {
    const res = await POST(postReq({ tenant_id: "nope", phone: PHONE, product_id: ADDON }), ctx);
    expect(res.status).toBe(400);
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });
});
