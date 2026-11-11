import { afterEach, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useCart } from "@/lib/cart-store";
import type { Product } from "@/lib/types";
import { PreviewSampleCart, sampleCartLines } from "./preview-sample-cart";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const product = {
  id: "p1",
  name: "Envoy",
  price: 45000,
  image_url: "https://img.example/envoy.jpg",
} as Product;

afterEach(() => {
  useCart.setState({ items: [] });
  window.localStorage.clear();
});

async function mount(sample: ReturnType<typeof sampleCartLines>): Promise<() => void> {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(<PreviewSampleCart sample={sample} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return () => act(() => root.unmount());
}

describe("PreviewSampleCart", () => {
  it("builds one unit per product at its base price", () => {
    expect(sampleCartLines([product])).toEqual([
      {
        product_id: "p1",
        variant_id: null,
        name: "Envoy",
        variant_name: null,
        price: 45000,
        quantity: 1,
        image_url: "https://img.example/envoy.jpg",
        base_price: 45000,
      },
    ]);
  });

  it("fills an empty preview cart with the sample lines", async () => {
    const unmount = await mount(sampleCartLines([product]));
    expect(useCart.getState().items.map((i) => i.product_id)).toEqual(["p1"]);
    unmount();
  });

  it("leaves a cart that already has lines alone", async () => {
    window.history.replaceState(null, "", "/_preview/shop-a/cart");
    useCart.setState({ items: [{ ...sampleCartLines([product])[0], product_id: "mine" }] });
    // Persist what the merchant already added in the preview.
    window.localStorage.setItem(
      "scheniders-cart:preview:shop-a",
      JSON.stringify({ state: { items: useCart.getState().items }, version: 0 }),
    );
    const unmount = await mount(sampleCartLines([product]));
    expect(useCart.getState().items.map((i) => i.product_id)).toEqual(["mine"]);
    unmount();
    window.history.replaceState(null, "", "/");
  });
});
