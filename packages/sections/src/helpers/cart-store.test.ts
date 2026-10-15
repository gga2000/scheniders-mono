import { describe, it, expect, beforeEach } from "vitest";
import { cartKeyFor, useCart } from "./cart-store";

const BASE = "scheniders-cart";

describe("cart governorate (shipping R2b)", () => {
  it("setGovernorate broadcasts the chosen governorate", () => {
    useCart.getState().setGovernorate("BA");
    expect(useCart.getState().governorate).toBe("BA");
    useCart.getState().setGovernorate(null);
    expect(useCart.getState().governorate).toBeNull();
  });
});

describe("cartKeyFor (EC22 — per-tenant cart isolation)", () => {
  it("namespaces the key by the /s/<tenant> path segment", () => {
    expect(cartKeyFor(BASE, "/s/tenant-a/products/x")).toBe(
      `${BASE}:tenant-a`,
    );
    expect(cartKeyFor(BASE, "/s/tenant-b")).toBe(`${BASE}:tenant-b`);
  });

  it("gives two tenants on one origin DISTINCT keys (no bleed)", () => {
    const a = cartKeyFor(BASE, "/s/store-a/cart");
    const b = cartKeyFor(BASE, "/s/store-b/cart");
    expect(a).not.toBe(b);
  });

  it("falls back to the base key off a custom domain (no /s/ segment)", () => {
    expect(cartKeyFor(BASE, "/products/x")).toBe(BASE);
    expect(cartKeyFor(BASE, "/")).toBe(BASE);
  });

  it("decodes an encoded tenant segment", () => {
    expect(cartKeyFor(BASE, "/s/caf%C3%A9-shop/cart")).toBe(`${BASE}:café-shop`);
  });
});

// =====================================================================
// The cart follows the merchant's quantity ladder.
// =====================================================================
// It did not. A line kept the price it was added at, while the checkout
// re-resolved the ladder for whatever quantity was finally submitted. Raise
// the quantity in the cart past a price break and the two disagreed, which
// surfaced to the shopper as "prices changed — review your cart" on a COD
// checkout, when nothing had changed at all.
// =====================================================================

const TIERS = [
    { min_quantity: 3, price: 9000 },
    { min_quantity: 5, price: 8000 },
];

const line = (over: Record<string, unknown> = {}) => ({
    product_id: "p1",
    variant_id: null,
    name: "عطر",
    variant_name: null,
    price: 10000,
    quantity: 1,
    image_url: null,
    base_price: 10000,
    price_tiers: TIERS,
    ...over,
});

describe("cart repricing against the quantity ladder", () => {
    beforeEach(() => useCart.getState().clearCart());

    it("applies a price break when the quantity rises in the cart", () => {
        useCart.getState().addItem(line() as never);
        useCart.getState().updateQuantity("p1", null, 3);
        expect(useCart.getState().items[0].price).toBe(9000);
        useCart.getState().updateQuantity("p1", null, 5);
        expect(useCart.getState().items[0].price).toBe(8000);
    });

    it("goes back up when the quantity falls again", () => {
        // Repricing reads `base_price`, never the current price, so it cannot
        // ratchet downward or compound.
        useCart.getState().addItem(line() as never);
        useCart.getState().updateQuantity("p1", null, 5);
        expect(useCart.getState().items[0].price).toBe(8000);
        useCart.getState().updateQuantity("p1", null, 1);
        expect(useCart.getState().items[0].price).toBe(10000);
    });

    it("is idempotent", () => {
        useCart.getState().addItem(line() as never);
        for (let n = 0; n < 5; n++) useCart.getState().updateQuantity("p1", null, 5);
        expect(useCart.getState().items[0].price).toBe(8000);
    });

    it("crosses a break by adding the same product again", () => {
        useCart.getState().addItem(line({ quantity: 2 }) as never);
        useCart.getState().addItem(line({ quantity: 1 }) as never);
        const item = useCart.getState().items[0];
        expect(item.quantity).toBe(3);
        expect(item.price).toBe(9000);
    });

    it("leaves a line with no ladder alone", () => {
        useCart.getState().addItem(line({ price_tiers: undefined }) as never);
        useCart.getState().updateQuantity("p1", null, 5);
        expect(useCart.getState().items[0].price).toBe(10000);
    });

    it("leaves a cart persisted before `base_price` existed alone", () => {
        // Nothing to recompute from; guessing would be worse than letting the
        // server correct it at submit.
        useCart.getState().addItem(
            line({ base_price: undefined, price_tiers: undefined }) as never,
        );
        useCart.getState().updateQuantity("p1", null, 5);
        expect(useCart.getState().items[0].price).toBe(10000);
    });

    it("still totals price × quantity", () => {
        useCart.getState().addItem(line() as never);
        useCart.getState().updateQuantity("p1", null, 5);
        expect(useCart.getState().getTotal()).toBe(40000);
    });
});
