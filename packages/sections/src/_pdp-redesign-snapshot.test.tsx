// =====================================================================
// PDP redesign — the opted-in renders, from the draft Phase 1 writes
// =====================================================================
// Server-markup snapshots of each section with the redesign props on,
// from `_pdp-redesign-fixtures.ts`, in ar and en. Unlike the §1.0
// baselines these are expected to change when a slice changes the
// opted-in design; a diff must match what that slice meant to change.
// The fixture patches are checked against the migrations that write them.
// =====================================================================

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocaleCode } from "@scheniders/shared";
import { StoreBaseProvider } from "./helpers/store-context";
import accordion_richtext from "./accordion_richtext";
import faq_contact_split from "./faq_contact_split";
import image_gallery from "./image_gallery";
import pdp_direct_order from "./pdp_direct_order";
import product_reviews from "./product_reviews";
import site_header from "./site_header";
import sticky_cta_bar from "./sticky_cta_bar";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import {
  EXPRESS_IRAQ_DRAFT_PDP_PROPS,
  IRAQ_DRAFT_TENANT,
  productCtx,
  productRuntime,
  saleProduct,
} from "./_pdp-fixtures";
import { scentProduct } from "./_pdp-scent-fixtures";
import { WAYFER_REVIEWS, wayferProduct } from "./_pdp-wayfer-fixtures";
import { IRAQ_TENANT } from "./_pdp-lower-fixtures";
import {
  IRAQ_DRAFT_ACCORDION_BASE,
  IRAQ_DRAFT_FAQ_BASE,
  IRAQ_DRAFT_GALLERY_BASE,
  IRAQ_DRAFT_REVIEWS_BASE,
  IRAQ_REDESIGN_ACCORDION_INPUT,
  IRAQ_REDESIGN_FAQ_INPUT,
  IRAQ_DRAFT_HEADER_BASE,
  IRAQ_REDESIGN_GALLERY_INPUT,
  IRAQ_REDESIGN_HEADER_INPUT,
  IRAQ_REDESIGN_HEADER_PRODUCT_INPUT,
  IRAQ_REDESIGN_PDP_PROPS,
  IRAQ_REDESIGN_REVIEWS_INPUT,
  IRAQ_REDESIGN_STICKY_INPUT,
  IRAQ_REDESIGN_TENANT,
  IRAQ_RETURN_WORDING,
  SLICE_1B_CONTACT_PATCH,
  SLICE_1B_PDP_PATCH,
  SLICE_1C_PDP_PATCH,
  SLICE_1D_ACCORDION_PATCH,
  SLICE_1D_ACCORDION_REMOVE,
  SLICE_1D_GALLERY_PATCH,
  SLICE_1D_PDP_PATCH,
  SLICE_1E_FAQ_PATCH,
  SLICE_1E_PDP_PATCH,
  SLICE_1E_REVIEWS_PATCH,
  SLICE_1F_PDP_PATCH,
  SLICE_1F_STICKY_PATCH,
  SLICE_1G_HEADER_PATCH,
  SLICE_1G_HEADER_VARIANT_PATCH,
  SLICE_1G_PDP_PATCH,
  SLICE_1H_EDITS,
  SLICE_1I_PDP_PATCH,
} from "./_pdp-redesign-fixtures";

const MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);

/** A draft migration by its name, whatever its timestamp: the timestamp is
 *  re-stamped when a later migration reaches main first (spec, "Hard
 *  constraints"). Exactly one file may carry the name. */
function migrationSql(name: string): string {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(`_${name}.sql`));
  expect(files).toHaveLength(1);
  return readFileSync(new URL(files[0] ?? "", MIGRATIONS), "utf8");
}

/** The `$json$…$json$` literal between `-- <name>:begin` and `-- <name>:end`. */
function migrationJson(sql: string, name: string): unknown {
  const block = sql.slice(sql.indexOf(`-- ${name}:begin`), sql.indexOf(`-- ${name}:end`));
  const m = /\$json\$([\s\S]*)\$json\$/.exec(block);
  expect(m).not.toBeNull();
  return JSON.parse(m?.[1] ?? "null");
}

/** The `ARRAY['a', 'b']` literal between `-- <name>:begin` and `-- <name>:end`. */
function migrationTextArray(sql: string, name: string): string[] {
  const block = sql.slice(sql.indexOf(`-- ${name}:begin`), sql.indexOf(`-- ${name}:end`));
  const m = /ARRAY\[([^\]]*)\]/.exec(block);
  expect(m).not.toBeNull();
  return [...(m?.[1] ?? "").matchAll(/'([^']*)'/g)].map((x) => x[1] ?? "");
}

describe("redesign fixtures mirror the draft migrations", () => {
  const sql = migrationSql("scheniders_iraq_pdp_redesign_1b_draft");

  it("slice 1b pdp_direct_order patch", () => {
    expect(migrationJson(sql, "pdp_patch")).toEqual(SLICE_1B_PDP_PATCH);
  });

  it("slice 1b commerce.contact patch", () => {
    expect(migrationJson(sql, "contact_patch")).toEqual(SLICE_1B_CONTACT_PATCH);
  });

  it("slice 1c pdp_direct_order patch", () => {
    const sql1c = migrationSql("scheniders_iraq_pdp_redesign_1c_draft");
    expect(migrationJson(sql1c, "pdp_patch")).toEqual(SLICE_1C_PDP_PATCH);
  });

  it("slice 1d patches: gallery, accordion (+ removed keys), pdp_direct_order", () => {
    const sql1d = migrationSql("scheniders_iraq_pdp_redesign_1d_draft");
    expect(migrationJson(sql1d, "gallery_patch")).toEqual(SLICE_1D_GALLERY_PATCH);
    expect(migrationJson(sql1d, "accordion_patch")).toEqual(SLICE_1D_ACCORDION_PATCH);
    expect(migrationTextArray(sql1d, "accordion_remove")).toEqual([...SLICE_1D_ACCORDION_REMOVE]);
    expect(migrationJson(sql1d, "pdp_patch")).toEqual(SLICE_1D_PDP_PATCH);
  });

  it("the band's «الشروط» link targets the guarantee card", () => {
    expect(IRAQ_REDESIGN_PDP_PROPS.guarantee_anchor_id).toBe("guarantee");
    expect(accordion_richtext.schema.parse(IRAQ_REDESIGN_ACCORDION_INPUT).anchor_id).toBe(
      IRAQ_REDESIGN_PDP_PROPS.guarantee_anchor_id,
    );
  });

  it("the band's return line and the card's week term come from one wording", () => {
    expect(SLICE_1B_PDP_PATCH.return_promise_i18n).toEqual(IRAQ_RETURN_WORDING.band);
    expect(IRAQ_REDESIGN_PDP_PROPS.return_promise_i18n).toEqual(IRAQ_RETURN_WORDING.band);
    const weekTerm = accordion_richtext.schema.parse(IRAQ_REDESIGN_ACCORDION_INPUT).items[2];
    expect(weekTerm?.body_i18n).toEqual(IRAQ_RETURN_WORDING.week_term);
  });

  it("the 1d gallery and accordion parse to exactly what is stored", () => {
    expect(image_gallery.schema.parse(IRAQ_REDESIGN_GALLERY_INPUT)).toEqual(IRAQ_REDESIGN_GALLERY_INPUT);
    expect(accordion_richtext.schema.parse(IRAQ_REDESIGN_ACCORDION_INPUT)).toEqual(IRAQ_REDESIGN_ACCORDION_INPUT);
    expect(IRAQ_REDESIGN_ACCORDION_INPUT).not.toHaveProperty("call_row");
  });

  it("slice 1e patches: product_reviews, faq_contact_split, pdp_direct_order", () => {
    const sql1e = migrationSql("scheniders_iraq_pdp_redesign_1e_draft");
    expect(migrationJson(sql1e, "reviews_patch")).toEqual(SLICE_1E_REVIEWS_PATCH);
    expect(migrationJson(sql1e, "faq_patch")).toEqual(SLICE_1E_FAQ_PATCH);
    expect(migrationJson(sql1e, "pdp_patch")).toEqual(SLICE_1E_PDP_PATCH);
  });

  it("the 1e reviews and FAQ parse to exactly what is stored", () => {
    expect(product_reviews.schema.parse(IRAQ_REDESIGN_REVIEWS_INPUT)).toEqual(IRAQ_REDESIGN_REVIEWS_INPUT);
    expect(faq_contact_split.schema.parse(IRAQ_REDESIGN_FAQ_INPUT)).toEqual(IRAQ_REDESIGN_FAQ_INPUT);
  });

  it("every curated key phrase is a verbatim part of its approved review", () => {
    for (const c of SLICE_1E_REVIEWS_PATCH.review_curation) {
      const review = WAYFER_REVIEWS.find((r) => r.id === c.review_id);
      expect(review?.body ?? "").toContain(c.highlight);
    }
    expect(new Set(SLICE_1E_REVIEWS_PATCH.review_curation.map((c) => c.review_id)).size).toBe(WAYFER_REVIEWS.length);
  });

  it("the FAQ patch only retitles the contact: icon, CTA label and number unchanged", () => {
    const { title_i18n: _t, sub_i18n: _s, ...rest } = SLICE_1E_FAQ_PATCH.contact;
    const { title_i18n: _bt, sub_i18n: _bs, ...baseRest } = IRAQ_DRAFT_FAQ_BASE.contact;
    expect(rest).toEqual(baseRest);
  });

  it("slice 1f sticky_cta_bar patch", () => {
    const sql1f = migrationSql("scheniders_iraq_pdp_redesign_1f_draft");
    expect(migrationJson(sql1f, "sticky_patch")).toEqual(SLICE_1F_STICKY_PATCH);
  });

  it("slice 1f pdp_direct_order patch: the WhatsApp tile is back", () => {
    const sql1f = migrationSql("scheniders_iraq_pdp_redesign_1f_draft");
    expect(migrationJson(sql1f, "pdp_patch")).toEqual(SLICE_1F_PDP_PATCH);
    expect(IRAQ_REDESIGN_PDP_PROPS.show_whatsapp).toBe(true);
  });

  it("the 1f sticky bar parses to exactly what is stored, still hidden while the form shows", () => {
    const parsed = sticky_cta_bar.schema.parse(IRAQ_REDESIGN_STICKY_INPUT);
    expect(parsed).toEqual(IRAQ_REDESIGN_STICKY_INPUT);
    expect(parsed.hide_while).toBe("form");
    expect(parsed.show_product_price).toBe(true);
  });

  it("slice 1g patches: pdp_direct_order, the header base, its product variant", () => {
    const sql1g = migrationSql("scheniders_iraq_pdp_redesign_1g_draft");
    expect(migrationJson(sql1g, "pdp_patch")).toEqual(SLICE_1G_PDP_PATCH);
    expect(migrationJson(sql1g, "header_patch")).toEqual(SLICE_1G_HEADER_PATCH);
    expect(migrationJson(sql1g, "header_variant_patch")).toEqual(SLICE_1G_HEADER_VARIANT_PATCH);
    expect(IRAQ_REDESIGN_PDP_PROPS.add_to_cart).toBe(true);
  });

  it("the 1g header parses to exactly what is stored, on the product page and off it", () => {
    expect(site_header.schema.parse(IRAQ_DRAFT_HEADER_BASE)).toEqual(IRAQ_DRAFT_HEADER_BASE);
    expect(site_header.schema.parse(IRAQ_REDESIGN_HEADER_INPUT)).toEqual(IRAQ_REDESIGN_HEADER_INPUT);
    const product = site_header.schema.parse(IRAQ_REDESIGN_HEADER_PRODUCT_INPUT);
    expect(product).toEqual(IRAQ_REDESIGN_HEADER_PRODUCT_INPUT);
    expect([product.surface, product.sticky, product.show_cart, product.overlay_cart]).toEqual([
      "overlay",
      false,
      true,
      true,
    ]);
  });

  it("slice 1h edits: cart, checkout and thank-you sections", () => {
    const sql1h = migrationSql("scheniders_iraq_pdp_redesign_1h_draft");
    expect(migrationJson(sql1h, "edits")).toEqual(SLICE_1H_EDITS);
  });

  it("slice 1i pdp_direct_order patch: the Espresso Dock", () => {
    const sql1i = migrationSql("scheniders_iraq_pdp_redesign_1i_draft");
    expect(migrationJson(sql1i, "pdp_patch")).toEqual(SLICE_1I_PDP_PATCH);
    expect(IRAQ_REDESIGN_PDP_PROPS.cta_layout).toBe("dock");
    expect(IRAQ_REDESIGN_PDP_PROPS.add_to_cart).toBe(true);
  });

  it("the patched props satisfy the schema unchanged", () => {
    const parsed = pdp_direct_order.schema.safeParse(IRAQ_REDESIGN_PDP_PROPS);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(IRAQ_REDESIGN_PDP_PROPS);
  });
});

describe("pdp_direct_order express — redesign draft", () => {
  const products: [string, Product][] = [
    ["discounted, multi-image, reviewed", saleProduct],
    ["scent attributes", scentProduct],
    ["Wayfarer, live data", wayferProduct],
  ];

  function render(product: Product, overrides: Partial<SectionRenderContext> = {}): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <pdp_direct_order.render
          props={IRAQ_REDESIGN_PDP_PROPS}
          ctx={productCtx(product, { tenant: IRAQ_REDESIGN_TENANT, ...overrides })}
        />
      </StoreBaseProvider>,
    );
  }

  it.each(products)("ar, %s", (_label, product) => {
    expect(render(product)).toMatchSnapshot();
  });

  it.each(products)("en, %s", (_label, product) => {
    expect(render(product, { runtime: { ...productRuntime, locale: "en" } })).toMatchSnapshot();
  });

  it.each(products)("adds no dir attribute (%s)", (_label, product) => {
    const before = renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <pdp_direct_order.render
          props={EXPRESS_IRAQ_DRAFT_PDP_PROPS}
          ctx={productCtx(product, { tenant: IRAQ_DRAFT_TENANT })}
        />
      </StoreBaseProvider>,
    );
    const dirs = (html: string) => html.split('dir="').length - 1;
    // Card mode (1c) drops the description block's one dir="auto"
    // paragraph and adds none.
    expect(dirs(render(product))).toBe(dirs(before) - 1);
  });
});

describe("image_gallery + accordion_richtext — redesign draft (slice 1d)", () => {
  function renderGallery(input: unknown, locale: LocaleCode): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <image_gallery.render
          props={image_gallery.schema.parse(input)}
          ctx={productCtx(saleProduct, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, locale } })}
        />
      </StoreBaseProvider>,
    );
  }

  function renderAccordion(input: unknown, locale: LocaleCode): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <accordion_richtext.render
          props={accordion_richtext.schema.parse(input)}
          ctx={productCtx(saleProduct, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, locale } })}
        />
      </StoreBaseProvider>,
    );
  }

  it.each(["ar", "en"] as const)("proof stack, %s", (locale) => {
    expect(renderGallery(IRAQ_REDESIGN_GALLERY_INPUT, locale)).toMatchSnapshot();
  });

  it.each(["ar", "en"] as const)("guarantee card, %s", (locale) => {
    expect(renderAccordion(IRAQ_REDESIGN_ACCORDION_INPUT, locale)).toMatchSnapshot();
  });

  it("the stack adds no dir attribute; the card drops the quiet rows' dir=\"auto\"", () => {
    const dirs = (html: string) => html.split('dir="').length - 1;
    expect(dirs(renderGallery(IRAQ_REDESIGN_GALLERY_INPUT, "ar"))).toBe(dirs(renderGallery(IRAQ_DRAFT_GALLERY_BASE, "ar")));
    expect(dirs(renderGallery(IRAQ_REDESIGN_GALLERY_INPUT, "ar"))).toBe(0);
    expect(dirs(renderAccordion(IRAQ_DRAFT_ACCORDION_BASE, "ar"))).toBe(5);
    expect(dirs(renderAccordion(IRAQ_REDESIGN_ACCORDION_INPUT, "ar"))).toBe(0);
  });
});

describe("product_reviews + faq_contact_split — redesign draft (slice 1e)", () => {
  function renderReviews(input: unknown, locale: LocaleCode): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <product_reviews.render
          props={product_reviews.schema.parse(input)}
          ctx={productCtx(wayferProduct, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, locale } })}
        />
      </StoreBaseProvider>,
    );
  }

  function renderFaq(input: unknown, locale: LocaleCode, product: Product = wayferProduct): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <faq_contact_split.render
          props={faq_contact_split.schema.parse(input)}
          ctx={productCtx(product, { tenant: IRAQ_TENANT, runtime: { ...productRuntime, locale } })}
        />
      </StoreBaseProvider>,
    );
  }

  it.each(["ar", "en"] as const)("reviews highlights, %s", (locale) => {
    expect(renderReviews(IRAQ_REDESIGN_REVIEWS_INPUT, locale)).toMatchSnapshot();
  });

  it.each(["ar", "en"] as const)("FAQ contact row (Wayfarer today: 0 of 2 answered), %s", (locale) => {
    expect(renderFaq(IRAQ_REDESIGN_FAQ_INPUT, locale)).toMatchSnapshot();
  });

  it("FAQ with both answers (after to-do 2), ar", () => {
    expect(renderFaq(IRAQ_REDESIGN_FAQ_INPUT, "ar", { ...scentProduct, size_ml: 100 })).toMatchSnapshot();
  });

  it("the identity row and the scent card link to the summary card the reviews render", () => {
    const pdp = renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <pdp_direct_order.render props={IRAQ_REDESIGN_PDP_PROPS} ctx={productCtx(wayferProduct, { tenant: IRAQ_REDESIGN_TENANT })} />
      </StoreBaseProvider>,
    );
    expect(pdp).toContain('data-rating-link="summary"');
    expect(pdp).toContain('data-scent-rating="link"');
    expect(pdp.split('href="#reviews-summary"').length - 1).toBe(2);
    expect(renderReviews(IRAQ_REDESIGN_REVIEWS_INPUT, "ar")).toContain('id="reviews-summary"');
  });

  it("the old «عندك استفسار؟» card is gone; no section adds a dir attribute", () => {
    const dirs = (html: string) => html.split('dir="').length - 1;
    expect(renderFaq(IRAQ_REDESIGN_FAQ_INPUT, "ar")).not.toContain("عندك استفسار؟");
    expect(dirs(renderFaq(IRAQ_DRAFT_FAQ_BASE, "ar"))).toBe(4);
    expect(dirs(renderFaq(IRAQ_REDESIGN_FAQ_INPUT, "ar"))).toBe(0);
    expect(dirs(renderReviews(IRAQ_DRAFT_REVIEWS_BASE, "ar"))).toBe(0);
    expect(dirs(renderReviews(IRAQ_REDESIGN_REVIEWS_INPUT, "ar"))).toBe(0);
  });
});

describe("sticky_cta_bar — redesign draft (slice 1f)", () => {
  function renderBar(locale: LocaleCode): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <sticky_cta_bar.render
          props={sticky_cta_bar.schema.parse(IRAQ_REDESIGN_STICKY_INPUT)}
          ctx={productCtx(wayferProduct, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, locale } })}
        />
      </StoreBaseProvider>,
    );
  }

  it.each(["ar", "en"] as const)("sticky bar, %s", (locale) => {
    expect(renderBar(locale)).toMatchSnapshot();
  });

  it("soft: no ink outline, no colour literal, no dir; yellow only on the primary", () => {
    const html = renderBar("ar");
    expect(html).not.toContain("--bk-border-thickness");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
    expect(html).not.toContain(' dir="');
    expect(html.split("bg-bk-primary ").length - 1).toBe(1);
  });
});

describe("site_header — redesign draft (slice 1g)", () => {
  function renderHeader(input: Record<string, unknown>, locale: LocaleCode): string {
    return renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <site_header.render
          props={site_header.schema.parse(input)}
          ctx={productCtx(wayferProduct, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, locale } })}
        />
      </StoreBaseProvider>,
    );
  }

  it.each(["ar", "en"] as const)("product page header with the cart chip, %s", (locale) => {
    expect(renderHeader(IRAQ_REDESIGN_HEADER_PRODUCT_INPUT, locale)).toMatchSnapshot();
  });

  it("the cart chip: to the cart, beside the menu, no yellow, no colour literal, no dir", () => {
    const html = renderHeader(IRAQ_REDESIGN_HEADER_PRODUCT_INPUT, "ar");
    expect(html).toContain('href="/s/fixture-store/cart"');
    expect(html).toContain('aria-label="سلة التسوّق (0)"');
    expect(html).not.toContain("bg-bk-primary");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
    expect(html).not.toContain(' dir="');
  });

  it("every other page: the solid header shows the cart", () => {
    const html = renderToStaticMarkup(
      <StoreBaseProvider base="/s/fixture-store">
        <site_header.render
          props={site_header.schema.parse(IRAQ_REDESIGN_HEADER_INPUT)}
          ctx={productCtx(undefined, { tenant: IRAQ_REDESIGN_TENANT, runtime: { ...productRuntime, page_id: "home" } })}
        />
      </StoreBaseProvider>,
    );
    expect(html).toContain('href="/s/fixture-store/cart"');
    expect(html).not.toContain("data-header-cart");
  });
});
