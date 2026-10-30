// The express cart line: the chosen variant and quantity at the receipt's
// unit price, the base price and ladder for the cart's re-pricing, and the
// name the page shows.

import { describe, expect, it } from "vitest";
import type { PriceTier } from "@scheniders/shared";
import { VARIANT_100, plainProduct, saleProduct } from "../_pdp-fixtures";
import { cartQuantityOf, expressCartLine } from "./cart-line";

const LADDER: PriceTier[] = [{ min_quantity: 2, max_quantity: null, price: 22000 }];

describe("expressCartLine", () => {
  it("a plain product: no variant, the express name, the product image", () => {
    expect(
      expressCartLine({ product: plainProduct, variant: null, qty: 1, price: 18000, unitPrice: 18000 }),
    ).toEqual({
      product_id: plainProduct.id,
      variant_id: null,
      name: "عطر تجريبي",
      variant_name: null,
      price: 18000,
      quantity: 1,
      image_url: plainProduct.image_url,
      base_price: 18000,
    });
  });

  it("the chosen variant and quantity, at the variant's price", () => {
    const line = expressCartLine({ product: saleProduct, variant: VARIANT_100, qty: 3, price: 40000, unitPrice: 40000 });
    expect(line.variant_id).toBe(VARIANT_100.id);
    expect(line.variant_name).toBe("100ml");
    expect(line.quantity).toBe(3);
    expect(line.price).toBe(40000);
    expect(line.base_price).toBe(40000);
  });

  it("a quantity break: the line carries the break price, the base and the ladder", () => {
    const line = expressCartLine({
      product: { ...saleProduct, price_tiers: LADDER },
      variant: null,
      qty: 2,
      price: 25000,
      unitPrice: 22000,
    });
    expect(line.price).toBe(22000);
    expect(line.base_price).toBe(25000);
    expect(line.price_tiers).toEqual(LADDER);
  });

  it("names the line as the page does, not by the long catalogue title", () => {
    const line = expressCartLine({
      product: { ...saleProduct, display_name: "ويفر انتنس" },
      variant: null,
      qty: 1,
      price: 25000,
      unitPrice: 25000,
    });
    expect(line.name).toBe("ويفر انتنس");
  });
});

describe("cartQuantityOf", () => {
  it("counts this product and variant only", () => {
    const plain = expressCartLine({ product: plainProduct, variant: null, qty: 2, price: 18000, unitPrice: 18000 });
    const v100 = expressCartLine({ product: saleProduct, variant: VARIANT_100, qty: 3, price: 40000, unitPrice: 40000 });
    const items = [plain, v100];
    expect(cartQuantityOf(items, plainProduct.id, null)).toBe(2);
    expect(cartQuantityOf(items, saleProduct.id, VARIANT_100.id)).toBe(3);
    expect(cartQuantityOf(items, saleProduct.id, null)).toBe(0);
    expect(cartQuantityOf([], plainProduct.id, null)).toBe(0);
  });
});
