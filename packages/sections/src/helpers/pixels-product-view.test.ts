// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { trackProductView } from "./pixels";

afterEach(() => {
  delete (globalThis as { fbq?: unknown }).fbq;
});

function viewContentIds(fbq: ReturnType<typeof vi.fn>): unknown[] {
  return fbq.mock.calls
    .filter((c) => c[0] === "track" && c[1] === "ViewContent")
    .map((c) => (c[2] as { content_ids: string[] }).content_ids[0]);
}

describe("trackProductView", () => {
  it("sends one ViewContent per product view, even when two sections report it", () => {
    const fbq = vi.fn();
    (globalThis as { fbq?: unknown }).fbq = fbq;
    trackProductView({ id: "envoy", price: 34750 }); // direct-order form
    trackProductView({ id: "envoy", price: 34750 }); // buy box on the same page
    expect(viewContentIds(fbq)).toEqual(["envoy"]);
  });

  it("counts again after the shopper opens another product and comes back", () => {
    const fbq = vi.fn();
    (globalThis as { fbq?: unknown }).fbq = fbq;
    trackProductView({ id: "a", price: 1000 });
    trackProductView({ id: "b", price: 2000 });
    trackProductView({ id: "a", price: 1000 });
    expect(viewContentIds(fbq)).toEqual(["a", "b", "a"]);
  });
});
