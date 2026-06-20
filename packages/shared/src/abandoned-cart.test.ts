import { describe, it, expect } from "vitest";
import { cartItemsSubtotal, cartItemCount } from "./abandoned-cart";

describe("cartItemsSubtotal", () => {
  it("sums price × quantity", () => {
    expect(
      cartItemsSubtotal([
        { price: 5000, quantity: 2 },
        { price: 3000, quantity: 1 },
      ]),
    ).toBe(13000);
  });

  it("floors negatives to 0 and is empty-safe", () => {
    expect(cartItemsSubtotal([{ price: -5, quantity: 3 }])).toBe(0);
    expect(cartItemsSubtotal([{ price: 1000, quantity: -2 }])).toBe(0);
    expect(cartItemsSubtotal([])).toBe(0);
  });
});

describe("cartItemCount", () => {
  it("sums quantities, flooring negatives", () => {
    expect(
      cartItemCount([{ quantity: 2 }, { quantity: 3 }, { quantity: -1 }]),
    ).toBe(5);
  });
});
