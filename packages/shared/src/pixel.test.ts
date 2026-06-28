import { describe, it, expect } from "vitest";
import {
  pixelContentsFromItems,
  pixelContentFromProduct,
  redactServerOnlyConfig,
} from "./pixel";

describe("pixelContentsFromItems", () => {
  it("builds content_ids, contents, value, num_items", () => {
    const d = pixelContentsFromItems([
      { product_id: "a", price: 5000, quantity: 2 },
      { product_id: "b", price: 3000, quantity: 1 },
    ]);
    expect(d.content_ids).toEqual(["a", "b"]);
    expect(d.value).toBe(13000);
    expect(d.num_items).toBe(3);
    expect(d.currency).toBe("IQD");
    expect(d.contents[0]).toEqual({ id: "a", quantity: 2, item_price: 5000 });
  });

  it("floors negatives + is empty-safe", () => {
    expect(pixelContentsFromItems([]).value).toBe(0);
    const d = pixelContentsFromItems([{ product_id: "x", price: -1, quantity: -2 }]);
    expect(d.value).toBe(0);
    expect(d.num_items).toBe(0);
  });
});

describe("pixelContentFromProduct", () => {
  it("treats a single product as qty 1", () => {
    const d = pixelContentFromProduct({ id: "p", price: 7000 });
    expect(d.value).toBe(7000);
    expect(d.num_items).toBe(1);
    expect(d.content_ids).toEqual(["p"]);
  });
});

describe("redactServerOnlyConfig", () => {
  it("strips CAPI tokens but keeps pixel ids, without mutating input", () => {
    const cfg = {
      globals: {
        analytics_pixels: {
          base: {
            meta_pixel_id: "123",
            meta_capi_token: "SECRET",
            tiktok_capi_token: "S2",
            capi_test_event_code: "T",
          },
        },
      },
    };
    const out = redactServerOnlyConfig(cfg);
    const base = out!.globals!.analytics_pixels!.base!;
    expect(base.meta_pixel_id).toBe("123");
    expect(base.meta_capi_token).toBeUndefined();
    expect(base.tiktok_capi_token).toBeUndefined();
    expect(base.capi_test_event_code).toBeUndefined();
    // original untouched
    expect(cfg.globals.analytics_pixels.base.meta_capi_token).toBe("SECRET");
  });

  it("returns the input unchanged when there's nothing to redact", () => {
    expect(redactServerOnlyConfig(null)).toBeNull();
    expect(redactServerOnlyConfig(undefined)).toBeUndefined();
    const c = { globals: {} };
    expect(redactServerOnlyConfig(c)).toBe(c);
  });
});
