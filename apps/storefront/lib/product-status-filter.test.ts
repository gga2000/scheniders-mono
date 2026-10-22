import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A product carries three independent "don't show this" switches: is_archived,
// is_visible, and status ("draft" | "active" | "archived"). The product editor
// exposes status as a Draft/Active/Archived dropdown, so a merchant who picks
// Draft expects the product gone from the storefront. Every public read that
// filters is_visible must therefore filter status too — otherwise Draft is a
// lie and the product stays live, and buyable.
//
// This is a source-level guard rather than a query mock on purpose: the bug it
// prevents is "someone adds a NEW product query and forgets the filter", which
// no amount of testing the existing three queries would catch.

const ROOT = join(__dirname, "..");

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

/**
 * Split a source file into PostgREST query chains. A chain starts at `.from("x")`
 * and runs until the next `.from(` or end of file — good enough, because a chain
 * is always written as one uninterrupted fluent expression.
 */
function queryChains(source: string): { table: string; body: string }[] {
  const chains: { table: string; body: string }[] = [];
  const starts = [...source.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)];
  starts.forEach((match, index) => {
    const from = match.index ?? 0;
    const to = index + 1 < starts.length ? (starts[index + 1].index ?? source.length) : source.length;
    chains.push({ table: match[1], body: source.slice(from, to) });
  });
  return chains;
}

describe("public product reads respect products.status", () => {
  const source = read("lib/queries.ts");

  it("has the product query chains this test is meant to cover", () => {
    const tables = queryChains(source).map((c) => c.table);
    expect(tables).toContain("products");
    expect(tables).toContain("product_categories");
  });

  it.each(["products", "product_categories"])(
    "every %s chain that filters is_visible also filters status",
    (table) => {
      const chains = queryChains(source).filter((c) => c.table === table);
      const guarded = chains.filter((c) => /\.eq\(\s*"(?:products\.)?is_visible"/.test(c.body));

      expect(guarded.length).toBeGreaterThan(0);
      for (const chain of guarded) {
        expect(
          /\.eq\(\s*"(?:products\.)?status"\s*,\s*"active"\s*\)/.test(chain.body),
          `a .from("${table}") chain filters is_visible but not status:\n${chain.body.slice(0, 400)}`,
        ).toBe(true);
      }
    },
  );

  it("does not force the filter onto non-product tables", () => {
    // categories has its own is_visible and no status column of this shape;
    // the guard above must not have been applied there by mistake.
    const categories = queryChains(source).filter((c) => c.table === "categories");
    expect(categories.length).toBeGreaterThan(0);
    for (const chain of categories) {
      expect(/\.eq\(\s*"status"\s*,\s*"active"\s*\)/.test(chain.body)).toBe(false);
    }
  });
});

describe("checkout refuses non-active products", () => {
  const source = read("app/actions/checkout.ts");

  it("selects status alongside the other orderability flags", () => {
    const select = source.match(/\.select\("id, tenant_id, name, short_name[^"]*"\)/);
    expect(select?.[0]).toContain("status");
  });

  it("rejects any product whose status is not active", () => {
    // The orderability rule lives in lib/catalogue-line, shared with the
    // phone capture; the checkout must decide every line through it.
    expect(source).toMatch(/catalogueUnitPrice\(/);
    expect(read("lib/catalogue-line.ts")).toMatch(/product\.status\s*!==\s*"active"/);
  });
});
