import { describe, expect, it } from "vitest";
import { catalogueUnitPrice, type CatalogueProduct, type CatalogueVariant } from "./catalogue-line";

const P = "p1";
const V = "v1";
const product = (overrides: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  status: "active",
  is_visible: true,
  is_archived: false,
  is_supply: false,
  price: 25000,
  website_price: null,
  ...overrides,
});
const variants = (v: Partial<CatalogueVariant> = {}): Map<string, CatalogueVariant> =>
  new Map([[V, { product_id: P, price: 30000, is_enabled: true, ...v }]]);
const none = new Set<string>();

describe("catalogueUnitPrice", () => {
  it("prices a plain line at the website price, else the base price", () => {
    expect(catalogueUnitPrice({ product_id: P }, product(), new Map(), none)).toBe(25000);
    expect(catalogueUnitPrice({ product_id: P }, product({ website_price: 22000 }), new Map(), none)).toBe(22000);
  });

  it("prices a variant line at the variant, falling back to the product", () => {
    expect(catalogueUnitPrice({ product_id: P, variant_id: V }, product(), variants(), none)).toBe(30000);
    expect(
      catalogueUnitPrice({ product_id: P, variant_id: V }, product({ website_price: 22000 }), variants({ price: null }), none),
    ).toBe(22000);
  });

  it.each<[string, CatalogueProduct | undefined]>([
    ["missing", undefined],
    ["archived", product({ is_archived: true })],
    ["draft", product({ status: "draft" })],
    ["hidden", product({ is_visible: false })],
    ["supply", product({ is_supply: true })],
    ["free", product({ price: 0 })],
  ])("refuses a %s product", (_label, p) => {
    expect(catalogueUnitPrice({ product_id: P }, p, new Map(), none)).toBeNull();
  });

  it("refuses a missing, disabled or foreign variant", () => {
    expect(catalogueUnitPrice({ product_id: P, variant_id: "nope" }, product(), variants(), none)).toBeNull();
    expect(
      catalogueUnitPrice({ product_id: P, variant_id: V }, product(), variants({ is_enabled: false }), none),
    ).toBeNull();
    expect(
      catalogueUnitPrice({ product_id: P, variant_id: V }, product(), variants({ product_id: "p2" }), none),
    ).toBeNull();
  });

  it("refuses a line with no variant for a product sold by variant", () => {
    expect(catalogueUnitPrice({ product_id: P, variant_id: null }, product(), new Map(), new Set([P]))).toBeNull();
  });
});
