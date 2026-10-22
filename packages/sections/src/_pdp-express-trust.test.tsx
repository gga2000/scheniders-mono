// =====================================================================
// pdp_direct_order express — trust_chips_placement: "under_cta"
// =====================================================================
// The opt-in moves the merchant's trust chips from the bottom of the
// express section to one compact strip directly under the CTA block. The
// default (absent / "bottom") is frozen by _pdp-express-snapshot.test.tsx;
// these cases pin the opt-in itself, the catch fallback, and that classic
// ignores the field.
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
  SIGNATURE_PDP_PROPS,
  productCtx,
  productRuntime,
  saleProduct,
  soldOutProduct,
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

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The opening tag of the trust strip's <ul>. */
function stripTag(html: string): string {
  const at = html.indexOf('data-layer="trust"');
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<ul", at);
  return html.slice(open, html.indexOf(">", at) + 1);
}

const TRUST = 'data-layer="trust"';
const CHIP_LABEL = 'data-i18n-field="trust_chips.label_i18n"';
const p: Props = { ...EXPRESS_IRAQ_PDP_PROPS, trust_chips_placement: "under_cta" };
const en: Partial<SectionRenderContext> = {
  runtime: { ...productRuntime, locale: "en" },
};

describe('pdp_direct_order express — trust_chips_placement "under_cta"', () => {
  it("renders exactly one trust strip", () => {
    expect(count(render(p, saleProduct), TRUST)).toBe(1);
  });

  it("places the strip after the submit row and the reassurance line", () => {
    const html = render(p, saleProduct);
    const submit = html.indexOf('data-layer="submit"');
    const reassurance = html.indexOf('data-i18n-field="reassurance_i18n"');
    const trust = html.indexOf(TRUST);
    expect(submit).toBeGreaterThan(-1);
    expect(submit).toBeLessThan(reassurance);
    expect(reassurance).toBeLessThan(trust);
  });

  it("drops the bottom-of-section chips block (each chip renders once)", () => {
    const chips = EXPRESS_IRAQ_PDP_PROPS.trust_chips ?? [];
    expect(chips).toHaveLength(4);
    expect(count(render(p, saleProduct), CHIP_LABEL)).toBe(4);
    // The default keeps the bottom block only — also 4, never 8.
    expect(count(render(EXPRESS_IRAQ_PDP_PROPS, saleProduct), CHIP_LABEL)).toBe(4);
    expect(count(render(EXPRESS_IRAQ_PDP_PROPS, saleProduct), TRUST)).toBe(0);
  });

  it("flips the visual order in Arabic with a class, never with dir", () => {
    const ar = stripTag(render(p, saleProduct));
    expect(ar).toContain("flex-row-reverse");
    expect(ar).not.toContain("dir=");
    expect(ar).toContain('aria-label="وعودنا إلك"');

    const english = stripTag(render(p, saleProduct, en));
    expect(english).not.toContain("flex-row-reverse");
    expect(english).toContain('aria-label="Our promises"');
  });

  it("separates chips sharing a row with inline-end padding, not a column gap", () => {
    const chipTags = (html: string): string[] => {
      const at = html.indexOf(TRUST);
      const ul = html.slice(at, html.indexOf("</ul>", at));
      return ul.match(/<li [^>]*>/g) ?? [];
    };

    const ar = chipTags(render(p, saleProduct));
    expect(ar).toHaveLength(4);
    for (const li of ar) {
      expect(li).toContain("basis-1/2");
      expect(li).toContain("pl-bk-sm");
      expect(li).not.toContain("pr-bk-sm");
    }

    const english = chipTags(render(p, saleProduct, en));
    expect(english).toHaveLength(4);
    for (const li of english) {
      expect(li).toContain("basis-1/2");
      expect(li).toContain("pr-bk-sm");
      expect(li).not.toContain("pl-bk-sm");
    }

    expect(stripTag(render(p, saleProduct))).not.toMatch(/\bgap-x-/);
  });

  it("renders the merchant's labels, resolved per locale", () => {
    expect(render(p, saleProduct)).toContain("الدفع عند الاستلام");
    expect(render(p, saleProduct, en)).toContain("Cash on delivery");
  });

  it("renders nothing when the merchant has no chips", () => {
    const html = render({ ...p, trust_chips: [] }, saleProduct);
    expect(html).not.toContain(TRUST);
    expect(html).not.toContain(CHIP_LABEL);
  });

  it("still renders the strip for a sold-out product", () => {
    expect(count(render(p, soldOutProduct), TRUST)).toBe(1);
  });

  it("a bad stored value is caught to undefined and renders the default", () => {
    const parsed = pdp_direct_order.schema.safeParse({
      ...EXPRESS_IRAQ_PDP_PROPS,
      trust_chips_placement: "sideways",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.trust_chips_placement).toBeUndefined();
      expect(render(parsed.data, saleProduct)).toBe(
        render(EXPRESS_IRAQ_PDP_PROPS, saleProduct),
      );
    }
  });

  it("classic ignores the field", () => {
    expect(
      render({ ...SIGNATURE_PDP_PROPS, trust_chips_placement: "under_cta" }, saleProduct),
    ).toBe(render(SIGNATURE_PDP_PROPS, saleProduct));
  });
});
