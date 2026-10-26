// =====================================================================
// T0 — the classic pdp_direct_order render, frozen
// =====================================================================
// Server-markup snapshots of the buy box as every live tenant sees it
// today: the section defaults, and an inlined frozen copy of the
// scheniders-signature PDP props (see _pdp-fixtures.ts). Later work adds
// an opt-in layout beside this one; with no layout set, the markup must
// stay byte-identical. A diff here is a back-compat break, not a snapshot
// to refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order from "./pdp_direct_order";
import type { Props } from "./pdp_direct_order";
import type { SectionRenderContext } from "./_types";
import type { Product, Tenant } from "./types";
import {
  SIGNATURE_PDP_PROPS,
  fixtureTenant,
  plainProduct,
  productCtx,
  productRuntime,
  saleProduct,
  soldOutProduct,
  variantProduct,
} from "./_pdp-fixtures";

function render(
  props: Props,
  product: Product | undefined,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    React.createElement(
      StoreBaseProvider,
      { base: "/s/fixture-store", children: null },
      React.createElement(pdp_direct_order.render, {
        props,
        ctx: productCtx(product, overrides),
      }),
    ),
  );
}

/** A tenant that prices delivery per governorate and has a returns window. */
const pricedTenant: Tenant = {
  ...fixtureTenant,
  store_config_v2: {
    commerce: {
      shipping: {
        rates: { BG: { fee_iqd: 3_000 }, BA: { fee_iqd: 8_000 } },
        default_rate: { fee_iqd: 6_000 },
      },
      returns_policy: { window_days: 7 },
    },
  },
};

const products: [string, Product][] = [
  ["discounted, multi-image, reviewed", saleProduct],
  ["single image, full price", plainProduct],
  ["sold out", soldOutProduct],
  ["two variants, none chosen", variantProduct],
];

describe("pdp_direct_order classic — defaultProps", () => {
  it.each(products)("%s", (_label, product) => {
    expect(render(pdp_direct_order.defaultProps, product)).toMatchSnapshot();
  });

  it("english locale", () => {
    expect(
      render(pdp_direct_order.defaultProps, saleProduct, {
        runtime: { ...productRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });

  it("no product in context", () => {
    expect(render(pdp_direct_order.defaultProps, undefined)).toMatchSnapshot();
  });
});

describe("pdp_direct_order classic — frozen scheniders-signature props", () => {
  it("the frozen props still satisfy the schema unchanged", () => {
    const parsed = pdp_direct_order.schema.safeParse(SIGNATURE_PDP_PROPS);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(SIGNATURE_PDP_PROPS);
  });

  it.each(products)("%s", (_label, product) => {
    expect(render(SIGNATURE_PDP_PROPS, product)).toMatchSnapshot();
  });

  it("remembered governorate on a tenant with delivery fees", () => {
    expect(
      render(SIGNATURE_PDP_PROPS, saleProduct, {
        tenant: pricedTenant,
        runtime: { ...productRuntime, governorate: "BG" },
      }),
    ).toMatchSnapshot();
  });

  it("english locale", () => {
    expect(
      render(SIGNATURE_PDP_PROPS, saleProduct, {
        runtime: { ...productRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });
});
