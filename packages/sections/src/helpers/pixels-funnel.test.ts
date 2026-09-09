// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { setFunnelSink, trackPageView, trackPixel, type FunnelEvent } from "./pixels";
import { pixelContentsFromItems } from "@scheniders/shared";

afterEach(() => setFunnelSink(null));

describe("first-party funnel forwarding", () => {
  it("forwards the funnel events to the sink, but never Purchase", () => {
    const seen: FunnelEvent[] = [];
    setFunnelSink((e) => seen.push(e));
    const data = pixelContentsFromItems([{ product_id: "p1", price: 1000, quantity: 1 }]);
    trackPixel("ViewContent", data);
    trackPixel("AddToCart", data);
    trackPixel("InitiateCheckout", data);
    trackPixel("Purchase", data);
    trackPageView();
    expect(seen).toEqual([
      { type: "view_product", product_id: "p1" },
      { type: "add_to_cart", product_id: "p1" },
      { type: "initiate_checkout", product_id: "p1" },
      { type: "page_view" },
    ]);
  });

  it("is a no-op without a sink (editor preview, tests)", () => {
    const spy = vi.fn();
    setFunnelSink(null);
    trackPixel("AddToCart", pixelContentsFromItems([{ product_id: "p1", price: 1, quantity: 1 }]));
    expect(spy).not.toHaveBeenCalled();
  });
});
