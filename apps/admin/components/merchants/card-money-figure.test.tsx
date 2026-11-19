import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CardMoneyFigure } from "./card-money-figure";

/*
 * Round 17 (Craft new 2): the card cut "250,000 IQD" to "250,00…". A money
 * figure on the card is never cut: it shrinks to fit (lib/figure-fit.ts), its
 * unit may go under it, and the whole figure is on its hover title.
 */

describe("the card's money figure", () => {
  it("draws the whole figure, never cut, with the whole figure on its title", () => {
    const html = renderToStaticMarkup(createElement(CardMoneyFigure, { value: 1250000 }));
    expect(html).toContain(">1,250,000</span>");
    expect(html).toContain('title="1,250,000 IQD"');
    expect(html).toContain("whitespace-nowrap");
    expect(html).toContain("flex-wrap");
    expect(html).not.toContain("truncate");
    expect(html).toMatch(/font-size:clamp\(0\.8125rem, [\d.]+cqi, 1\.125rem\)/);
  });

  it("is what the card uses for Balance and Our fees, each in its own container, and Today never cuts", () => {
    const card = readFileSync(join(__dirname, "merchant-card.tsx"), "utf8");
    expect(card).toContain("<CardMoneyFigure value={balance} />");
    expect(card).toContain("<CardMoneyFigure value={fees30d} />");
    expect(card.match(/@container min-w-0 row-span-3 grid grid-rows-subgrid/g)).toHaveLength(2);
    // Every other money figure on the card: no cut line around it.
    for (const at of [...card.matchAll(/formatCount\(/g)].map((m) => m.index ?? 0)) {
      const tag = card.slice(0, at).match(/<(\w+)\s[^<>]*>[^<>]*$/);
      expect(tag?.[0] ?? "").not.toContain("truncate");
    }
  });
});
