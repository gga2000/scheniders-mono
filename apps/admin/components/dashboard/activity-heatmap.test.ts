// Platform Activity read each calendar day at local midnight and keyed it with
// toISOString(), so in Baghdad every cell showed the day before and today's
// count was never drawn. Staff work in Baghdad, so the test runs there too.
process.env.TZ = "Asia/Baghdad";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
    expect(fills.at(-1)).toBe("#16a34a");
    expect(fills[1]).toBe("#bbf7d0");
    expect(fills.filter((f) => f !== "var(--card-border, #e5e7eb)")).toHaveLength(2);
  });

  it("scales the year to the tile instead of a fixed width", () => {
    const html = renderToStaticMarkup(createElement(ActivityHeatmap, { days: yearEnding({}) }));
    expect(html).toMatch(/<svg[^>]*viewBox="0 0 \d+ \d+"[^>]*width="100%"/);
  });
});
