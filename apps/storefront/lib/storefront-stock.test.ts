import { describe, it, expect } from "vitest";
import { storefrontAvailable, withStorefrontStock } from "./storefront-stock";

describe("storefront stock", () => {
  it("is the real stock minus reserved when the merchant set none", () => {
    expect(storefrontAvailable({ stock_quantity: 10, reserved_quantity: 3, storefront_stock: null })).toBe(7);
    expect(storefrontAvailable({ stock_quantity: null, reserved_quantity: null, storefront_stock: null })).toBe(0);
  });

  it("is the merchant's storefront stock when set, whatever the real count", () => {
    expect(storefrontAvailable({ stock_quantity: 0, reserved_quantity: 4, storefront_stock: 17 })).toBe(17);
    expect(storefrontAvailable({ stock_quantity: 50, reserved_quantity: 0, storefront_stock: 0 })).toBe(0);
  });

  it("hands sections a row whose own stock maths lands on the storefront stock", () => {
    const row = withStorefrontStock({ id: "p", stock_quantity: 0, reserved_quantity: 4, storefront_stock: 17 });
    expect(row).toEqual({ id: "p", stock_quantity: 17, reserved_quantity: 0, storefront_stock: 17 });
  });

  it("leaves the row untouched when no storefront stock is set", () => {
    const row = { id: "p", stock_quantity: 9, reserved_quantity: 2, storefront_stock: null };
    expect(withStorefrontStock(row)).toBe(row);
  });
});
