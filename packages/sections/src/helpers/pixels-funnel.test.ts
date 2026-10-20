// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { setFunnelSink, trackPageView, trackPixel, type FunnelEvent } from "./pixels";
import { pixelContentsFromItems } from "@scheniders/shared";

afterEach(() => setFunnelSink(null));

const data = pixelContentsFromItems([{ product_id: "p1", price: 1000, quantity: 1 }]);

describe("first-party funnel forwarding", () => {
  it("forwards add-to-cart and checkout starts to the sink, never Purchase", () => {
    const seen: FunnelEvent[] = [];
    setFunnelSink((e) => seen.push(e));
    trackPixel("AddToCart", data);
    trackPixel("InitiateCheckout", data);
    trackPixel("Purchase", data);
    expect(seen).toEqual([
      { type: "add_to_cart", product_id: "p1" },
      { type: "initiate_checkout", product_id: "p1" },
    ]);
  });

  it("leaves page and product views to the beacon, so neither is counted twice", () => {
    const seen: FunnelEvent[] = [];
    setFunnelSink((e) => seen.push(e));
    trackPixel("ViewContent", data);
    trackPageView();
    expect(seen).toEqual([]);
  });

  it("records nothing once the sink is removed (editor preview, unmounted beacon)", () => {
    const seen: FunnelEvent[] = [];
    setFunnelSink((e) => seen.push(e));
    setFunnelSink(null);
    trackPixel("AddToCart", data);
    expect(seen).toEqual([]);
  });
});
