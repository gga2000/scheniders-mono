// =====================================================================
// T0 — the express lower area with a scent-carrying product, frozen
// =====================================================================
// Taken BEFORE `scent_journey` / `feature_cards_layout` exist. A product
// that carries notes, season, occasions and a staying-power line must
// render exactly as today until a section opts in. A diff here is a
// back-compat break, not a snapshot to refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import pdp_direct_order from "./pdp_direct_order";
import type { Props } from "./pdp_direct_order";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import { EXPRESS_IRAQ_PDP_PROPS, productCtx, productRuntime } from "./_pdp-fixtures";
import { scentProduct } from "./_pdp-scent-fixtures";

const Section = pdp_direct_order.render;

function render(
  props: Props,
  product: Product,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Section props={props} ctx={productCtx(product, overrides)} />
    </StoreBaseProvider>,
  );
}

const EXPRESS_DEFAULTS: Props = { ...pdp_direct_order.defaultProps, layout: "express" };

describe("express lower area — frozen before the scent work", () => {
  it("the fixture resolves every attribute, in display order", () => {
    expect(scentProduct.attributes?.map((a) => a.def.key)).toEqual([
      "notes",
      "longevity",
      "season",
      "occasions",
      "longevity_note",
    ]);
  });

  it("frozen scheniders-iraq props", () => {
    expect(render(EXPRESS_IRAQ_PDP_PROPS, scentProduct)).toMatchSnapshot();
  });

  it("frozen scheniders-iraq props, english", () => {
    expect(
      render(EXPRESS_IRAQ_PDP_PROPS, scentProduct, {
        runtime: { ...productRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });

  it("express defaults", () => {
    expect(render(EXPRESS_DEFAULTS, scentProduct)).toMatchSnapshot();
  });

  it("the product's attributes do not change today's render", () => {
    const bare: Product = { ...scentProduct, attributes: [] };
    expect(render(EXPRESS_IRAQ_PDP_PROPS, scentProduct)).toBe(
      render(EXPRESS_IRAQ_PDP_PROPS, bare),
    );
  });
});
