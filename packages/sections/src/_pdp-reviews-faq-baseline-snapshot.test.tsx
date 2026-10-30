// =====================================================================
// Slice 1e baselines — the draft's reviews and FAQ, frozen BEFORE the
// highlights and product-FAQ code exists
// =====================================================================
// scheniders-iraq's draft product_reviews (quiet layout) over Wayfarer's
// six live reviews, and its faq_contact_split (compact list + the «عندك
// استفسار؟» WhatsApp row), as read on 2026-10-30, as server markup in ar
// and en. Neither config had a frozen snapshot; slice 1e edits both
// files. With none of the 1e props set, this markup must stay
// byte-identical. A diff here is a back-compat break, not a snapshot to
// refresh. Never run this file with -u.
// =====================================================================

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import faq_contact_split from "./faq_contact_split";
import product_reviews from "./product_reviews";
import { productCtx, productRuntime } from "./_pdp-fixtures";
import { IRAQ_TENANT } from "./_pdp-lower-fixtures";
import { IRAQ_DRAFT_FAQ_BASE, IRAQ_DRAFT_REVIEWS_BASE } from "./_pdp-redesign-fixtures";
import { wayferProduct } from "./_pdp-wayfer-fixtures";

function renderReviews(locale: LocaleCode): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="/s/fixture-store">
      <product_reviews.render
        props={product_reviews.schema.parse(IRAQ_DRAFT_REVIEWS_BASE)}
        ctx={productCtx(wayferProduct, { tenant: IRAQ_TENANT, runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

function renderFaq(locale: LocaleCode): string {
  return renderToStaticMarkup(
    <StoreBaseProvider base="">
      <faq_contact_split.render
        props={faq_contact_split.schema.parse(IRAQ_DRAFT_FAQ_BASE)}
        ctx={productCtx(wayferProduct, { tenant: IRAQ_TENANT, runtime: { ...productRuntime, locale } })}
      />
    </StoreBaseProvider>,
  );
}

describe("product_reviews — scheniders-iraq draft quiet layout, frozen", () => {
  it.each(["ar", "en"] as const)("%s", (locale) => {
    expect(renderReviews(locale)).toMatchSnapshot();
  });
});

describe("faq_contact_split — scheniders-iraq draft compact + WhatsApp row, frozen", () => {
  it.each(["ar", "en"] as const)("%s", (locale) => {
    expect(renderFaq(locale)).toMatchSnapshot();
  });
});
