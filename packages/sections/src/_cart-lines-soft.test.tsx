// @vitest-environment jsdom
// cart_line_items `style: "soft"` (slice 1h): one hairline list in the
// express receipt's grammar — names on up to two lines (never an
// ellipsis), ink line totals (D4), rows read from the right in Arabic,
// the chapter heading as the page's h1. "chunky" renders like absent.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent } from "@testing-library/react";
import { useCart } from "./helpers/cart-store";
import cart_line_items, { type Props } from "./cart_line_items";
import { IRAQ_CART, IRAQ_DRAFT_CART_LINES_BASE, LONG_TITLE_LINE, pageCtx } from "./_cart-checkout-fixtures";
import { expectSoftRules, html, mountInStore, withCart } from "./_cart-checkout-test-utils";

afterEach(() => {
  cleanup();
  withCart([]);
});

const SOFT: Props = { ...IRAQ_DRAFT_CART_LINES_BASE, style: "soft" };

function mount(props: Props, locale: "ar" | "en" = "ar") {
  const Lines = cart_line_items.render;
  return mountInStore(<Lines props={props} ctx={pageCtx("cart", locale)} />).container;
}

describe("cart_line_items style prop", () => {
  it("parses soft; a bad stored value degrades to absent", () => {
    expect(cart_line_items.schema.parse(SOFT).style).toBe("soft");
    expect(cart_line_items.schema.parse({ ...SOFT, style: 3 }).style).toBeUndefined();
  });

  it("chunky renders exactly like absent", () => {
    withCart(IRAQ_CART);
    const absent = html(mount(IRAQ_DRAFT_CART_LINES_BASE));
    cleanup();
    expect(html(mount({ ...IRAQ_DRAFT_CART_LINES_BASE, style: "chunky" }))).toBe(absent);
  });
});

describe("cart_line_items soft", () => {
  it("the chapter heading is the page's h1, with the count", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT);
    const h1 = view.querySelector("h1");
    expect(h1?.textContent).toBe("سلتك");
    expect(h1?.className).toContain("text-bk-chapter");
    expect(view.textContent).toContain("3 عناصر في سلتك");
  });

  it("a long catalogue title wraps to two lines; it is never cut with an ellipsis", () => {
    withCart(IRAQ_CART);
    const names = [...mount(SOFT).querySelectorAll<HTMLElement>("[data-cart-line-name]")];
    expect(names.map((n) => n.textContent)).toEqual([LONG_TITLE_LINE.name, "نورث ستاك 2"]);
    for (const n of names) expect(n.className).toContain("line-clamp-2");
  });

  it("ink totals, no yellow, no outline, no dir; Arabic rows read from the right", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT);
    expectSoftRules(view.innerHTML, 0);
    expect(view.textContent).toContain("73,500 د.ع");
    expect(view.querySelector("li > div")?.className).toContain("flex-row-reverse");
  });

  it("English rows read from the left", () => {
    withCart(IRAQ_CART);
    expect(mount(SOFT, "en").querySelector("li > div")?.className).not.toContain("flex-row-reverse");
  });

  it("the stepper and remove still change the cart; every control is ≥44px", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT);
    const plus = view.querySelector<HTMLButtonElement>('button[aria-label="زيادة الكمية"]');
    const remove = [...view.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "إزالة");
    if (!plus || !remove) throw new Error("missing a control");
    for (const b of view.querySelectorAll("button")) expect(b.className).toContain("min-h-11");
    fireEvent.click(plus);
    expect(useCart.getState().items[0]?.quantity).toBe(3);
    fireEvent.click(remove);
    expect(useCart.getState().items.map((i) => i.product_id)).toEqual([IRAQ_CART[1]?.product_id]);
  });

  it("an empty cart: the soft empty state with the merchant's message as h1", () => {
    const view = mount(SOFT);
    expect(view.querySelector("h1")?.textContent).toBe("سلتك فارغة — تابع التسوّق.");
    expectSoftRules(view.innerHTML, 0);
  });
});
