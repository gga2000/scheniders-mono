import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { watchFlags, type WatchShop } from "@/lib/delivered-rate-watch";

/*
 * Delivered rate (Fermi B12 item 6; Ali's pick A, 22 Nov): admins see each
 * shop's delivered rate against the median and its stuck parcels, flagged
 * shops first, for a person to check.
 */

const { default: DeliveredRatePage } = await import("./page");

const shop = (n: number, extra: Partial<WatchShop>): WatchShop => ({
  tenant_id: `00000000-0000-4000-8000-00000000000${n}`,
  display_id: 100_110 + n,
  name: `Shop ${n}`,
  plan: "starter",
  shipped: 40,
  delivered: 30,
  rate: 75,
  stuck: 0,
  oldest_stuck_since: null,
  exports: 0,
  prime_linked: false,
  ...extra,
});

function render(shops: WatchShop[], median: number | null = 78, refreshFailed = false): string {
  const client = new QueryClient();
  const withFlags = shops.map((s) => ({ ...s, flags: watchFlags(s, median) }));
  client.setQueryData(["admin", "delivered-rate-watch"], {
    at: "2026-11-22T17:00:00+00:00",
    window_from: "2026-09-09T17:00:00+00:00",
    window_to: "2026-11-08T17:00:00+00:00",
    median_rate: median,
    stuck_after_days: 14,
    min_shipped_for_rate: 20,
    shops: withFlags,
    flagged: withFlags.filter((s) => s.flags.length > 0).length,
    rules: { farBelowMedianShare: 0.7, stuckFlagMin: 5, stuckAfterDays: 14, minShippedForRate: 20 },
  });
  if (refreshFailed) {
    // The 5-minute re-read failed after this read, which was at 20:00 in Baghdad.
    client.getQueryCache().find({ queryKey: ["admin", "delivered-rate-watch"] })?.setState({
      status: "error",
      error: new TypeError("Failed to fetch"),
      dataUpdatedAt: Date.parse("2026-11-22T17:00:00Z"),
    });
  }
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(DeliveredRatePage)));
}

describe("Delivered rate", () => {
  // The database's order: lowest rate first, a shop without a rate last.
  const shops = [
    shop(1, { shipped: 64, delivered: 19, rate: 29.7, stuck: 22 }),
    shop(2, { shipped: 88, delivered: 71, rate: 80.7, stuck: 1 }),
    shop(3, { shipped: 12, delivered: 10, rate: null, stuck: 6 }),
    shop(4, { plan: "internal", shipped: 50, delivered: 10, rate: 20, stuck: 9 }),
  ];

  it("says the days and rules it read, and counts the median, the flagged and the shops with a rate", () => {
    const html = render(shops);
    expect(html).toContain("orders made 9 Sep to 8 Nov");
    expect(html).toContain("in transit over 14 days");
    expect(html).toContain(">78%<");
    expect(html).toContain("Shops with 20+ shipped");
    expect(html).toMatch(/Shops flagged<\/p><p class="[^"]*ink-red[^"]*">2</);
    expect(html).toContain("rate under 70% of the median (under 54.6% now), or 5+");
  });

  it("puts flagged shops first with why, and never flags our own store", () => {
    const html = render(shops);
    const table = html.slice(html.indexOf('data-testid="delivered-rate"'));
    const order = ["Shop 1", "Shop 3", "Shop 2", "Shop 4"].map((n) => table.indexOf(`>${n}<`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(table).toContain("Rate far below median");
    expect(table).toContain("22 stuck");
    expect(table).toContain("6 stuck");
    expect(table).toContain("too few");
    expect(table).toContain('href="/merchants/00000000-0000-4000-8000-000000000001"');
    // The internal store's 20% and 9 stuck are a yardstick, not a flag.
    expect(table).not.toContain("9 stuck");
  });

  it("says when too few shops shipped for a median", () => {
    expect(render([shop(3, { shipped: 12, delivered: 10, rate: null })], null)).toContain("Not enough shops");
  });

  it("keeps the numbers after a failed re-read and says how old they are (round 22, R3-10)", () => {
    expect(render(shops)).not.toContain("Could not refresh");
    const html = render(shops, 78, true);
    expect(html).toMatch(/Could not refresh the delivered rate\. These numbers are from (Sun 22 Nov, )?20:00\./);
    expect(html).toContain(">Shop 1<");
  });
});
