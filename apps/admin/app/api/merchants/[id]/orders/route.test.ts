import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/*
 * The merchant detail "recent orders" list selected customer_phone, total_iqd
 * and items_count. The orders table has none of those (phone, price, items), so
 * PostgREST rejected the query and the section always showed an error.
 */

vi.mock("@/lib/api-auth", () => ({
  requireAdminFromRequest: async () => ({ user: { id: "admin-1", email: "a@b.co" }, role: "super_admin" }),
}));

const selectSpy = vi.fn();
const rows = [
  { id: "o1", customer_name: "A", customer_phone: "0770", total_iqd: 34750, status: "new", created_at: "", updated_at: "", items: [{ n: 1 }, { n: 2 }] },
  { id: "o2", customer_name: "B", customer_phone: null, total_iqd: 1000, status: "new", created_at: "", updated_at: "", items: null },
];
vi.mock("@/lib/admin-supabase", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: (cols: string) => {
        selectSpy(cols);
        const chain = {
          eq: () => chain,
          order: () => chain,
          limit: () => Promise.resolve({ data: rows, error: null }),
        };
        return chain;
      },
    }),
  }),
}));

const { GET } = await import("./route");

const call = () =>
  GET(new NextRequest("http://admin.test/api/merchants/t1/orders"), { params: Promise.resolve({ id: "t1" }) });

beforeEach(() => {
  selectSpy.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/merchants/[id]/orders", () => {
  it("selects only columns that exist on orders, aliasing phone and price", async () => {
    await call();
    const cols = (selectSpy.mock.calls[0][0] as string).split(",").map((c) => c.trim());
    expect(cols).toContain("customer_phone:phone");
    expect(cols).toContain("total_iqd:price");
    expect(cols).toContain("items");
    for (const bad of ["customer_phone", "total_iqd", "items_count"]) expect(cols).not.toContain(bad);
  });

  it("derives items_count from the items array and does not leak the array", async () => {
    const res = await call();
    const body = (await res.json()) as { orders: Record<string, unknown>[] };
    expect(body.orders[0].items_count).toBe(2);
    expect(body.orders[1].items_count).toBe(0);
    expect(body.orders[0]).not.toHaveProperty("items");
    expect(body.orders[0].total_iqd).toBe(34750);
  });
});
