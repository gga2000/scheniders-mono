// Express `heading_style: "chapter"` (spec §1.1, decided for
// pdp_direct_order in slice 1b): the lower blocks' headings — about the
// scent, the scent journey, the feature cards (row or stack) — render as
// `ChapterHeading` (`text-bk-chapter`, reading-aligned) instead of the
// `text-lg` h2s. Absent keeps today's markup (pinned by the baselines).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreBaseProvider } from "../helpers/store-context";
import pdp_direct_order from "../pdp_direct_order";
import type { Props } from "../pdp_direct_order";
import { EXPRESS_IRAQ_DRAFT_PDP_PROPS, productCtx, productRuntime, saleProduct } from "../_pdp-fixtures";
import { scentProduct } from "../_pdp-scent-fixtures";
import type { Product } from "../types";

function render(props: Props, product: Product, locale: "ar" | "en" = "ar"): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <pdp_direct_order.render
        props={props}
        ctx={productCtx(product, { runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const CHAPTER = "text-bk-chapter";
const OLD_H2 = "font-bk-display text-lg font-black";
const chapter: Props = { ...EXPRESS_IRAQ_DRAFT_PDP_PROPS, heading_style: "chapter" };

describe('express heading_style "chapter"', () => {
  it("today: three text-lg headings and no chapter heading", () => {
    const html = render(EXPRESS_IRAQ_DRAFT_PDP_PROPS, scentProduct);
    expect(count(html, CHAPTER)).toBe(0);
    expect(count(html, OLD_H2)).toBe(3);
  });

  it("about the scent, the journey and the note row become chapter headings", () => {
    const html = render(chapter, scentProduct);
    expect(count(html, CHAPTER)).toBe(3);
    expect(count(html, OLD_H2)).toBe(0);
    expect(html).toContain("عن العطر");
    expect(html).toContain("رحلة العطر");
    expect(html).toContain('data-i18n-field="feature_cards_title_i18n"');
    expect(html).toContain('data-i18n-field="scent_journey.title_i18n"');
  });

  it("the journey section stays labelled by its heading", () => {
    const html = render(chapter, scentProduct);
    const labelled = /aria-labelledby="([^"]+)"/.exec(html)?.[1];
    expect(labelled).toBeTruthy();
    expect(html).toContain(`<h2 id="${labelled}"`);
  });

  it("the stacked feature cards title too", () => {
    const html = render({ ...chapter, feature_cards_layout: "stack" }, saleProduct);
    expect(count(html, CHAPTER)).toBe(2);
    expect(count(html, OLD_H2)).toBe(0);
  });

  it("aligns to the reading edge: right in Arabic, left in English", () => {
    expect(count(render(chapter, scentProduct), "gap-bk-2xs items-end text-right")).toBe(3);
    expect(count(render(chapter, scentProduct, "en"), "gap-bk-2xs items-start text-left")).toBe(3);
  });
});
