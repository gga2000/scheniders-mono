// =====================================================================
// pdp_direct_order express — scent_journey + feature_cards_layout
// =====================================================================
// Both opt-ins render from merchant data only. The defaults are frozen by
// _pdp-scent-baseline-snapshot.test.tsx and _pdp-express-snapshot.test.tsx;
// these cases pin the opt-ins, their catch fallbacks, and that classic
// ignores them.
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
} from "./_pdp-fixtures";
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

/** Parse through the real schema so these cases compile before and after
 *  the fields exist, and exercise the catch guards. */
function parse(extra: Record<string, unknown>): Props {
  const parsed = pdp_direct_order.schema.safeParse({ ...EXPRESS_IRAQ_PDP_PROPS, ...extra });
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

const JOURNEY = {
  pyramid_key: "notes",
  chip_keys: ["occasions", "season"],
  note_key: "longevity_note",
};

const en: Partial<SectionRenderContext> = {
  runtime: { ...productRuntime, locale: "en" },
};

describe("pdp_direct_order schema — scent opt-ins", () => {
  it("keeps a well-formed scent_journey and feature_cards_layout", () => {
    const p = parse({ scent_journey: JOURNEY, feature_cards_layout: "row" });
    expect(p.scent_journey).toEqual(JOURNEY);
    expect(p.feature_cards_layout).toBe("row");
  });

  it("drops a malformed scent_journey instead of failing the whole buy box", () => {
    expect(parse({ scent_journey: { pyramid_key: "" } }).scent_journey).toBeUndefined();
    expect(parse({ scent_journey: "notes" }).scent_journey).toBeUndefined();
    expect(
      parse({ scent_journey: { pyramid_key: "notes", chip_keys: ["a", "b", "c", "d", "e"] } })
        .scent_journey,
    ).toBeUndefined();
  });

  it("drops an unknown feature_cards_layout", () => {
    expect(parse({ feature_cards_layout: "carousel" }).feature_cards_layout).toBeUndefined();
  });

  it('an explicit feature_cards_layout "stack" renders exactly like absent', () => {
    const stack = parse({ feature_cards_layout: "stack" });
    expect(render(stack, scentProduct)).toBe(render(EXPRESS_IRAQ_PDP_PROPS, scentProduct));
    expect(render(stack, scentProduct, en)).toBe(
      render(EXPRESS_IRAQ_PDP_PROPS, scentProduct, en),
    );
  });

  it("scent_journey on a product without attributes renders exactly like absent", () => {
    expect(render(parse({ scent_journey: JOURNEY }), plainProduct)).toBe(
      render(EXPRESS_IRAQ_PDP_PROPS, plainProduct),
    );
  });
});
