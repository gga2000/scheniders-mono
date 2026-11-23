import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantsStats } from "@/hooks/use-merchants-stats";

/*
 * "MRR" here was the plan prices of the active shops, "MRR" on the map was our
 * fees from a city, and "MRR" on the shop pop-up was one plan price; "ARR" was
 * twelve times the first. Each number now says what it is.
 */

const stats: MerchantsStats = {
  total: 2,
  total_wallet_iqd: 43_800,
  plan_prices_iqd: 25_000,
  fees_30d_iqd: 11_055,
  status: { trial: 1, active: 1, limited: 0, suspended: 0, cancelled: 0 },
  on_trial: 1,
  buckets: { trials_today: 0, trials_expired: 0, suspended: 0, cancelled: 0, low_wallet: 1, attention: 1 },
  governorates: { BGD: 2 },
  unknown_city: 0,
};
/** The numbers read as the strip sees it; a test swaps in a failed read. */
let read: Record<string, unknown> = { data: stats };
vi.mock("@/hooks/use-merchants-stats", () => ({ useMerchantsStats: () => read }));

const { MerchantsRollupStrip } = await import("./merchants-rollup-strip");

describe("MerchantsRollupStrip", () => {
  const html = renderToStaticMarkup(createElement(MerchantsRollupStrip));

  it("names the plan prices of active shops and our fees for what they are", () => {
    expect(html).toContain("Plan prices");
    expect(html).toContain("active shops, list price a month");
    expect(html).toContain("not cancelled or on hold");
    expect(html).toMatch(/25,000<span[^>]*>IQD/);
    expect(html).toContain("Our fees");
    expect(html).toContain("last 30 days");
    expect(html).toMatch(/11,055<span[^>]*>IQD/);
  });

  it("drops MRR, ARR and the year figure", () => {
    for (const word of ["MRR", "ARR", "/yr", "/mo", "Usage Charges", "300K"]) expect(html).not.toContain(word);
  });
});

/*
 * Round 25 (R3-10): a failed refresh kept the money tiles with nothing to say
 * they were old, and a first read that failed left dashes that looked like
 * numbers on their way. The strip now says so, as Home and the map do.
 */
describe("MerchantsRollupStrip after a failed read", () => {
  const settled = { isFetching: false, refetch: () => Promise.resolve(), error: new Error("fetch failed") };
  afterEach(() => {
    read = { data: stats };
    vi.useRealTimers();
  });

  it("keeps the tiles and says a refresh failed and how old they are", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-23T09:00:00Z")); // 12:00 in Baghdad
    read = { ...settled, data: stats, isRefetchError: true, isLoadingError: false, dataUpdatedAt: Date.parse("2026-11-23T08:42:00Z") };
    const html = renderToStaticMarkup(createElement(MerchantsRollupStrip));
    expect(html).toContain("Could not refresh the money numbers. These numbers are from 11:42.");
    expect(html).toMatch(/25,000<span[^>]*>IQD/);
  });

  it("says the numbers could not load when they were never read", () => {
    read = { ...settled, data: undefined, isRefetchError: false, isLoadingError: true, dataUpdatedAt: 0 };
    const html = renderToStaticMarkup(createElement(MerchantsRollupStrip));
    expect(html).toContain("Could not load the money numbers.");
    expect(html).not.toContain("Could not refresh");
  });

  it("draws no line over numbers that are current", () => {
    expect(renderToStaticMarkup(createElement(MerchantsRollupStrip))).not.toContain("Could not");
  });
});
