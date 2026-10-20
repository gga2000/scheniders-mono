import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Categories carry four independent switches, and the storefront had been
// honouring only one of them:
//
//   status     — published / archived lifecycle
//   is_visible — the merchant's show/hide toggle
//   scope      — internal (staff only) / website / both
//
// getCategoryBySlug filtered on none of them, so an archived category, or one
// meant purely for stock organisation, still rendered a real page to anyone who
// typed its URL. listCategories honoured is_visible alone, so an archived
// category could still appear in navigation.
//
// This is a source-level guard rather than a query mock on purpose: the failure
// mode is "someone adds another category read and forgets", which testing the
// current two would never catch.

const ROOT = join(__dirname, "..");
const source = readFileSync(join(ROOT, "lib/queries.ts"), "utf8");

/** Split the file into PostgREST chains, one per `.from("table")`. */
function queryChains(src: string): { table: string; body: string }[] {
  const starts = [...src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)];
  return starts.map((match, i) => ({
    table: match[1],
    body: src.slice(match.index ?? 0, i + 1 < starts.length ? (starts[i + 1].index ?? src.length) : src.length),
  }));
}

const categoryChains = () => queryChains(source).filter((c) => c.table === "categories");

describe("public category reads are gated on all three switches", () => {
  it("covers every categories chain in the file", () => {
    // Two today: listCategories and getCategoryBySlug. If this number changes,
    // the new chain needs the same guards — that is the point of the test.
    expect(categoryChains().length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ["scope", /\.in\(\s*"scope"\s*,\s*\[\s*"website"\s*,\s*"both"\s*\]\s*\)/],
    ["status", /\.eq\(\s*"status"\s*,\s*"published"\s*\)/],
    ["is_visible", /\.eq\(\s*"is_visible"\s*,\s*true\s*\)/],
  ])("every categories chain filters %s", (label, pattern) => {
    const chains = categoryChains();
    expect(chains.length).toBeGreaterThan(0);
    for (const chain of chains) {
      expect(
        pattern.test(chain.body),
        `a .from("categories") chain does not filter ${label}:\n${chain.body.slice(0, 400)}`,
      ).toBe(true);
    }
  });

  it("never exposes an internal-only category to the storefront", () => {
    // "internal" must not appear in any allowed-scope list.
    for (const chain of categoryChains()) {
      const allowed = chain.body.match(/\.in\(\s*"scope"\s*,\s*\[([^\]]*)\]/)?.[1] ?? "";
      expect(allowed).not.toContain("internal");
    }
  });
});
