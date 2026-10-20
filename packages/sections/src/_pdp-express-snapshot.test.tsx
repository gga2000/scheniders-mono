// =====================================================================
// T0 — the express pdp_direct_order render, frozen
// =====================================================================
// Server-markup snapshots of the express buy box: the section defaults
// with `layout: "express"`, and an inlined frozen copy of scheniders-iraq's
// draft PDP props (see _pdp-fixtures.ts). Later work adds opt-in express
// fields beside these; with none of them set, the markup must stay
// byte-identical. A diff here is a back-compat break, not a snapshot to
// refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order from "./pdp_direct_order";
import type { Props } from "./pdp_direct_order";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import {
  EXPRESS_IRAQ_PDP_PROPS,
  plainProduct,
  productCtx,
  productRuntime,
  saleProduct,
  soldOutProduct,
  variantProduct,
} from "./_pdp-fixtures";

const Section = pdp_direct_order.render;

function render(
  props: Props,
  product: Product | undefined,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={props} ctx={productCtx(product, overrides)} />
    </StoreBaseProvider>,
  );
}

const products: [string, Product][] = [
  ["discounted, multi-image, reviewed", saleProduct],
  ["single image, full price", plainProduct],
  ["sold out", soldOutProduct],
  ["two variants, none chosen", variantProduct],
];

const EXPRESS_DEFAULTS: Props = { ...pdp_direct_order.defaultProps, layout: "express" };

describe("pdp_direct_order express — defaultProps", () => {
  it.each(products)("%s", (_label, product) => {
    expect(render(EXPRESS_DEFAULTS, product)).toMatchSnapshot();
  });

  it("english locale", () => {
    expect(
      render(EXPRESS_DEFAULTS, saleProduct, {
        runtime: { ...productRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });
});

describe("pdp_direct_order express — frozen scheniders-iraq props", () => {
  it("the frozen props still satisfy the schema unchanged", () => {
    const parsed = pdp_direct_order.schema.safeParse(EXPRESS_IRAQ_PDP_PROPS);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(EXPRESS_IRAQ_PDP_PROPS);
  });

  it.each(products)("%s", (_label, product) => {
    expect(render(EXPRESS_IRAQ_PDP_PROPS, product)).toMatchSnapshot();
  });

  it("english locale", () => {
    expect(
      render(EXPRESS_IRAQ_PDP_PROPS, saleProduct, {
        runtime: { ...productRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });

  it('an explicit trust_chips_placement "bottom" renders exactly like absent', () => {
    // Spread through a plain object so this case compiles both before and
    // after the field exists on the schema.
    const explicit: Record<string, unknown> = {
      ...EXPRESS_IRAQ_PDP_PROPS,
      trust_chips_placement: "bottom",
    };
    const parsed = pdp_direct_order.schema.safeParse(explicit);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(render(parsed.data, saleProduct)).toBe(
        render(EXPRESS_IRAQ_PDP_PROPS, saleProduct),
      );
    }
  });
});
