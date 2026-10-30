// @vitest-environment jsdom
// =====================================================================
// Cart, checkout and thank-you sections — frozen before slice 1h
// =====================================================================
// cart_line_items, cart_summary, trust_strip, checkout_form,
// checkout_order_summary and order_confirmation's item recap, rendered in
// the browser (the cart lives in the client store, the recap in the
// session stash) with the section defaults and with scheniders-iraq's
// draft props as stored. Slice 1h adds an opt-in `style: "soft"` (and the
// checkout's `submit_label_i18n`); without them every render here must
// stay byte-identical. A diff is a back-compat break, not a snapshot to
// refresh. React's client ids are normalised so the snapshots do not
// depend on how many trees rendered before them.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import type { LocaleCode } from "@scheniders/shared";
import cart_line_items from "./cart_line_items";
import cart_summary from "./cart_summary";
import checkout_form from "./checkout_form";
import checkout_order_summary from "./checkout_order_summary";
import order_confirmation from "./order_confirmation";
import trust_strip from "./trust_strip";
import type { SectionRenderContext } from "./_types";
import {
  EXPRESS_STASH,
  IRAQ_CART,
  IRAQ_DRAFT_CART_LINES_BASE,
  IRAQ_DRAFT_CART_SUMMARY_BASE,
  IRAQ_DRAFT_CHECKOUT_FORM_BASE,
  IRAQ_DRAFT_CONFIRMATION_BASE,
  IRAQ_DRAFT_ORDER_SUMMARY_BASE,
  IRAQ_DRAFT_TRUST_BASE,
  pageCtx,
} from "./_cart-checkout-fixtures";
import { html, mountInStore, withCart } from "./_cart-checkout-test-utils";
import { FIXTURE_NOW } from "./_pdp-fixtures";

function mount(node: React.ReactNode): string {
  return html(mountInStore(node).container);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
  vi.useFakeTimers({ toFake: ["Date"], now: FIXTURE_NOW });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  withCart([]);
});

const LOCALES = ["ar", "en"] as const;

function cartCtx(locale: LocaleCode): SectionRenderContext {
  return pageCtx("cart", locale);
}

describe("cart page (frozen)", () => {
  it.each(LOCALES)("cart_line_items, defaults, two lines, %s", (locale) => {
    withCart(IRAQ_CART);
    const Lines = cart_line_items.render;
    expect(mount(<Lines props={cart_line_items.defaultProps} ctx={cartCtx(locale)} />)).toMatchSnapshot();
  });

  it("cart_line_items, scheniders-iraq, two lines, ar", () => {
    withCart(IRAQ_CART);
    const Lines = cart_line_items.render;
    expect(mount(<Lines props={IRAQ_DRAFT_CART_LINES_BASE} ctx={cartCtx("ar")} />)).toMatchSnapshot();
  });

  it("cart_line_items, scheniders-iraq, empty, ar", () => {
    const Lines = cart_line_items.render;
    expect(mount(<Lines props={IRAQ_DRAFT_CART_LINES_BASE} ctx={cartCtx("ar")} />)).toMatchSnapshot();
  });

  it.each(LOCALES)("cart_summary, defaults, two lines, %s", (locale) => {
    withCart(IRAQ_CART);
    const Summary = cart_summary.render;
    expect(mount(<Summary props={cart_summary.defaultProps} ctx={cartCtx(locale)} />)).toMatchSnapshot();
  });

  it("cart_summary, scheniders-iraq, two lines, ar", () => {
    withCart(IRAQ_CART);
    const Summary = cart_summary.render;
    expect(mount(<Summary props={IRAQ_DRAFT_CART_SUMMARY_BASE} ctx={cartCtx("ar")} />)).toMatchSnapshot();
  });

  it("cart_summary, scheniders-iraq, empty, ar", () => {
    const Summary = cart_summary.render;
    expect(mount(<Summary props={IRAQ_DRAFT_CART_SUMMARY_BASE} ctx={cartCtx("ar")} />)).toMatchSnapshot();
  });

  it("cart_summary, defaults with the promo input, ar", () => {
    withCart(IRAQ_CART);
    const Summary = cart_summary.render;
    expect(
      mount(<Summary props={{ ...cart_summary.defaultProps, show_promo_input: true }} ctx={cartCtx("ar")} />),
    ).toMatchSnapshot();
  });
});

describe("trust_strip (frozen)", () => {
  it("defaults, ar", () => {
    const Strip = trust_strip.render;
    expect(mount(<Strip props={trust_strip.defaultProps} ctx={cartCtx("ar")} />)).toMatchSnapshot();
  });

  it.each(LOCALES)("scheniders-iraq's four pills, %s", (locale) => {
    const Strip = trust_strip.render;
    const props = trust_strip.schema.parse(IRAQ_DRAFT_TRUST_BASE);
    expect(mount(<Strip props={props} ctx={cartCtx(locale)} />)).toMatchSnapshot();
  });
});

describe("checkout page (frozen)", () => {
  it.each(LOCALES)("checkout_form, defaults, two lines, %s", (locale) => {
    withCart(IRAQ_CART);
    const Form = checkout_form.render;
    expect(
      mount(<Form props={checkout_form.defaultProps} ctx={pageCtx("checkout", locale)} />),
    ).toMatchSnapshot();
  });

  it("checkout_form, scheniders-iraq, two lines, ar", () => {
    withCart(IRAQ_CART);
    const Form = checkout_form.render;
    expect(
      mount(<Form props={IRAQ_DRAFT_CHECKOUT_FORM_BASE} ctx={pageCtx("checkout", "ar")} />),
    ).toMatchSnapshot();
  });

  it("checkout_form, scheniders-iraq, empty, ar", () => {
    const Form = checkout_form.render;
    expect(
      mount(<Form props={IRAQ_DRAFT_CHECKOUT_FORM_BASE} ctx={pageCtx("checkout", "ar")} />),
    ).toMatchSnapshot();
  });

  it.each(LOCALES)("checkout_order_summary, scheniders-iraq, two lines, %s", (locale) => {
    withCart(IRAQ_CART);
    const Summary = checkout_order_summary.render;
    expect(
      mount(<Summary props={IRAQ_DRAFT_ORDER_SUMMARY_BASE} ctx={pageCtx("checkout", locale)} />),
    ).toMatchSnapshot();
  });

  it("checkout_order_summary, defaults, empty, ar", () => {
    const Summary = checkout_order_summary.render;
    expect(
      mount(<Summary props={checkout_order_summary.defaultProps} ctx={pageCtx("checkout", "ar")} />),
    ).toMatchSnapshot();
  });
});

describe("thank-you recap (frozen)", () => {
  it.each(LOCALES)("order_confirmation, defaults, with the express stash, %s", (locale) => {
    window.sessionStorage.setItem("schn:last-order", JSON.stringify(EXPRESS_STASH));
    const Confirmation = order_confirmation.render;
    expect(
      mount(
        <Confirmation
          props={order_confirmation.defaultProps}
          ctx={pageCtx("checkout_success", locale, undefined, "SH-0001")}
        />,
      ),
    ).toMatchSnapshot();
  });

  it("order_confirmation, scheniders-iraq, with the express stash, ar", () => {
    window.sessionStorage.setItem("schn:last-order", JSON.stringify(EXPRESS_STASH));
    const Confirmation = order_confirmation.render;
    expect(
      mount(
        <Confirmation
          props={IRAQ_DRAFT_CONFIRMATION_BASE}
          ctx={pageCtx("checkout_success", "ar", undefined, "SH-0001")}
        />,
      ),
    ).toMatchSnapshot();
  });
});
