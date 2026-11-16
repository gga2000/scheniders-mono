import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoadFailure } from "@/lib/load-failure";

/*
 * The shop pop-up and the side panel drew their loading skeleton whenever the
 * shop was not there, so a failed read looked like a load that never ends,
 * and the panel had no close button until the shop arrived. Both now say
 * what went wrong, and the panel can be closed in every state.
 */

let query: { data: unknown; isError: boolean; error: unknown; isFetching: boolean; refetch: () => void };
vi.mock("@/hooks/use-merchant-detail", () => ({
  useMerchantDetail: () => query,
  useMerchantRecentOrders: () => ({ data: { orders: [] }, isLoading: false }),
}));

let viewMode: "dialog" | "panel";
vi.mock("@/store/use-admin-store", () => ({
  useAdminStore: () => ({
    activeDetailId: "t1",
    detailViewMode: viewMode,
    setActiveDetailId: () => {},
    setDetailViewMode: () => {},
  }),
}));

// The dialog's portal renders nothing on the server; its content is what is under test.
vi.mock("@scheniders/ui/dialog", () => {
  const plain = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return { Dialog: plain, DialogContent: plain, DialogTitle: ({ children }: { children?: ReactNode }) => createElement("h2", null, children) };
});

const { MerchantDetailDialog } = await import("./merchant-detail-dialog");
const { MerchantDetailPanel } = await import("./merchant-detail-panel");

const render = (component: () => ReactNode) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(component)));

const views = [
  ["pop-up", "dialog", MerchantDetailDialog],
  ["side panel", "panel", MerchantDetailPanel],
] as const;

beforeEach(() => {
  query = { data: undefined, isError: false, error: null, isFetching: false, refetch: () => {} };
});

describe.each(views)("the shop %s", (_name, mode, component) => {
  beforeEach(() => {
    viewMode = mode;
  });

  it("says the shop could not be loaded and offers to try again", () => {
    query = { ...query, isError: true, error: new LoadFailure(500, "this shop") };
    const html = render(component);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Could not load this shop");
    expect(html).toContain("Try again");
    expect(html).not.toContain("animate-pulse");
  });

  it("tells a login that may not open the shop so, with nothing to retry", () => {
    query = { ...query, isError: true, error: new LoadFailure(403, "this shop") };
    const html = render(component);
    expect(html).toContain("Your login cannot open this shop");
    expect(html).not.toContain("Try again");
  });

  it("says a shop that is gone could not be found", () => {
    query = { ...query, isError: true, error: new LoadFailure(404, "this shop") };
    const html = render(component);
    expect(html).toContain("Could not find this shop");
    expect(html).not.toContain("Try again");
  });

  it("shows the skeleton only while the shop is loading", () => {
    const html = render(component);
    expect(html).toContain("animate-pulse");
    expect(html).not.toContain('role="alert"');
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

describe.each(views)("the shop %s, loaded", (_name, mode, component) => {
  beforeEach(() => {
    viewMode = mode;
    query = { ...query, data: shop };
  });

  it("names the all-time numbers and draws no month-on-month arrow", () => {
    const html = render(component);
    expect(html).toContain("Orders, all time");
    expect(html).toContain("Wallet charges");
    expect(html).not.toContain("Lifetime");
    // The month still running against a whole month always read as a fall.
    expect(html).not.toMatch(/[▲▼]/);
  });
});

describe("the side panel", () => {
  beforeEach(() => {
    viewMode = "panel";
  });

  it("can be closed while the shop loads and after the read failed", () => {
    expect(render(MerchantDetailPanel)).toContain('aria-label="Close panel"');
    query = { ...query, isError: true, error: new LoadFailure(500, "this shop") };
    expect(render(MerchantDetailPanel)).toContain('aria-label="Close panel"');
  });
});
