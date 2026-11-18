import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { LEAD_GONE } from "@/lib/lead-update";

/**
 * build-store is one call to admin_build_prospect_store, which writes the
 * shop, products, wallet, lead link, history and staff log in one locked
 * transaction (its rules are pinned by the database behaviour test
 * build-prospect-store). These tests pin the route's side: what it sends,
 * who it names, and how each answer reaches the screen.
 */

const LEAD = "44444444-4444-4444-8444-444444444444";
const TENANT = "33333333-3333-4333-8333-333333333333";
const ADMIN = "11111111-1111-4111-8111-111111111111";

type DbError = { code: string; message: string } | null;
let rpcAnswer: { data: unknown; error: DbError };
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
const tableCalls: string[] = [];

vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return rpcAnswer;
    },
    from: (table: string) => {
      tableCalls.push(table);
      throw new Error(`build-store wrote to ${table} outside the database function`);
    },
  }),
  requireAdmin: vi.fn(async (token: string) =>
    token === "admin" ? { user: { id: ADMIN, email: "karrar@x.test" }, role: "super_admin" } : null,
  ),
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  rpcCalls.length = 0;
  tableCalls.length = 0;
  rpcAnswer = { data: { success: true, tenant_id: TENANT, slug: "kut-perfumes-1a2b3c4d" }, error: null };
});

function buildStore(body: unknown = {}): Promise<Response> {
  return import("./route").then(({ POST }) =>
    POST(
      new NextRequest(`http://admin.test/api/leads/${LEAD}/build-store`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer admin" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: LEAD }) },
    ),
  );
}

describe("POST /api/leads/[id]/build-store", () => {
  it("builds the store in one database call, named for the signed-in staff member", async () => {
    const res = await buildStore({
      template: "perfume",
      primary_color: "#1E1E1E",
      business_name: " Zara Baghdad ",
      slug: "zara-baghdad",
      industry_id: "55555555-5555-4555-8555-555555555555",
      description: " Women's clothes ",
      products: [{ name: " Oud ", price: 25000 }, { name: "Musk", price: 15000, image_url: "https://x.test/m.png" }],
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      tenant: { id: TENANT, slug: "kut-perfumes-1a2b3c4d" },
      store_url: "/s/kut-perfumes-1a2b3c4d",
    });
    expect(rpcCalls).toEqual([
      {
        fn: "admin_build_prospect_store",
        args: {
          _lead_id: LEAD,
          _template: "perfume",
          _primary_color: "#1E1E1E",
          _products: [
            { name: "Oud", price: 25000, description: null, image_url: null },
            { name: "Musk", price: 15000, description: null, image_url: "https://x.test/m.png" },
          ],
          _admin_user_id: ADMIN,
          _actor_email: "karrar@x.test",
          _business_name: "Zara Baghdad",
          _address: "zara-baghdad",
          _industry_id: "55555555-5555-4555-8555-555555555555",
          _description: "Women's clothes",
        },
      },
    ]);
    expect(tableCalls).toEqual([]);
  });

  it("sends the general template, no colour, no products and no form fields when the dialog sends none", async () => {
    await buildStore({});
    expect(rpcCalls[0]?.args).toMatchObject({
      _template: "general",
      _primary_color: null,
      _products: [],
      _business_name: null,
      _address: null,
      _industry_id: null,
      _description: null,
    });
  });

  it("sends blank form fields as none, so the database uses the lead's name", async () => {
    await buildStore({ business_name: "  ", slug: "", description: " " });
    expect(rpcCalls[0]?.args).toMatchObject({ _business_name: null, _address: null, _description: null });
  });

  it("refuses an industry that is not an id, and an over-long web address, before calling the database", async () => {
    expect((await buildStore({ industry_id: "fashion" })).status).toBe(400);
    expect((await buildStore({ slug: "a".repeat(61) })).status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it("refuses bad details before calling the database", async () => {
    const res = await buildStore({ products: [{ name: "Half", price: 1500.5 }] });
    expect(res.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });

  it.each([
    [{ slug: "a".repeat(61) }, "The web address can have at most 60 characters."],
    [{ industry_id: "fashion" }, "Pick an industry from the list."],
    [{ products: [{ name: "Half", price: 1500.5 }] }, "A product price is whole dinars, with no fraction."],
    [{ products: [{ name: "Bag", price: 5000, image_url: "bag.jpg" }] }, "A product image must be a full web link, such as https://…/photo.jpg."],
    [{ products: [{ name: "Bag", price: 5000, image_url: "ftp://x.test/bag.jpg" }] }, "A product image must be a full web link, such as https://…/photo.jpg."],
    [{ products: [{ name: "Bag", price: 5000, image_url: "data:image/png;base64,AA" }] }, "A product image must be a full web link, such as https://…/photo.jpg."],
    [{ products: [{ name: " ", price: 5000 }] }, "Each product needs a name."],
  ])("names the field it refuses (%j)", async (details, words) => {
    // One "Invalid store details" for every case named no field.
    const res = await buildStore(details);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: words });
    expect(rpcCalls).toHaveLength(0);
  });

  it.each([
    ["not_found", 404, LEAD_GONE],
    ["converted", 409, "Lead already converted"],
    ["store_exists", 409, "A store already exists for this lead"],
    ["bad_input", 400, "Invalid store details"],
  ])("answers %s with %i and plain words", async (code, status, words) => {
    rpcAnswer = { data: { success: false, error: code }, error: null };
    const res = await buildStore();
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: words });
  });

  it("answers a database failure with 500 and no database text", async () => {
    rpcAnswer = { data: null, error: { code: "23514", message: 'new row violates check constraint "products_money_whole_iqd"' } };
    const res = await buildStore();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to build store" });
  });

  it("answers an answer it does not know with 500", async () => {
    rpcAnswer = { data: { success: true }, error: null };
    const res = await buildStore();
    expect(res.status).toBe(500);
  });
});
