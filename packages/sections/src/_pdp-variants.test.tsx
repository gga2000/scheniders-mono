// @vitest-environment jsdom
// W6.5 — variants on the direct-order form: the choice is shared with the
// picker section, priced and stocked per variant, required at submit.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import { parseProductAttributeDefs, resolveProductAttributes } from "@scheniders/shared";
import { useVariantStore } from "./helpers/variant-store";
import { useCart } from "./helpers/cart-store";
import pdp_direct_order from "./pdp_direct_order";
import pdp_variants from "./pdp_variants";
import pdp_add_to_cart from "./pdp_add_to_cart";
import pdp_buy_box from "./pdp_buy_box";
import product_attributes from "./product_attributes";
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
const addToCart = (product: Product) =>
  React.createElement(pdp_add_to_cart.render, { props: pdp_add_to_cart.defaultProps, ctx: ctx(product) });
const buyBox = (product: Product) =>
  React.createElement(pdp_buy_box.render, { props: pdp_buy_box.defaultProps, ctx: ctx(product) });
const attributes = (product: Product) =>
  React.createElement(product_attributes.render, { props: product_attributes.defaultProps, ctx: ctx(product) });
const page = (...children: React.ReactElement[]) =>
  React.createElement(StoreBaseProvider, { base: "", children: null }, ...children);

beforeEach(() => {
  useVariantStore.setState({ selected: {}, pickers: {} });
  useCart.setState({ items: [] });
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
    // Nothing is chosen for the shopper — the picker waits for a tap.
    expect(useVariantStore.getState().selected[plain.id]).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "200ml" }));
    expect(useVariantStore.getState().selected[plain.id]).toBe(sized.variants![2].id);
  });

  it("demands a choice even when the product has a single variant", () => {
    const single: Product = { ...plain, variants: [sized.variants![0]] };
    render(page(form(single)));
    const group = screen.getByRole("group", { name: "اختار الخيار" });
    expect(group.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /اطلب|تأكيد|order/i }));
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("one shared variant choice across the PDP", () => {
  it("add-to-cart stays disabled until chosen, then adds the variant at the variant's price", () => {
    render(page(picker(sized), addToCart(sized)));
    // The picker is on the page, so add-to-cart shows no select of its own.
    expect(screen.queryByLabelText("الخيار")).toBeNull();
    const add = () => screen.getAllByRole("button").find((b) => b.textContent?.includes("shopping_bag"));
    expect((add() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "200ml" }));
    expect((add() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(add() as HTMLButtonElement);
    const [line] = useCart.getState().items;
    expect(line.variant_id).toBe(sized.variants![2].id);
    expect(line.variant_name).toBe("200ml");
    expect(line.price).toBe(70000);
  });

  it("add-to-cart without a picker writes its own select into the shared store", () => {
    render(page(addToCart(sized), form(sized)));
    fireEvent.change(screen.getByLabelText("الخيار"), { target: { value: sized.variants![0].id } });
    expect(useVariantStore.getState().selected[plain.id]).toBe(sized.variants![0].id);
    // The direct-order form on the same page now sells that variant.
    const group = screen.getByRole("group", { name: "اختار الخيار" });
    expect(group.querySelector('[aria-pressed="true"]')?.textContent).toContain("50ml");
  });

  it("the buy box pre-selects nothing and shares its pick", () => {
    render(page(buyBox(sized), form(sized)));
    expect(useVariantStore.getState().selected[plain.id]).toBeUndefined();
    // The buy box registers as the picker, so the form shows no second one.
    expect(screen.queryByRole("group", { name: "اختار الخيار" })).toBeNull();
    const ctas = screen.getAllByRole("button", { name: /اختر الخيار/ });
    expect(ctas.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: /50ml/ })[0]);
    expect(useVariantStore.getState().selected[plain.id]).toBe(sized.variants![0].id);
  });

  it("attributes still render beside a product sold by variant", () => {
    const defs = parseProductAttributeDefs([
      {
        id: "d1", key: "scent_family", kind: "enum", display_order: 0,
        name_i18n: { ar: "العائلة العطرية", en: "Scent family" },
        options: [{ value: "oriental", label_i18n: { ar: "شرقي", en: "Oriental" } }],
      },
    ]);
    const withAttrs: Product = {
      ...sized,
      attributes: resolveProductAttributes(defs, [
        { product_id: plain.id, attribute_def_id: "d1", value: "oriental" },
      ]),
    };
    render(page(attributes(withAttrs), picker(withAttrs), form(withAttrs)));
    expect(screen.getByText("العائلة العطرية")).toBeTruthy();
    expect(screen.getByText("شرقي")).toBeTruthy();
    expect(useVariantStore.getState().selected[plain.id]).toBeUndefined();
  });
});
