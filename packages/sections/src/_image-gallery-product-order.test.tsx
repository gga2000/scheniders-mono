// =====================================================================
// image_gallery — product-first ordering on a PDP
// =====================================================================
// With `order: "product_first"`, screenshots tagged for the product on
// screen lead, untagged ones keep their order, and screenshots tagged
// only for other products go last. The whole-picture viewer numbers
// follow the shown order.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import image_gallery from "./image_gallery";
import { plainProduct, productCtx, saleProduct } from "./_pdp-fixtures";
import type { Product } from "./types";

const Gallery = image_gallery.render;
const BASE = "https://cdn.example.com/chats/";

const PROPS = {
  heading_i18n: { ar: "كلامهم مو كلامنا", en: "Their words, not ours" },
  layout: "carousel",
  display: "whole",
  frame: "strip",
  order: "product_first",
  images: [
    { url: `${BASE}1.jpeg` },
    { url: `${BASE}2.jpeg`, product_ids: [plainProduct.id] },
    { url: `${BASE}3.jpeg` },
    { url: `${BASE}4.jpeg`, product_ids: [saleProduct.id] },
  ],
};

function render(product: Product | undefined): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Gallery props={image_gallery.schema.parse(PROPS)} ctx={productCtx(product)} />
    </StoreBaseProvider>,
  );
}

const shownOrder = (html: string): string[] =>
  [...html.matchAll(/cdn\.example\.com\/chats\/(\d)\.jpeg/g)]
    .map((m) => m[1])
    .filter((n, i, all) => all.indexOf(n) === i);

describe("image_gallery product-first order", () => {
  it("leads with this product's screenshot, other products last", () => {
    expect(shownOrder(render(saleProduct))).toEqual(["4", "1", "3", "2"]);
  });

  it("the other product sees its own first", () => {
    expect(shownOrder(render(plainProduct))).toEqual(["2", "1", "3", "4"]);
  });

  it("the viewer opens the first shown card at slot 0", () => {
    const html = render(saleProduct);
    const first = html.indexOf('data-gallery-open="0"');
    expect(first).toBeGreaterThan(-1);
    expect(html.indexOf(`${BASE}4.jpeg`)).toBeLessThan(html.indexOf(`${BASE}1.jpeg`));
  });

  it("the schema keeps product_ids per image", () => {
    const parsed = image_gallery.schema.parse(PROPS);
    expect(parsed.images[3].product_ids).toEqual([saleProduct.id]);
    expect(parsed.order).toBe("product_first");
  });
});
