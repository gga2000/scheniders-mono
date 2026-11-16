// Six Home tiles named no window, so "Top Merchants" or "Peak Hours" could be
// read as today, this month or all time. Each now says which days it counts.
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActivityHeatmap } from "./activity-heatmap";
import { FulfillmentFunnel } from "./fulfillment-funnel";
import { PeakHours } from "./peak-hours";
import { TimeToFirstOrder } from "./time-to-first-order";
import { TopMerchants } from "./top-merchants";
import { TopUpPatterns } from "./topup-patterns";

const heading = <P extends object>(tile: FunctionComponent<P>, props: P) =>
  /<h3[^>]*>([^<]*)<\/h3>/.exec(renderToStaticMarkup(createElement(tile, props)))?.[1]?.trim();

describe("Home tiles name their window", () => {
  it.each([
    ["Top Merchants, last 90 days", heading(TopMerchants, { merchants: undefined })],
    ["Fulfillment Funnel, last 90 days", heading(FulfillmentFunnel, { funnel: undefined })],
    ["Peak Hours, last 90 days", heading(PeakHours, { cells: undefined })],
    ["Top-Up Patterns, last 90 days", heading(TopUpPatterns, { patterns: undefined })],
    ["Platform Activity, last 12 months", heading(ActivityHeatmap, { days: undefined })],
    ["Time to First Order, every shop", heading(TimeToFirstOrder, { buckets: undefined })],
  ])("%s", (want, got) => {
    expect(got).toBe(want);
  });
});

describe("Top Merchants", () => {
  it("ranks with numbers and an icon, never emoji", () => {
    const html = renderToStaticMarkup(
      createElement(TopMerchants, {
        merchants: [1, 2, 3, 4].map((n) => ({
          tenantId: `t${n}`,
          businessName: `Shop ${n}`,
          primaryColor: "#1E1E1E",
          orderCount: 10 * n,
          revenue: 1000 * n,
          sparkline: [0, 0, 0, 0, 0, 0, n],
        })),
      }),
    );
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(html).toContain("<svg");
  });
});
