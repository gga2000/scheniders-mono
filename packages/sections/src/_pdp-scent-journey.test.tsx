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

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The journey <section>, open tag to close tag (it has no nested section). */
function journeyBlock(html: string): string {
  const at = html.indexOf('data-layer="scent-journey"');
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<section", at);
  return html.slice(open, html.indexOf("</section>", at) + "</section>".length);
}

describe("pdp_direct_order express — scent_journey block", () => {
  const p = parse({ scent_journey: JOURNEY });

  it("renders once, after the description and before the feature cards", () => {
    const html = render(p, scentProduct);
    expect(count(html, 'data-layer="scent-journey"')).toBe(1);
    const about = html.indexOf(">عن العطر<");
    const journey = html.indexOf('data-layer="scent-journey"');
    const cards = html.indexOf('data-i18n-field="feature_cards_title_i18n"');
    expect(about).toBeGreaterThan(-1);
    expect(about).toBeLessThan(journey);
    expect(journey).toBeLessThan(cards);
  });

  it("walks the merchant's stages top → heart → base with their labels, chrome hints and notes", () => {
    const b = journeyBlock(render(p, scentProduct));
    const top = b.indexOf('data-stage="top"');
    const heart = b.indexOf('data-stage="heart"');
    const base = b.indexOf('data-stage="base"');
    expect(top).toBeGreaterThan(-1);
    expect(top).toBeLessThan(heart);
    expect(heart).toBeLessThan(base);
    for (const s of ["المقدمة", "القلب", "القاعدة", "أول ما ترشه", "بعد ما يهدى", "اللي يبقى عليك"]) {
      expect(b).toContain(s);
    }
    expect(b).toContain("<bdi>الليمون</bdi>، <bdi>الماندرين</bdi>، <bdi>البرغموت</bdi>");
  });

  it("shows the occasion and season chips, in the configured order", () => {
    const b = journeyBlock(render(p, scentProduct));
    const occ = b.indexOf('data-chip-row="occasions"');
    const season = b.indexOf('data-chip-row="season"');
    expect(occ).toBeGreaterThan(-1);
    expect(occ).toBeLessThan(season);
    expect(b).toContain("وين تحطه؟");
    expect(b).toContain("<bdi>الطلعات النهارية</bdi>");
    expect(b).toContain("<bdi>صيفي</bdi>");
  });

  it("states staying power in the merchant's words and never draws the range", () => {
    const ar = journeyBlock(render(p, scentProduct));
    expect(ar).toContain("data-staying-power");
    expect(ar).toContain("<bdi>ثبات ممتاز وفوحان قوي.</bdi>");
    const english = journeyBlock(render(p, scentProduct, en));
    expect(english).not.toContain("Longevity");
    expect(english).not.toContain('role="meter"');
    expect(english).toContain("Staying power, in words");
  });

  it("uses the chrome heading unless the merchant sets one", () => {
    expect(journeyBlock(render(p, scentProduct))).toContain(">رحلة العطر</h2>");
    const titled = parse({ scent_journey: { ...JOURNEY, title_i18n: { ar: "شلون يتغير عليك" } } });
    expect(journeyBlock(render(titled, scentProduct))).toContain(">شلون يتغير عليك</h2>");
  });

  it("flips the visual order in Arabic with classes, never with dir", () => {
    const ar = journeyBlock(render(p, scentProduct));
    expect(ar).toContain("flex-row-reverse");
    expect(ar).not.toContain("dir=");
    const english = journeyBlock(render(p, scentProduct, en));
    expect(english).not.toContain("flex-row-reverse");
  });

  it("classic ignores it", () => {
    expect(render({ ...p, layout: undefined }, scentProduct)).toBe(
      render({ ...EXPRESS_IRAQ_PDP_PROPS, layout: undefined }, scentProduct),
    );
  });
});
