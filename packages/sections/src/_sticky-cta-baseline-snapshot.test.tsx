// =====================================================================
// PDP redesign 1a — sticky_cta_bar baselines, frozen
// =====================================================================
// Server-markup snapshots of the sticky bar as it renders before the smart
// bar work (slice 1f) adds `form_aware`, `style`, `secondary_display` and
// `whatsapp_prefill_i18n`. With none of those set, every render here must
// stay byte-identical. A diff is a back-compat break, not a snapshot to
// refresh.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "./helpers/store-context";
import sticky_cta_bar from "./sticky_cta_bar";
import type { Props } from "./sticky_cta_bar";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import {
  IRAQ_DRAFT_STICKY_PROPS,
  IRAQ_DRAFT_TENANT,
  productCtx,
  productRuntime,
  saleProduct,
} from "./_pdp-fixtures";

const Bar = sticky_cta_bar.render;

function render(
  props: Props,
  product: Product | undefined,
  overrides: Partial<SectionRenderContext> = {},
): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Bar props={props} ctx={productCtx(product, overrides)} />
    </StoreBaseProvider>,
  );
}

const draft: Partial<SectionRenderContext> = { tenant: IRAQ_DRAFT_TENANT };

describe("sticky_cta_bar baseline (before the smart bar)", () => {
  it("default props on the product page", () => {
    expect(render(sticky_cta_bar.defaultProps, saleProduct)).toMatchSnapshot();
  });

  it("scheniders-iraq draft: scroll_to_form, product price, hidden while the form shows", () => {
    expect(render(IRAQ_DRAFT_STICKY_PROPS, saleProduct, draft)).toMatchSnapshot();
  });

  it("scheniders-iraq draft, english", () => {
    expect(
      render(IRAQ_DRAFT_STICKY_PROPS, saleProduct, {
        ...draft,
        runtime: { ...productRuntime, locale: "en" },
      }),
    ).toMatchSnapshot();
  });

  it('secondary_kind "call"', () => {
    expect(
      render({ ...IRAQ_DRAFT_STICKY_PROPS, secondary_kind: "call" }, saleProduct, draft),
    ).toMatchSnapshot();
  });

  it("the draft props still satisfy the schema unchanged", () => {
    const parsed = sticky_cta_bar.schema.safeParse(IRAQ_DRAFT_STICKY_PROPS);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(IRAQ_DRAFT_STICKY_PROPS);
  });
});
