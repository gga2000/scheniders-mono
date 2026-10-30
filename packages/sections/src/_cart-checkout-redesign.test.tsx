// @vitest-environment jsdom
// =====================================================================
// Cart, checkout and thank-you — redesign draft (slice 1h)
// =====================================================================
// scheniders-iraq's draft after the 1h migration (the fixtures; the
// migration's own `edits` list is checked against them in
// _pdp-redesign-snapshot.test.tsx, where the file is read), rendered in
// the browser page by page, ar and en: the soft cart list, receipt and
// trust tiles; the soft checkout form and summary; the soft thank-you.
// The renders hold the colour lock and one name per action along the
// path.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import cart_line_items from "./cart_line_items";
import cart_summary from "./cart_summary";
import checkout_form from "./checkout_form";
import checkout_order_summary from "./checkout_order_summary";
import order_confirmation from "./order_confirmation";
import trust_strip from "./trust_strip";
import { COPY_ACTIONS } from "./_copy-terms";
import { EXPRESS_STASH, IRAQ_CART, pageCtx } from "./_cart-checkout-fixtures";
import { expectSoftRules, html, mountInStore, withCart } from "./_cart-checkout-test-utils";
import { FIXTURE_NOW } from "./_pdp-fixtures";
import {
  BAND_TRY_FIRST,
  IRAQ_REDESIGN_CART_LINES_INPUT,
  IRAQ_REDESIGN_CART_SUMMARY_INPUT,
  IRAQ_REDESIGN_CART_TRUST_INPUT,
  IRAQ_REDESIGN_CHECKOUT_FORM_INPUT,
  IRAQ_REDESIGN_CONFIRMATION_INPUT,
  IRAQ_REDESIGN_ORDER_SUMMARY_INPUT,
  SLICE_1B_PDP_PATCH,
  SLICE_1H_CART_SUMMARY_PATCH,
  SLICE_1H_CHECKOUT_FORM_PATCH,
  SLICE_1H_CONFIRMATION_PATCH,
} from "./_pdp-redesign-fixtures";

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
  vi.stubGlobal("fbq", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  withCart([]);
});

const LOCALES = ["ar", "en"] as const;

describe("1h fixtures", () => {
  it("every 1h section parses to exactly what is stored", () => {
    expect(cart_line_items.schema.parse(IRAQ_REDESIGN_CART_LINES_INPUT)).toEqual(IRAQ_REDESIGN_CART_LINES_INPUT);
    expect(cart_summary.schema.parse(IRAQ_REDESIGN_CART_SUMMARY_INPUT)).toEqual(IRAQ_REDESIGN_CART_SUMMARY_INPUT);
    expect(trust_strip.schema.parse(IRAQ_REDESIGN_CART_TRUST_INPUT)).toEqual(IRAQ_REDESIGN_CART_TRUST_INPUT);
    expect(checkout_form.schema.parse(IRAQ_REDESIGN_CHECKOUT_FORM_INPUT)).toEqual(IRAQ_REDESIGN_CHECKOUT_FORM_INPUT);
    expect(checkout_order_summary.schema.parse(IRAQ_REDESIGN_ORDER_SUMMARY_INPUT)).toEqual(
      IRAQ_REDESIGN_ORDER_SUMMARY_INPUT,
    );
    expect(order_confirmation.schema.parse(IRAQ_REDESIGN_CONFIRMATION_INPUT)).toEqual(IRAQ_REDESIGN_CONFIRMATION_INPUT);
  });

  it("the cart and checkout quote the product page's promise in its words; one delivery claim", () => {
    expect(SLICE_1B_PDP_PATCH.reassurance_i18n.ar.startsWith(`${BAND_TRY_FIRST.ar} — `)).toBe(true);
    expect(SLICE_1H_CHECKOUT_FORM_PATCH.reassurance_text_i18n.ar).toBe(
      `${BAND_TRY_FIRST.ar} — ${SLICE_1B_PDP_PATCH.return_promise_i18n.ar}`,
    );
    expect(SLICE_1H_CONFIRMATION_PATCH.eta_i18n).toEqual(SLICE_1B_PDP_PATCH.delivery_sla_i18n);
    expect(IRAQ_REDESIGN_ORDER_SUMMARY_INPUT).not.toHaveProperty("cod_note_i18n");
  });

  it("one name per action along the path", () => {
    expect(SLICE_1H_CART_SUMMARY_PATCH.checkout_label_i18n.ar).toBe(COPY_ACTIONS.continueOrder);
    expect(SLICE_1H_CHECKOUT_FORM_PATCH.submit_label_i18n.ar).toBe(COPY_ACTIONS.placeOrder);
    expect(SLICE_1H_CONFIRMATION_PATCH.whatsapp_label_i18n.ar).toBe(COPY_ACTIONS.whatsapp);
  });
});

function cartPage(locale: (typeof LOCALES)[number]): HTMLElement {
  withCart(IRAQ_CART);
  const Lines = cart_line_items.render;
  const Summary = cart_summary.render;
  const Strip = trust_strip.render;
  const ctx = pageCtx("cart", locale);
  return mountInStore(
    <>
      <Lines props={cart_line_items.schema.parse(IRAQ_REDESIGN_CART_LINES_INPUT)} ctx={ctx} />
      <Summary props={cart_summary.schema.parse(IRAQ_REDESIGN_CART_SUMMARY_INPUT)} ctx={ctx} />
      <Strip props={trust_strip.schema.parse(IRAQ_REDESIGN_CART_TRUST_INPUT)} ctx={ctx} />
    </>,
  ).container;
}

function checkoutPage(locale: (typeof LOCALES)[number]): HTMLElement {
  withCart(IRAQ_CART);
  const Form = checkout_form.render;
  const Summary = checkout_order_summary.render;
  const ctx = pageCtx("checkout", locale);
  return mountInStore(
    <>
      <Form props={checkout_form.schema.parse(IRAQ_REDESIGN_CHECKOUT_FORM_INPUT)} ctx={ctx} />
      <Summary props={checkout_order_summary.schema.parse(IRAQ_REDESIGN_ORDER_SUMMARY_INPUT)} ctx={ctx} />
    </>,
  ).container;
}

function thankYouPage(locale: (typeof LOCALES)[number]): HTMLElement {
  vi.useFakeTimers({ toFake: ["Date"], now: FIXTURE_NOW });
  window.sessionStorage.setItem(
    "schn:last-order",
    JSON.stringify({ ...EXPRESS_STASH, items: [{ ...EXPRESS_STASH.items[0], display_name: "ويفر انتنس" }] }),
  );
  const Confirmation = order_confirmation.render;
  return mountInStore(
    <Confirmation
      props={order_confirmation.schema.parse(IRAQ_REDESIGN_CONFIRMATION_INPUT)}
      ctx={pageCtx("checkout_success", locale, undefined, "SH-0001")}
    />,
  ).container;
}

describe("cart page — redesign draft", () => {
  it.each(LOCALES)("cart lines, summary and trust tiles, %s", (locale) => {
    expect(html(cartPage(locale))).toMatchSnapshot();
  });

  it("«كمّل طلبك» is the page's one yellow fill; «اطلب عبر واتساب»; three trust tiles", () => {
    const page = cartPage("ar");
    expectSoftRules(page.innerHTML, 1);
    expect(page.querySelector('a[href="/s/fixture-store/checkout"]')?.textContent).toBe("كمّل طلبكarrow_back");
    expect(page.querySelector("[data-soft-whatsapp]")?.textContent).toBe(COPY_ACTIONS.orderOnWhatsapp);
    expect([...page.querySelectorAll("[data-trust-style] li")].map((li) => li.textContent)).toEqual([
      "paymentsالدفع عند الاستلام",
      "visibilityتفتح وتجرّب قبل لا تدفع",
      "undoما عجبك؟ ترفضه قدام المندوب أو ترجّعه خلال أسبوع",
    ]);
  });
});

describe("checkout page — redesign draft", () => {
  it.each(LOCALES)("form and summary, %s", (locale) => {
    expect(html(checkoutPage(locale))).toMatchSnapshot();
  });

  it("«ثبّت طلبي» is the page's one yellow fill; the band's promise beside it; no COD note", () => {
    const page = checkoutPage("ar");
    expectSoftRules(page.innerHTML, 1);
    expect(page.querySelector('button[type="submit"]')?.textContent).toBe("ثبّت طلبي128,500 د.عarrow_back");
    expect(page.textContent).toContain(SLICE_1H_CHECKOUT_FORM_PATCH.reassurance_text_i18n.ar);
    expect(page.textContent).not.toContain("لا تدفع إلا بعد فحص الطلب");
  });
});

describe("thank-you — redesign draft", () => {
  it.each(LOCALES)("recap, steps, ETA and actions, %s", (locale) => {
    expect(html(thankYouPage(locale))).toMatchSnapshot();
  });

  it("the product page's name and delivery claim; «راسلنا واتساب»; Latin digits", () => {
    const page = thankYouPage("ar");
    expect(page.querySelector("[data-recap-style]")?.textContent).toContain("ويفر انتنس");
    expect(page.textContent).toContain("أغلب الطلبات توصل خلال 24 ساعة من تثبيت الطلب");
    expect(page.textContent).not.toMatch(/[٠-٩]/);
    expect(page.querySelector("[data-soft-whatsapp]")?.textContent).toBe(COPY_ACTIONS.whatsapp);
  });
});
