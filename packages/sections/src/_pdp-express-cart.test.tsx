// @vitest-environment jsdom
// =====================================================================
// Express add to cart (slice 1g) — the «أضف للسلة» tile beside «ثبّت طلبي»
// =====================================================================
// The tile adds what the form would order (variant + quantity, at the
// receipt's unit price) to the store's cart, says so under the buttons
// with a «شوف السلة» link, fires AddToCart like pdp_add_to_cart, and never
// submits the order or runs the form's validation. Off (absent), the row
// is exactly today's.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useCart } from "./helpers/cart-store";
import { setFunnelSink, type FunnelEvent } from "./helpers/pixels";
import { StoreBaseProvider } from "./helpers/store-context";
import { useVariantStore } from "./helpers/variant-store";
import pdp_direct_order, { type Props } from "./pdp_direct_order";
import type { Product } from "./types";
import {
  EXPRESS_IRAQ_PDP_PROPS,
  VARIANT_100,
  plainProduct,
  productCtx,
  soldOutProduct,
  variantProduct,
} from "./_pdp-fixtures";

const CART: Props = { ...EXPRESS_IRAQ_PDP_PROPS, add_to_cart: true };

function markup(props: Props, product: Product = plainProduct): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render props={props} ctx={productCtx(product)} />
    </StoreBaseProvider>,
  );
}

/** The order-buttons row: from its opening tag to the end of the form. */
function buttonRow(html: string): string {
  const at = html.indexOf('data-layer="submit"');
  expect(at).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<div", at), html.indexOf("</form>", at));
}

describe("add_to_cart prop", () => {
  it("parses true, and a bad stored value degrades to absent", () => {
    expect(pdp_direct_order.schema.parse(CART).add_to_cart).toBe(true);
    const bad = pdp_direct_order.schema.parse({ ...EXPRESS_IRAQ_PDP_PROPS, add_to_cart: "yes" });
    expect(bad.add_to_cart).toBeUndefined();
    expect(bad.layout).toBe("express");
  });

  it("false renders exactly like absent", () => {
    expect(markup({ ...EXPRESS_IRAQ_PDP_PROPS, add_to_cart: false })).toBe(markup(EXPRESS_IRAQ_PDP_PROPS));
  });
});

describe("the order-buttons row with add_to_cart", () => {
  it("WhatsApp, then the cart tile, then the submit, then the confirmation line", () => {
    const row = buttonRow(markup(CART));
    const order = ["اطلب عبر واتساب", "data-cart-add", 'type="submit"', 'role="status"'].map((k) => row.indexOf(k));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(row).toContain("flex items-stretch gap-2 flex-wrap");
  });

  it("the tile is a plain button: never a submit, no yellow fill, ≥44px", () => {
    const row = buttonRow(markup(CART));
    const tile = row.slice(row.lastIndexOf("<button", row.indexOf("data-cart-add")), row.indexOf("</button>", row.indexOf("data-cart-add")));
    expect(tile).toContain('type="button"');
    expect(tile).not.toContain("bg-bk-primary");
    expect(tile).toContain("w-[84px]");
    expect(tile).toContain(">أضف للسلة<");
    // Its height is the row's: the submit's min-h-[60px], stretched.
    expect(row).toContain("min-h-[60px]");
  });

  it("the submit gives up side padding, never its label", () => {
    const row = buttonRow(markup(CART));
    const submit = row.slice(row.lastIndexOf("<button", row.indexOf('type="submit"')), row.indexOf(">", row.indexOf('type="submit"')));
    expect(submit).toContain("px-3");
    expect(submit).toContain("min-w-0");
    expect(submit).not.toContain("px-5");
    expect(row).toContain(">ثبّت طلبي<");
  });

  it("the confirmation line starts empty, and the row adds no dir attribute", () => {
    const row = buttonRow(markup(CART));
    expect(row).toMatch(/<p role="status" data-cart-status="" class="[^"]*"><\/p>/);
    expect(row).not.toContain(' dir="');
    const dirs = (html: string) => html.split(' dir="').length - 1;
    expect(dirs(markup(CART))).toBe(dirs(markup(EXPRESS_IRAQ_PDP_PROPS)));
  });

  it("english names the tile «Add to cart»", () => {
    const html = renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <pdp_direct_order.render
          props={CART}
          ctx={productCtx(plainProduct, { runtime: { ...productCtx(plainProduct).runtime, locale: "en" } })}
        />
      </StoreBaseProvider>,
    );
    expect(buttonRow(html)).toContain(">Add to cart<");
  });

  it("sold out: no tile and no confirmation line", () => {
    const row = buttonRow(markup(CART, soldOutProduct));
    expect(row).not.toContain("data-cart-add");
    expect(row).not.toContain("data-cart-status");
  });
});

const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
const fbq = vi.fn();

function mount(product: Product = plainProduct) {
  const Pdp = pdp_direct_order.render;
  const view = render(
    <StoreBaseProvider base="/s/fixture-store">
      <Pdp props={CART} ctx={productCtx(product)} />
    </StoreBaseProvider>,
  );
  const q = <T extends Element>(sel: string): T => {
    const el = view.container.querySelector<T>(sel);
    if (!el) throw new Error(`missing ${sel}`);
    return el;
  };
  return { view, q, tile: () => q<HTMLButtonElement>("[data-cart-add]"), status: () => q<HTMLElement>("[data-cart-status]") };
}

beforeEach(() => {
  fetchMock.mockClear();
  fbq.mockClear();
  useCart.setState({ items: [] });
  useVariantStore.setState({ selected: {} });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
  Element.prototype.scrollIntoView = function scrollIntoView() {};
});
afterEach(() => {
  cleanup();
  setFunnelSink(null);
  vi.unstubAllGlobals();
});

describe("tapping «أضف للسلة»", () => {
  it("adds the product at the stepper's quantity, confirms with a cart link, and sends no order", () => {
    const { q, tile, status, view } = mount();
    fireEvent.click(q('button[aria-controls$="-qty-panel"]'));
    fireEvent.click(q('button[aria-label="زيادة الكمية"]'));
    fireEvent.click(tile());
    expect(useCart.getState().items).toEqual([
      {
        product_id: plainProduct.id,
        variant_id: null,
        name: "عطر تجريبي",
        variant_name: null,
        price: 18000,
        quantity: 2,
        image_url: plainProduct.image_url,
        base_price: 18000,
      },
    ]);
    expect(status().textContent).toBe("check_circleانضافت للسلةشوف السلة");
    expect(status().querySelector("a")?.getAttribute("href")).toBe("/s/fixture-store/cart");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
  });

  it("a second tap adds again to the same line and is announced again", () => {
    const { tile, status } = mount();
    fireEvent.click(tile());
    const first = status().firstElementChild;
    fireEvent.click(tile());
    expect(useCart.getState().items.map((i) => i.quantity)).toEqual([2]);
    expect(status().firstElementChild).not.toBe(first);
  });

  it("while a variant is owed it adds nothing and asks for the option", () => {
    const { q, tile, view } = mount(variantProduct);
    fireEvent.click(tile());
    expect(useCart.getState().items).toEqual([]);
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe("اختار الخيار أول.");
    expect(document.activeElement).toBe(q('[data-layer="variants"] button'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds the chosen variant at its own price", () => {
    const { view, tile } = mount(variantProduct);
    const pill = [...view.container.querySelectorAll<HTMLButtonElement>('[data-layer="variants"] button')].find(
      (b) => b.textContent?.startsWith("100ml"),
    );
    if (!pill) throw new Error("missing the 100ml pill");
    fireEvent.click(pill);
    fireEvent.click(tile());
    const [line] = useCart.getState().items;
    expect(line?.variant_id).toBe(VARIANT_100.id);
    expect(line?.variant_name).toBe("100ml");
    expect(line?.price).toBe(40000);
  });

  it("fires AddToCart like pdp_add_to_cart, and the funnel's add_to_cart", () => {
    vi.stubGlobal("fbq", fbq);
    const seen: FunnelEvent[] = [];
    setFunnelSink((e) => seen.push(e));
    const { tile } = mount();
    fireEvent.click(tile());
    expect(fbq).toHaveBeenCalledTimes(1);
    expect(fbq.mock.calls[0]?.slice(0, 2)).toEqual(["track", "AddToCart"]);
    expect(fbq.mock.calls[0]?.[2]).toMatchObject({ content_ids: [plainProduct.id], value: 18000, currency: "IQD", num_items: 1 });
    expect(seen).toEqual([{ type: "add_to_cart", product_id: plainProduct.id }]);
  });

  it("draft view (no pixel, no funnel sink): the add still works and records nothing", () => {
    const { tile } = mount();
    fireEvent.click(tile());
    expect(useCart.getState().items).toHaveLength(1);
    expect(fbq).not.toHaveBeenCalled();
  });
});
