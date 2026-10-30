// @vitest-environment jsdom
// =====================================================================
// The Espresso Dock (slice 1i) — `cta_layout: "dock"`
// =====================================================================
// Ali's concept A «الكبسولة»: one espresso capsule holding the yellow
// «ثبّت طلبي» pill, the cream «أضف للسلة» segment and the WhatsApp
// segment; an add slides a confirmation drawer out from under it. The dock
// changes the look only: the same submit (the only thing that sends the
// order, D6), the same cart tap (1g), the same WhatsApp link, the same
// live region, and the 1f sticky bar still hands off to the submit.
// Absent or "row", the express section is exactly today's (frozen in
// _pdp-express-row-baseline-snapshot).
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render } from "@testing-library/react";
import type { LocaleCode } from "@scheniders/shared";
import { useCart } from "./helpers/cart-store";
import { useExpressOrderStore } from "./helpers/express-order-store";
import { StoreBaseProvider } from "./helpers/store-context";
import { useVariantStore } from "./helpers/variant-store";
import pdp_direct_order, { type Props } from "./pdp_direct_order";
import type { Product } from "./types";
import { EXPRESS_IRAQ_PDP_PROPS, plainProduct, productCtx } from "./_pdp-fixtures";

const CART: Props = { ...EXPRESS_IRAQ_PDP_PROPS, add_to_cart: true };

function markup(props: Props, product: Product = plainProduct, locale: LocaleCode = "ar"): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render
        props={props}
        ctx={productCtx(product, { runtime: { ...productCtx(product).runtime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

beforeEach(() => {
  useCart.setState({ items: [] });
  useVariantStore.setState({ selected: {} });
  useExpressOrderStore.setState({ forms: {}, watchers: {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("cta_layout prop", () => {
  it("parses row and dock; a bad stored value degrades to absent", () => {
    expect(pdp_direct_order.schema.parse({ ...CART, cta_layout: "dock" }).cta_layout).toBe("dock");
    expect(pdp_direct_order.schema.parse({ ...CART, cta_layout: "row" }).cta_layout).toBe("row");
    const bad = pdp_direct_order.schema.parse({ ...CART, cta_layout: "capsule" });
    expect(bad.cta_layout).toBeUndefined();
    expect(bad.layout).toBe("express");
  });

  it("row renders exactly like absent, with and without the cart", () => {
    expect(markup({ ...CART, cta_layout: "row" })).toBe(markup(CART));
    expect(markup({ ...EXPRESS_IRAQ_PDP_PROPS, cta_layout: "row" })).toBe(markup(EXPRESS_IRAQ_PDP_PROPS));
  });

  it("a jsdom mount of the default row has no dock", () => {
    const view = render(
      <StoreBaseProvider base="/s/fixture-store">
        <pdp_direct_order.render props={CART} ctx={productCtx(plainProduct)} />
      </StoreBaseProvider>,
    );
    expect(view.container.querySelector("[data-cta-layout]")).toBeNull();
  });
});
