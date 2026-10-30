// =====================================================================
// Slice 1d baselines — the draft's proof gallery and policy accordion,
// frozen BEFORE the stack and guarantee-card code exists
// =====================================================================
// scheniders-iraq's draft image_gallery (whole-picture carousel in 16/5
// strips) and accordion_richtext (quiet rows + the «تحب تحچي ويانا؟» call
// row) as read on 2026-10-30, as server markup in ar and en. Neither path
// had a frozen snapshot; slice 1d edits both files. With none of the 1d
// props set, this markup must stay byte-identical. A diff here is a
// back-compat break, not a snapshot to refresh. Never run this file with -u.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import accordion_richtext from "./accordion_richtext";
import image_gallery from "./image_gallery";
import { productCtx, productRuntime, saleProduct } from "./_pdp-fixtures";
import { IRAQ_TENANT, lowerCtx } from "./_pdp-lower-fixtures";
import { IRAQ_DRAFT_ACCORDION_BASE, IRAQ_DRAFT_GALLERY_BASE } from "./_pdp-redesign-fixtures";

function renderGallery(locale: LocaleCode): string {
  const Render = image_gallery.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <Render
        props={image_gallery.schema.parse(IRAQ_DRAFT_GALLERY_BASE)}
        ctx={productCtx(saleProduct, { runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

function renderAccordion(locale: LocaleCode): string {
  const Render = accordion_richtext.render;
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <Render
        props={accordion_richtext.schema.parse(IRAQ_DRAFT_ACCORDION_BASE)}
        ctx={lowerCtx(locale, IRAQ_TENANT)}
      />
    </StoreBaseProvider>,
  );
}

describe("image_gallery — scheniders-iraq draft carousel, frozen", () => {
  it.each(["ar", "en"] as const)("%s", (locale) => {
    expect(renderGallery(locale)).toMatchSnapshot();
  });
});

describe("accordion_richtext — scheniders-iraq draft quiet + call row, frozen", () => {
  it.each(["ar", "en"] as const)("%s", (locale) => {
    expect(renderAccordion(locale)).toMatchSnapshot();
  });
});
