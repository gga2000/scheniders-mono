import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { supabaseStub } from "@/lib/supabase-stub.test-data";

const guard = vi.hoisted(() => ({ allowed: true, actions: [] as string[] }));
vi.mock("@/lib/api-auth", () => ({
  requireAdminPermission: async (_request: unknown, action: string) => {
    guard.actions.push(action);
    return guard.allowed
      ? { user: { id: "a", email: "a@b.co" }, role: "support_staff" }
      : NextResponse.json({ error: "Your login cannot do this. Ask a super admin." }, { status: 403 });
  },
}));

let stub: ReturnType<typeof supabaseStub>;
vi.mock("@/lib/admin-supabase", () => ({ createAdminClient: () => stub.client }));

const { POST } = await import("./route");
const SHOP = "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d";
const OTHER = "7e5f7eac-fbf5-43fa-bcb2-b9bf66b04eae";

function call(file: File | null, id = SHOP) {
  const form = new FormData();
  if (file) form.set("file", file);
  const request = new NextRequest(`http://admin.test/api/merchants/${id}/product-import/read`, { method: "POST", body: form });
  return POST(request, { params: Promise.resolve({ id }) });
}
const csv = (text: string, name = "products.csv") => new File([text], name, { type: "text/csv" });

beforeEach(() => {
  stub = supabaseStub();
  guard.allowed = true;
  guard.actions = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  stub.state.tables.tenants = [{ id: SHOP }, { id: OTHER }];
  stub.state.tables.products = [
    { id: "p1", tenant_id: SHOP, name: "عطر عود", sku: "OUD-1", barcode: "111", is_archived: false },
    { id: "p2", tenant_id: SHOP, name: "قميص قديم", sku: " OLD-1 ", barcode: null, is_archived: true },
    { id: "p3", tenant_id: OTHER, name: "مسك", sku: "MSK", barcode: "999", is_archived: false },
  ];
  stub.state.tables.product_variants = [
    { id: "v1", tenant_id: SHOP, sku: "OUD-1-S" },
    { id: "v2", tenant_id: SHOP, sku: null },
    { id: "v3", tenant_id: OTHER, sku: "MSK-S" },
  ];
});

describe("POST /api/merchants/[id]/product-import/read", () => {
  it("answers the file's rows, a guess at its columns and what the shop already has", async () => {
    const res = await call(csv("الاسم,السعر,الكمية\nعطر,35000,4\n"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(guard.actions).toEqual(["import_products"]);
    expect(body.file).toEqual({ sheet: null, headers: ["الاسم", "السعر", "الكمية"], rows: [["عطر", "35000", "4"]], firstRow: 2 });
    expect(body.mapping).toEqual(["name", "price", "stock"]);
    // An archived product frees its name but keeps its SKU; another shop's products are not this shop's.
    expect(body.shop).toEqual({ names: ["عطر عود"], skus: ["OUD-1", "OLD-1", "OUD-1-S"], barcodes: ["111"] });
  });

  it("reads every product of a shop past the 1,000 rows one answer holds", async () => {
    stub.state.tables.products = Array.from({ length: 1001 }, (_, i) => ({
      id: `p${String(i).padStart(4, "0")}`,
      tenant_id: SHOP,
      name: `منتج ${i}`,
      sku: null,
      barcode: null,
      is_archived: false,
    }));
    const body = await (await call(csv("name,price\nx,1\n"))).json();
    expect(body.shop.names).toHaveLength(1001);
  });

  it("says what is wrong with a file it cannot read, before the database", async () => {
    let res = await call(null);
    expect(res.status).toBe(400);

    res = await call(new File(["%PDF"], "list.pdf"));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Excel file \(\.xlsx\) or a CSV/);

    res = await call(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.csv"));
    expect(res.status).toBe(413);
    expect(stub.state.calls).toHaveLength(0);
  });

  it("is for the team that sets up shops", async () => {
    guard.allowed = false;
    expect((await call(csv("name,price\nx,1\n"))).status).toBe(403);
    expect(stub.state.calls).toHaveLength(0);
  });

  it("answers 404 for an id that is no shop and 500 for a failed read", async () => {
    expect((await call(csv("name,price\nx,1\n"), "not-a-shop")).status).toBe(404);
    expect((await call(csv("name,price\nx,1\n"), "8f6f8fbd-0c06-44fb-8dc3-cac0f77c15bf")).status).toBe(404);

    stub.state.failing.add("product_variants");
    expect((await call(csv("name,price\nx,1\n"))).status).toBe(500);
  });
});
