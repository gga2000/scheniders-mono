// Platform Activity read each calendar day at local midnight and keyed it with
// toISOString(), so in Baghdad every cell showed the day before and today's
// count was never drawn. Staff work in Baghdad, so the test runs there too.
process.env.TZ = "Asia/Baghdad";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ActivityHeatmap } from "./activity-heatmap";

const DAY = 86_400_000;
const LAST = Date.UTC(2026, 10, 16); // Monday 16 Nov 2026

const yearEnding = (counts: Record<string, number>) =>
  Array.from({ length: 365 }, (_, i) => {
    const date = new Date(LAST - (364 - i) * DAY).toISOString().slice(0, 10);
    return { date, count: counts[date] ?? 0 };
  });

const cellFills = (html: string) => [...html.matchAll(/<rect[^>]*fill="([^"]*)"/g)].map((m) => m[1]);

describe("Platform Activity", () => {
  it("draws today's count in the last cell, on its own weekday", () => {
    const html = renderToStaticMarkup(
      createElement(ActivityHeatmap, { days: yearEnding({ "2026-11-16": 8, "2025-11-17": 1 }) }),
    );
    const fills = cellFills(html);
    // 17 Nov 2025 is a Monday: the grid starts on the Sunday before it.
    expect(fills).toHaveLength(1 + 365);
    expect(fills.at(-1)).toBe("var(--grow-4)");
    expect(fills[1]).toBe("var(--grow-1)");
    expect(fills.filter((f) => f !== "var(--card-border, #e5e7eb)")).toHaveLength(2);
  });

  it("scales the year to the tile instead of a fixed width", () => {
    const html = renderToStaticMarkup(createElement(ActivityHeatmap, { days: yearEnding({}) }));
    expect(html).toMatch(/<svg[^>]*viewBox="0 0 \d+ \d+"[^>]*width="100%"/);
  });
});

describe("Platform Activity colours", () => {
  // Each block of app/globals.css up to its closing brace: the light theme, then .dark.
  const css = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");
  const block = (selector: string) => css.slice(css.indexOf(`${selector} {`)).split("}")[0];

  it("climb from quiet to busy in both themes, so dark mode does not read backwards", () => {
    for (const theme of [":root", ".dark"]) {
      for (const level of [1, 2, 3, 4]) expect(block(theme), `${theme} --grow-${level}`).toContain(`--grow-${level}:`);
    }
    // Dark mode: the quiet greens are see-through over the card, the busiest is solid and bright.
    expect(block(".dark")).toMatch(/--grow-1: rgba\(34, 197, 94, 0\.2\)/);
    expect(block(".dark")).toMatch(/--grow-4: #4ade80/);
  });
});
