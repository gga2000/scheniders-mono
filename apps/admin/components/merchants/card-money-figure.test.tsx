import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardMoneyFigure } from "./card-money-figure";

/*
 * Round 17 (Craft new 2): the card cut "250,000 IQD" to "250,00…". A money
 * figure on the card is never cut: it shrinks to fit (lib/figure-fit.ts), its
 * unit may go under it, and the whole figure is on its hover title.
 * Seen live after #1491: the columns had been made size containers, which
 * turned off their subgrid, and the line under each figure (the city, "327
 * orders · Active 11 h ago") got no height. The figure is its own container.
 */

/** Every .tsx file under `dir`, tests and node_modules aside. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(path);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [path] : [];
  });
}

describe("the card's money figure", () => {
  it("draws the whole figure, never cut, with the whole figure on its title", () => {
    const html = renderToStaticMarkup(createElement(CardMoneyFigure, { value: 1250000 }));
    expect(html).toContain(">1,250,000</span>");
    expect(html).toContain('title="1,250,000 IQD"');
    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain("flex-wrap");
    expect(html).toMatch(/<p class="@container /);
    expect(html).not.toContain("truncate");
    expect(html).toMatch(/font-size:clamp\(0\.8125rem, [\d.]+cqi, 1\.125rem\)/);
  });

  it("is what the card uses for Balance and Our fees, in columns that stay subgrids, and Today never cuts", () => {
    const card = readFileSync(join(__dirname, "merchant-card.tsx"), "utf8");
    expect(card).toContain("<CardMoneyFigure value={balance} />");
    expect(card).toContain("<CardMoneyFigure value={fees30d} />");
    expect(card.match(/"min-w-0 row-span-3 grid grid-rows-subgrid/g)).toHaveLength(2);
    // Every other money figure on the card: no cut line around it.
    for (const at of [...card.matchAll(/formatCount\(/g)].map((m) => m.index ?? 0)) {
      const tag = card.slice(0, at).match(/<(\w+)\s[^<>]*>[^<>]*$/);
      expect(tag?.[0] ?? "").not.toContain("truncate");
    }
  });

  it("never makes a subgrid a size container anywhere in the console, which would turn the subgrid off", () => {
    const root = join(__dirname, "..", "..");
    const both = sources(join(root, "components"))
      .concat(sources(join(root, "app")))
      .filter((file) => /className="[^"]*(@container[^"]*grid-rows-subgrid|grid-rows-subgrid[^"]*@container)/.test(readFileSync(file, "utf8")));
    expect(both).toEqual([]);
  });
});
