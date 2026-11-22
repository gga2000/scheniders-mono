import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * Round 22 (R3-10): Home re-reads every minute. When a re-read failed it kept
 * the last numbers and said nothing, so staff read old numbers as today's.
 */

const dashboard = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("@/hooks/use-dashboard-v2", () => ({ useDashboardV2: () => dashboard.state }));
// The widgets draw the numbers; this test is about the line over them.
vi.mock("@/components/dashboard/seed-automation-toggle", () => ({ SeedAutomationToggle: () => null }));
vi.mock("@/components/merchants/merchant-watchlist-widget", () => ({ MerchantWatchlistWidget: () => null }));
vi.mock("@/components/dashboard/activity-feed", () => ({ ActivityFeed: () => null }));

import CommandCenterPage from "./page";

const READ_AT = Date.parse("2026-11-22T15:42:00Z"); // 18:42 in Baghdad
const draw = (state: Record<string, unknown>) => {
  dashboard.state = { isLoading: false, isFetching: false, refetch: () => {}, data: {}, dataUpdatedAt: READ_AT, ...state };
  return renderToStaticMarkup(createElement(CommandCenterPage));
};

afterEach(() => vi.useRealTimers());

describe("Home after a failed re-read", () => {
  it("says the numbers are from the last read that worked", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-11-22T16:30:00Z"));
    const html = draw({ isError: true, isRefetchError: true, error: new Error("fetch failed") });
    expect(html).toContain("Could not refresh the dashboard. These numbers are from 18:42.");
    expect(html).toContain("Command Center");
  });

  it("says nothing while the reads work", () => {
    expect(draw({ isError: false, error: null })).not.toContain("Could not refresh");
  });
});
