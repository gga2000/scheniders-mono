// @vitest-environment jsdom
// W6.5 — variants on the direct-order form: the choice is shared with the
// picker section, priced and stocked per variant, required at submit.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import { useVariantStore } from "./helpers/variant-store";
import pdp_direct_order from "./pdp_direct_order";
import pdp_variants from "./pdp_variants";
import type { Product } from "./types";

const runtime = { page_id: "product" as const, breakpoint: "mobile" as const, locale: "ar" as const, audience_segments: [], ab_test_arms: {}, now: new Date("2026-09-10T00:00:00Z") };
const tenant = { id: "77777777-7777-4777-8777-777777777777", business_name: "متجر", store_config: { contact: { whatsapp_number: "07701234567" } } };
const plain: Product = { id: "11111111-1111-4111-8111-111111111111", name: "عطر تجريبي", price: 25000, stock_quantity: 10, reserved_quantity: 0, is_archived: false };
const sized: Product = {
  ...plain,
  variants: [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", product_id: plain.id, name: "50ml", price: 25000, stock_quantity: 5 },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", product_id: plain.id, name: "100ml", price: 40000, stock_quantity: 0 },
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", product_id: plain.id, name: "200ml", price: 70000, stock_quantity: 2 },
  ],
};

const ctx = (product: Product) => ({ tenant: tenant as never, runtime, products: [], categories: [], product });
const form = (product: Product) =>
  React.createElement(pdp_direct_order.render, { props: pdp_direct_order.defaultProps, ctx: ctx(product) });
const picker = (product: Product) =>
  React.createElement(pdp_variants.render, { props: pdp_variants.defaultProps, ctx: ctx(product) });
const page = (...children: React.ReactElement[]) =>
  React.createElement(StoreBaseProvider, { base: "", children: null }, ...children);

beforeEach(() => {
  useVariantStore.setState({ selected: {}, pickers: {} });
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("pdp_direct_order variants (W6.5)", () => {
  it("renders a plain product exactly as before — no option group", () => {
    expect(renderToStaticMarkup(page(form(plain)))).not.toContain('data-layer="variants"');
  });

  it("offers inline options when no picker section is on the page, and demands a choice", () => {
    render(page(form(sized)));
    const group = screen.getByRole("group", { name: "اختار الخيار" });
    const buttons = group.querySelectorAll("button");
    expect(buttons).toHaveLength(3);
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true); // 100ml sold out
    // Submitting without a choice is refused with a message, not a sold-out state.
    fireEvent.click(screen.getByRole("button", { name: /اطلب|تأكيد|order/i }));
    const alerts = () => screen.queryAllByRole("alert").map((a) => a.textContent ?? "");
    expect(alerts().some((t) => t.includes("اختار الخيار أول"))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(buttons[2]);
    expect(alerts().some((t) => t.includes("اختار الخيار أول"))).toBe(false);
    expect(useVariantStore.getState().selected[plain.id]).toBe(sized.variants![2].id);
  });

  it("hides the inline options when a pdp_variants section is on the page and follows its choice", () => {
    render(page(picker(sized), form(sized)));
    expect(screen.queryByRole("group", { name: "اختار الخيار" })).toBeNull();
    // The picker section defaults to the first sellable option (50ml).
    expect(useVariantStore.getState().selected[plain.id]).toBe(sized.variants![0].id);
  });
});
