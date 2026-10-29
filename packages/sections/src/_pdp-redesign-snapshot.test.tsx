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
import { StoreBaseProvider } from "./helpers/store-context";
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
  IRAQ_REDESIGN_PDP_PROPS,
  IRAQ_REDESIGN_TENANT,
  SLICE_1B_CONTACT_PATCH,
  SLICE_1B_PDP_PATCH,
  SLICE_1C_PDP_PATCH,
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
