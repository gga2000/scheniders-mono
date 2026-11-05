import { describe, it, expect } from "vitest";
import { KEEP_SELLING_UNITS, storefrontAvailable, withKeepSellingVariant, withStorefrontStock } from "./storefront-stock";

const base = { stock_quantity: 10, reserved_quantity: 3, storefront_stock: null, storefront_sold_out: false };

describe("storefront stock", () => {
  it("is the real stock minus reserved while there is any", () => {
    expect(storefrontAvailable(base)).toBe(7);
  });

  it("keeps selling when the real count reaches zero or goes negative", () => {
    expect(storefrontAvailable({ ...base, stock_quantity: 3 })).toBe(KEEP_SELLING_UNITS);
    expect(storefrontAvailable({ ...base, stock_quantity: -17, reserved_quantity: 6 })).toBe(KEEP_SELLING_UNITS);
    expect(storefrontAvailable({ ...base, stock_quantity: null, reserved_quantity: null })).toBe(KEEP_SELLING_UNITS);
  });

  it("is the merchant's storefront stock when set, whatever the real count", () => {
    expect(storefrontAvailable({ ...base, stock_quantity: 0, storefront_stock: 17 })).toBe(17);
    expect(storefrontAvailable({ ...base, stock_quantity: 50, reserved_quantity: 0, storefront_stock: 0 })).toBe(0);
  });

  it("is zero when the merchant marked it out of stock, whatever the counts", () => {
    expect(storefrontAvailable({ ...base, storefront_sold_out: true })).toBe(0);
    expect(storefrontAvailable({ ...base, storefront_sold_out: true, storefront_stock: 36 })).toBe(0);
  });

  it("hands sections a row whose own stock maths lands on the available units", () => {
    expect(withStorefrontStock({ id: "p", ...base, stock_quantity: -17, reserved_quantity: 6 })).toEqual({
      id: "p", stock_quantity: KEEP_SELLING_UNITS, reserved_quantity: 0, storefront_stock: null, storefront_sold_out: false,
    });
    expect(withStorefrontStock({ id: "p", ...base, storefront_sold_out: true }).stock_quantity).toBe(0);
  });

  it("never closes a variant by its real count", () => {
    expect(withKeepSellingVariant({ stock_quantity: 0, reserved_quantity: 0 }).stock_quantity).toBe(KEEP_SELLING_UNITS);
    expect(withKeepSellingVariant({ stock_quantity: 5, reserved_quantity: 1 })).toEqual({ stock_quantity: 5, reserved_quantity: 1 });
  });
});
