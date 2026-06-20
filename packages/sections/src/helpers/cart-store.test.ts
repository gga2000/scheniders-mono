import { describe, it, expect } from "vitest";
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
