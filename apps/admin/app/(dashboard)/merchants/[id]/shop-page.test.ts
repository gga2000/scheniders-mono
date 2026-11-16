import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoadFailure } from "@/lib/load-failure";

/*
 * Every link to a shop lands on this one page: the pop-up and the side panel
 * are gone. A failed read says what went wrong instead of spinning, and the
 * page's Top Up, Change Plan and Suspend are the working ones (they did
 * nothing on click before).
 */

let query: { data: unknown; isLoading: boolean; isError: boolean; error: unknown; isFetching: boolean; refetch: () => void };
vi.mock("@/hooks/use-merchant-detail", () => ({
  useMerchantDetail: () => query,
  useMerchantRecentOrders: () => ({ data: { orders: [] }, isLoading: false }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "t1" }),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/merchants/t1",
}));

const { default: ShopPage } = await import("./page");

const render = () =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ShopPage)));

beforeEach(() => {
  query = { data: undefined, isLoading: false, isError: false, error: null, isFetching: false, refetch: () => {} };
});

describe("the shop page, when the shop cannot be read", () => {
  it("says the shop could not be loaded and offers to try again", () => {
    query = { ...query, isError: true, error: new LoadFailure(500, "this shop") };
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not load this shop");
    expect(html).toContain("Try again");
  });

  it("tells a login that may not open the shop so, with nothing to retry", () => {
    query = { ...query, isError: true, error: new LoadFailure(403, "this shop") };
    const html = render();
    expect(html).toContain("Your login cannot open this shop");
    expect(html).not.toContain("Try again");
  });
});

/** A shop as the record read returns it: 5,445 orders in all, 328 of them this month. */
const shop = {
  tenant: {
    id: "t1", display_id: 100012, business_name: "Scheniders Iraq", slug: "scheniders-iraq", plan: "starter",
    status: "active", trial_ends_at: null, branding: null, settings: null, store_config: null,
    contact_email: null, contact_phone: null, address: null, city: "Baghdad", created_at: "2026-04-09T00:00:00Z",
    restrictions: null, staff_health_score: 80, staff_health_parts: { status: 40, wallet: 20, orders: 20 },
  },
  wallet: { balance_iqd: 43_800, threshold_iqd: 5_000, total_charged_iqd: 6_200, total_topped_up_iqd: 50_000 },
  subscription: {
    plan: "starter", status: "active", current_period_start: "2026-11-01T00:00:00Z",
    current_period_end: "2026-12-01T00:00:00Z", pending_plan: null, plan_change_at: null, auto_renew: true,
  },
  transactions: [],
  usage: [
    { year: 2026, month: 10, orders_count: 437, orders_charged: 400, team_members_count: 7 },
    { year: 2026, month: 11, orders_count: 328, orders_charged: 300, team_members_count: 7 },
  ],
  team: [],
  notes: [],
  orderCount: 5_445,
  planLimits: null,
  billingLock: null,
  canForceUnlock: false,
};

describe("the shop page, loaded", () => {
  beforeEach(() => {
    query = { ...query, data: shop };
  });

  it("names the all-time numbers and writes them in full", () => {
    const html = render();
    expect(html).toContain("Orders, all time");
    expect(html).toContain("5,445");
    expect(html).toContain("Wallet charges");
    expect(html).toContain("43,800");
    expect(html).not.toContain("Lifetime");
  });

  it("offers the working money, plan and status actions, once each", () => {
    const html = render();
    for (const action of ["Top Up", "Change Plan", "Suspend"]) {
      expect(html.split(`>${action}<`).length - 1).toBe(1);
    }
  });
});
