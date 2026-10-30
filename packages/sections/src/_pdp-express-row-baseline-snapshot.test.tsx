// =====================================================================
// Express order-buttons row — frozen before slice 1i (the Espresso Dock)
// =====================================================================
// Whole-section server markup of the express pdp_direct_order with
// today's row: add_to_cart off and on, in ar / en / ku, sold out, without
// WhatsApp, with a variant product, and with the redesign's colour lock +
// promise band. Slice 1i adds an opt-in dock (`cta_layout: "dock"`);
// without it these renders must stay byte-identical. A diff is a
// back-compat break, not a snapshot to refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order, { type Props } from "./pdp_direct_order";
import type { Product } from "./types";
import {
  EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  EXPRESS_IRAQ_PDP_PROPS,
  plainProduct,
  productCtx,
  soldOutProduct,
  variantProduct,
} from "./_pdp-fixtures";

const CART: Props = { ...EXPRESS_IRAQ_PDP_PROPS, add_to_cart: true };
const LOCKED_BAND_CART: Props = {
  ...EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  color_lock: true,
  promise_layout: "band",
  show_whatsapp: true,
  add_to_cart: true,
};

function render(props: Props, product: Product, locale: LocaleCode): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render
        props={props}
        ctx={productCtx(product, { runtime: { ...productCtx(product).runtime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

describe("express row baseline (before the dock)", () => {
  it.each(["ar", "en", "ku"] as const)("add_to_cart off, %s", (locale) => {
    expect(render(EXPRESS_IRAQ_PDP_PROPS, plainProduct, locale)).toMatchSnapshot();
  });

  it.each(["ar", "en", "ku"] as const)("add_to_cart on, %s", (locale) => {
    expect(render(CART, plainProduct, locale)).toMatchSnapshot();
  });

  it("add_to_cart on, sold out, ar", () => {
    expect(render(CART, soldOutProduct, "ar")).toMatchSnapshot();
  });

  it("add_to_cart on, no WhatsApp, ar", () => {
    expect(render({ ...CART, show_whatsapp: false }, plainProduct, "ar")).toMatchSnapshot();
  });

  it("add_to_cart on, variant product, ar", () => {
    expect(render(CART, variantProduct, "ar")).toMatchSnapshot();
  });

  it("colour lock + promise band + add_to_cart, ar", () => {
    expect(render(LOCKED_BAND_CART, plainProduct, "ar")).toMatchSnapshot();
  });
});
