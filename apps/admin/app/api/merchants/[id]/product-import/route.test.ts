import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { supabaseStub, type Row } from "@/lib/supabase-stub.test-data";

const guard = vi.hoisted(() => ({ allowed: true, actions: [] as string[] }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: async (_request: unknown, action: string) => {
    guard.actions.push(action);
    return guard.allowed
      ? { user: { id: "9a1c2b3d-0000-4000-8000-000000000001", email: "noor@fermi.test" }, role: "support_staff" }
      : NextResponse.json({ error: "Your login cannot do this. Ask a super admin." }, { status: 403 });
  },
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { POST } = await import("./route");
const SHOP = "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d";
const call = (body: unknown, id = SHOP) =>
  POST(
    new NextRequest(`http://admin.test/api/merchants/${id}/product-import`, { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );

/** A product as the screen plans it: what the database gets, plus its image links and file rows. */
const planned = (key: string, name: string): Row => ({
  key,
  name,
  slug: null,
  description: null,
  category: "عطور",
  category_slug: "category",
  price: 35_000,
  cost: null,
  compare_at_price: null,
  stock: 4,
  sku: null,
  barcode: null,
  options: [],
  variants: [],
  images: ["https://a.example/1.jpg"],
  rows: [Number(key)],
});

beforeEach(() => {
  stub = supabaseStub();
  guard.allowed = true;
  guard.actions = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  stub.state.functions.admin_import_products = () => ({
    data: { created: [{ key: "2", product_id: "5b0b0b0b-0000-4000-8000-000000000002" }], skipped: [{ key: "3", reason: "in_shop" }] },
    error: null,
  });
});

describe("POST /api/merchants/[id]/product-import", () => {
  it("sends one batch to the database under the admin who imports, without the screen's own fields", async () => {
    const res = await call({ fileName: " products.xlsx ", products: [planned("2", "عطر"), planned("3", "مسك")] });

    expect(res.status).toBe(200);
    expect(guard.actions).toEqual(["import_products"]);
    expect(await res.json()).toEqual({
      created: [{ key: "2", product_id: "5b0b0b0b-0000-4000-8000-000000000002" }],
      skipped: [{ key: "3", reason: "in_shop" }],
    });
    expect(stub.state.rpcCalls).toHaveLength(1);
    const args = stub.state.rpcCalls[0]?.args ?? {};
    expect(stub.state.rpcCalls[0]?.fn).toBe("admin_import_products");
    expect(args).toMatchObject({
      p_tenant: SHOP,
      p_admin_user_id: "9a1c2b3d-0000-4000-8000-000000000001",
      p_actor_email: "noor@fermi.test",
      p_file_name: "products.xlsx",
    });
    const sent = args.p_products as Row[];
    expect(sent.map((p) => p.name)).toEqual(["عطر", "مسك"]);
    expect(sent[0]).not.toHaveProperty("images");
    expect(sent[0]).not.toHaveProperty("rows");
  });

  it("refuses a batch that is empty, too big or not products, before the database", async () => {
    expect((await call({ fileName: "a.csv", products: [] })).status).toBe(400);
    const many = Array.from({ length: 101 }, (_, i) => planned(String(i + 2), `p${i}`));
    expect((await call({ fileName: "a.csv", products: many })).status).toBe(400);
    expect((await call({ fileName: "a.csv", products: [{ ...planned("2", "عطر"), price: 0 }] })).status).toBe(400);
    expect((await call({ fileName: "", products: [planned("2", "عطر")] })).status).toBe(400);
    expect((await call("not json")).status).toBe(400);
    expect(stub.state.rpcCalls).toHaveLength(0);
  });

  it("names the database's refusals; nothing of the batch was added", async () => {
    const refuse = (error: Row) => {
      stub.state.functions.admin_import_products = () => ({ data: null, error: error as { message: string } });
      return call({ fileName: "a.csv", products: [planned("2", "عطر")] });
    };
    let res = await refuse({ code: "23505", message: "duplicate key value violates unique constraint" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/SKU or barcode/);

    res = await refuse({ code: "P0001", message: "blocked", hint: "TENANT_PAUSED:new_products" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/paused/);

    expect((await refuse({ code: "P0002", message: "no such shop" })).status).toBe(404);
    expect((await refuse({ code: "22023", message: "product 2 is not a product" })).status).toBe(400);
    expect((await refuse({ code: "P0001", message: "something else" })).status).toBe(500);
    expect((await refuse({ message: "connection lost" })).status).toBe(500);

    stub.state.functions.admin_import_products = () => ({ data: { created: "all" }, error: null });
    expect((await call({ fileName: "a.csv", products: [planned("2", "عطر")] })).status).toBe(500);
  });

  it("is for the team that sets up shops, and answers 404 for an id that is no shop", async () => {
    expect((await call({ fileName: "a.csv", products: [planned("2", "عطر")] }, "not-a-shop")).status).toBe(404);
    guard.allowed = false;
    expect((await call({ fileName: "a.csv", products: [planned("2", "عطر")] })).status).toBe(403);
    expect(stub.state.rpcCalls).toHaveLength(0);
  });
});
