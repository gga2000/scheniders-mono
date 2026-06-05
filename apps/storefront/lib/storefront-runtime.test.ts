import { describe, it, expect } from "vitest";
import type { StoreConfigV2, PageConfig } from "@scheniders/shared";
import { buildRuntimeContext, pickV2Page } from "./storefront-runtime";

describe("buildRuntimeContext", () => {
  it("defaults to mobile/SSR-safe runtime for the home page", () => {
    const now = new Date("2026-06-04T00:00:00Z");
    const ctx = buildRuntimeContext({ pageId: "home", locale: "ar", now });
    expect(ctx).toMatchObject({
      page_id: "home", breakpoint: "mobile", locale: "ar",
      audience_segments: [], ab_test_arms: {}, now,
    });
  });
  it("passes through optional ids", () => {
    const ctx = buildRuntimeContext({ pageId: "product", locale: "en", now: new Date(0), productId: "p1" });
    expect(ctx.product_id).toBe("p1");
    expect(ctx.page_id).toBe("product");
  });
});

/** Build a minimal StoreConfigV2 fixture with only the fields pickV2Page needs. */
function makeV2(pages: PageConfig[]): StoreConfigV2 {
  return { pages } as StoreConfigV2;
}

describe("pickV2Page", () => {
  it("returns the page when it has sections", () => {
    const page: PageConfig = { page_id: "home", sections: [{ id: "a", type: "hero_image", enabled: true, base: {} }] };
    expect(pickV2Page(makeV2([page]), "home")).toBe(page);
  });
  it("returns null for an empty page (falls back to legacy)", () => {
    const page: PageConfig = { page_id: "home", sections: [] };
    expect(pickV2Page(makeV2([page]), "home")).toBeNull();
  });
  it("returns null when the page is absent", () => {
    const page: PageConfig = { page_id: "about", sections: [{ id: "x", type: "t", enabled: true, base: {} }] };
    expect(pickV2Page(makeV2([page]), "home")).toBeNull();
  });
  it("returns null for null config", () => { expect(pickV2Page(null, "home")).toBeNull(); });
});
