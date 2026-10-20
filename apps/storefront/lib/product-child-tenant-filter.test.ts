import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// F-002: product child tables (images, variants, bundle items, related
// products, order bumps, tier prices) reference products(id) only, not
// (tenant_id, id). A public read keyed on product_id alone would serve a row
// some other tenant attached to this tenant's product. Every storefront read of
// those tables must therefore filter tenant_id as well. The DB refuses such
// rows since 20261020150100_product_child_tables_tenant_guard; this keeps the
// read side honest for any new query.
//
// Source-level on purpose, like product-status-filter.test.ts: the regression
// is "someone adds a new child-table query and forgets the tenant filter".

const ROOT = join(__dirname, "..");

const CHILD_TABLES = [
  "product_images",
  "product_variants",
  "product_bundle_items",
  "product_related",
  "product_order_bumps",
  "product_tiered_pricing",
] as const;

function queryChains(source: string): { table: string; body: string }[] {
  const starts = [...source.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)];
  return starts.map((match, index) => {
    const from = match.index ?? 0;
    const to = index + 1 < starts.length ? (starts[index + 1].index ?? source.length) : source.length;
    return { table: match[1], body: source.slice(from, to) };
  });
}

describe("storefront product child reads are tenant-scoped", () => {
  const source = readFileSync(join(ROOT, "lib/queries.ts"), "utf8");
  const chains = queryChains(source).filter((c) =>
    (CHILD_TABLES as readonly string[]).includes(c.table),
  );

  it("covers the image and variant reads the product page renders", () => {
    const tables = chains.map((c) => c.table);
    expect(tables).toContain("product_images");
    expect(tables).toContain("product_variants");
  });

  it("every child-table chain filters tenant_id", () => {
    for (const chain of chains) {
      expect(
        /\.eq\(\s*"tenant_id"\s*,/.test(chain.body),
        `a .from("${chain.table}") chain does not filter tenant_id:\n${chain.body.slice(0, 400)}`,
      ).toBe(true);
    }
  });

  it("the product page passes the tenant to the image and variant reads", () => {
    const page = readFileSync(join(ROOT, "app/s/[tenant]/products/[slug]/page.tsx"), "utf8");
    expect(page).toMatch(/getProductImages\(\s*tenant\.id\s*,\s*product\.id\s*\)/);
    expect(page).toMatch(/getProductVariants\(\s*tenant\.id\s*,\s*product\.id\s*\)/);
  });
});
