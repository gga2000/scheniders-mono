import { describe, it, expect } from "vitest";
import { buildRuntimeContext } from "./storefront-runtime";

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
