// @vitest-environment jsdom
// cart_summary `style: "soft"` (slice 1h): the express receipt (ink
// figures, «مجاني» in ink, the total at 22px/900) and its order button
// (token radius + token shadow, the one yellow fill), WhatsApp as the soft
// green row named «اطلب عبر واتساب», no fine print. "chunky" = absent.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent } from "@testing-library/react";
import { useCart } from "./helpers/cart-store";
import cart_summary, { type Props } from "./cart_summary";
import { COPY_ACTIONS } from "./_copy-terms";
import { IRAQ_CART, IRAQ_DRAFT_CART_SUMMARY_BASE, pageCtx } from "./_cart-checkout-fixtures";
import { expectSoftRules, html, mountInStore, withCart } from "./_cart-checkout-test-utils";

afterEach(() => {
  cleanup();
  withCart([]);
});

const SOFT: Props = { ...IRAQ_DRAFT_CART_SUMMARY_BASE, style: "soft" };

function mount(props: Props, locale: "ar" | "en" = "ar") {
  const Summary = cart_summary.render;
  return mountInStore(<Summary props={props} ctx={pageCtx("cart", locale)} />).container;
}

describe("cart_summary style prop", () => {
  it("parses soft; a bad stored value degrades to absent", () => {
    expect(cart_summary.schema.parse(SOFT).style).toBe("soft");
    expect(cart_summary.schema.parse({ ...SOFT, style: "x" }).style).toBeUndefined();
  });

  it("chunky renders exactly like absent", () => {
    withCart(IRAQ_CART);
    const absent = html(mount(IRAQ_DRAFT_CART_SUMMARY_BASE));
    cleanup();
    expect(html(mount({ ...IRAQ_DRAFT_CART_SUMMARY_BASE, style: "chunky" }))).toBe(absent);
  });
});

describe("cart_summary soft", () => {
  it("one yellow fill — the way on — and ink figures", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT);
    expectSoftRules(view.innerHTML, 1);
    const action = view.querySelector<HTMLAnchorElement>('a[href="/s/fixture-store/checkout"]');
    expect(action?.textContent).toBe("متابعة الدفعarrow_back");
    expect(action?.className).toContain("shadow-bk-button");
    expect(view.textContent).toContain("المجموع الفرعي128,500 د.ع");
    expect(view.textContent).toContain("التوصيلمجاني");
    expect(view.textContent).toContain("المجموع128,500 د.ع");
  });

  it("WhatsApp is the soft green row, named as the express tile; no fine print, no «أو»", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT);
    const wa = view.querySelector<HTMLAnchorElement>("[data-soft-whatsapp]");
    expect(wa?.textContent).toBe(COPY_ACTIONS.orderOnWhatsapp);
    expect(wa?.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/9647779703832\?text=/);
    expect(view.textContent).not.toContain("لا دفع مسبق");
    expect(view.textContent).not.toContain("أو");
  });

  it("English: the arrow points forward and rows read from the left", () => {
    withCart(IRAQ_CART);
    const view = mount(SOFT, "en");
    expect(view.querySelector('a[href="/s/fixture-store/checkout"]')?.textContent).toBe(
      "Continue to checkoutarrow_forward",
    );
    expect(view.querySelector("[data-receipt-soft] div div")?.className).not.toContain("flex-row-reverse");
  });

  it("an empty cart: the action is a disabled button, never a dead link", () => {
    const view = mount(SOFT);
    expect(view.querySelector('a[href$="/checkout"]')).toBeNull();
    expect(view.querySelector<HTMLButtonElement>("button[disabled]")?.textContent).toBe("متابعة الدفعarrow_back");
  });

  it("the promo input keeps working in the soft receipt", () => {
    withCart(IRAQ_CART);
    const view = mount({ ...SOFT, show_promo_input: true });
    const input = view.querySelector<HTMLInputElement>("#cart-promo-input");
    if (!input) throw new Error("missing the promo input");
    fireEvent.change(input, { target: { value: "NOPE" } });
    const apply = [...view.querySelectorAll("button")].find((b) => b.textContent === "تطبيق");
    if (!apply) throw new Error("missing apply");
    fireEvent.click(apply);
    expect(view.querySelector('[role="alert"]')?.textContent).toBe("الكود غير صالح");
    expect(useCart.getState().couponCode).toBeNull();
  });
});
