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
import image_gallery from "./image_gallery";
import pdp_direct_order from "./pdp_direct_order";
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
import { wayferProduct } from "./_pdp-wayfer-fixtures";
import {
  IRAQ_DRAFT_ACCORDION_BASE,
  IRAQ_DRAFT_GALLERY_BASE,
  IRAQ_REDESIGN_ACCORDION_INPUT,
  IRAQ_REDESIGN_GALLERY_INPUT,
  IRAQ_REDESIGN_PDP_PROPS,
  IRAQ_REDESIGN_TENANT,
  IRAQ_RETURN_WORDING,
  SLICE_1B_CONTACT_PATCH,
  SLICE_1B_PDP_PATCH,
  SLICE_1C_PDP_PATCH,
  SLICE_1D_ACCORDION_PATCH,
  SLICE_1D_ACCORDION_REMOVE,
  SLICE_1D_GALLERY_PATCH,
  SLICE_1D_PDP_PATCH,
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
