// @vitest-environment jsdom
// checkout_order_summary `style: "soft"` (slice 1h): the express receipt
// with the cart's lines — names on up to two lines, «الكمية 2» at the
// 12px floor, ink figures, an ink COD note (D4: no yellow total, no green
// icon). "chunky" renders exactly like absent.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import checkout_order_summary, { type Props } from "./checkout_order_summary";
import { IRAQ_CART, IRAQ_DRAFT_ORDER_SUMMARY_BASE, LONG_TITLE_LINE, pageCtx } from "./_cart-checkout-fixtures";
import { expectSoftRules, html, mountInStore, withCart } from "./_cart-checkout-test-utils";

afterEach(() => {
  cleanup();
  withCart([]);
});

const SOFT: Props = { ...IRAQ_DRAFT_ORDER_SUMMARY_BASE, style: "soft" };

function mount(props: Props, locale: "ar" | "en" = "ar") {
  const Summary = checkout_order_summary.render;
  return mountInStore(<Summary props={props} ctx={pageCtx("checkout", locale)} />).container;
}

describe("checkout_order_summary style prop", () => {
  it("parses soft; a bad stored value degrades to absent", () => {
    expect(checkout_order_summary.schema.parse(SOFT).style).toBe("soft");
    expect(checkout_order_summary.schema.parse({ ...SOFT, style: [] }).style).toBeUndefined();
  });

  it("chunky renders exactly like absent", () => {
    withCart(IRAQ_CART);
    const absent = html(mount(IRAQ_DRAFT_ORDER_SUMMARY_BASE));
    cleanup();
    expect(html(mount({ ...IRAQ_DRAFT_ORDER_SUMMARY_BASE, style: "chunky" }))).toBe(absent);
  });
});

describe("checkout_order_summary soft", () => {
  it("lines named in full on up to two lines, the quantity at the floor, ink figures", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT);
    expectSoftRules(view.innerHTML, 0);
    const first = view.querySelector("li");
    expect(first?.querySelector("p")?.textContent).toBe(LONG_TITLE_LINE.name);
    expect(first?.querySelector("p")?.className).toContain("line-clamp-2");
    expect(first?.textContent).toContain("الكمية 2");
    expect(view.textContent).toContain("المجموع128,500 د.ع");
    expect(view.querySelector("h2")?.className).toContain("text-bk-chapter");
  });

  it("the COD note, when a store keeps it, is ink with an ink icon", () => {
    withCart(IRAQ_CART);
    const note = mount(SOFT).querySelector('[data-i18n-field="cod_note_i18n"]');
    expect(note?.textContent).toBe("الدفع عند الاستلام — لا تدفع إلا بعد فحص الطلب.");
    expect(note?.parentElement?.innerHTML).toContain("text-bk-ink");
  });

  it("without a COD note and with an empty cart: one quiet line, no note", () => {
    const { cod_note_i18n: _omit, ...withoutNote } = SOFT;
    const view = mount(withoutNote);
    expect(view.textContent).toContain("السلة فارغة.");
    expect(view.querySelector('[data-i18n-field="cod_note_i18n"]')).toBeNull();
  });
});
