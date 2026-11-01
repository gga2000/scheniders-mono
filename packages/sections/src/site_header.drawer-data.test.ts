import { describe, expect, it } from "vitest";
import { buildDrawerCategories, DRAWER_CATEGORY_LIMIT } from "./site_header.drawer-data";
import type { Category, Product } from "./types";

const cat = (id: string, extra: Partial<Category> = {}): Category =>
  ({ id, name: id, slug: id, display_order: 0, image_url: null, show_in_mobile_drawer: true, ...extra }) as Category;
const prod = (id: string, stock: number, images: string[] = [`/${id}.jpg`]): Product =>
  ({ id, name: id, price: 1000, stock_quantity: stock, reserved_quantity: 0, images }) as Product;

describe("buildDrawerCategories", () => {
  const products = [prod("sold", 0), prod("live", 3), prod("bare", 2, [])];

  it("drops categories not marked for the drawer and empty ones", () => {
    const rows = buildDrawerCategories(
      [cat("men"), cat("hidden", { show_in_mobile_drawer: false }), cat("empty")],
      products,
      { men: ["live"], hidden: ["live"], empty: ["gone"] },
    );
    expect(rows.map((r) => r.id)).toEqual(["men"]);
  });

  it("counts members the catalogue really has, from the same membership as the chips", () => {
    const [row] = buildDrawerCategories([cat("men")], products, { men: ["sold", "live", "gone"] });
    expect(row?.count).toBe(2);
    expect(row?.href).toBe("/categories/men");
  });

  it("pictures an in-stock perfume before a sold-out one, and the category's own image first", () => {
    const [plain] = buildDrawerCategories([cat("men")], products, { men: ["sold", "bare", "live"] });
    expect(plain?.image).toBe("/live.jpg");
    const [own] = buildDrawerCategories([cat("men", { image_url: "/men.jpg" })], products, { men: ["live"] });
    expect(own?.image).toBe("/men.jpg");
    const [none] = buildDrawerCategories([cat("men")], products, { men: ["bare"] });
    expect(none?.image).toBeNull();
  });

  it("follows the merchant's display order and caps the list", () => {
    const many = Array.from({ length: 9 }, (_, i) => cat(`c${i}`, { display_order: 9 - i }));
    const ids = Object.fromEntries(many.map((c) => [c.id, ["live"]]));
    const rows = buildDrawerCategories(many, products, ids);
    expect(rows).toHaveLength(DRAWER_CATEGORY_LIMIT);
    expect(rows[0]?.id).toBe("c8");
  });
});
