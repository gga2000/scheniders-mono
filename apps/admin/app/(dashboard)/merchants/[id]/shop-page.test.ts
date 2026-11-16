import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadFailure } from "@/lib/load-failure";

/*
 * Every link to a shop lands on this one page: the pop-up and the side panel
 * are gone. A failed read says what went wrong instead of spinning, and the
 * page offers Add money, Give free days and More: only what the login may do.
 */

let query: { data: unknown; isLoading: boolean; isError: boolean; error: unknown; isFetching: boolean; refetch: () => void };
vi.mock("@/hooks/use-merchant-detail", () => ({
  useMerchantDetail: () => query,
  useMerchantRecentOrders: () => ({ data: { orders: [] }, isLoading: false }),
}));

let role: "super_admin" | "support_staff" | null = "super_admin";
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ role }),
}));

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "t1" }),
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => search,
  usePathname: () => "/merchants/t1",
}));

const { default: ShopPage } = await import("./page");

const render = (client = new QueryClient()) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(ShopPage)));

beforeEach(() => {
  role = "super_admin";
  search = new URLSearchParams();
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

  it("offers a super admin Add money first, then Give free days and More, once each", () => {
    const html = render();
    const at = ["Add money", "Give free days", "More"].map((action) => {
      expect(html.split(`${action}<`).length - 1).toBe(1);
      return html.indexOf(`${action}<`);
    });
    expect(at).toEqual([...at].sort((a, b) => a - b));
    for (const old of ["Top Up", "Change Plan", "Suspend"]) expect(html).not.toContain(`>${old}<`);
  });

  it("does not show support staff money buttons their login cannot use", () => {
    role = "support_staff";
    const html = render();
    expect(html).not.toContain("Add money<");
    expect(html).not.toContain("Give free days<");
    expect(html).toContain("More<");
  });

  it("says where the shop stands and when the next charge falls", () => {
    const html = render();
    expect(html).toContain('data-testid="shop-status"');
    expect(html).toContain("Paying");
  });
});

describe("the shop page's one timeline (board m5)", () => {
  beforeEach(() => {
    query = { ...query, data: shop };
  });

  it("has one Timeline tab where Billing, Notes and Audit were", () => {
    const html = render();
    expect(html).toContain(">Timeline<");
    for (const gone of ["Billing", "Notes", "Audit"]) expect(html).not.toContain(`>${gone}<`);
  });

  it("opens an old Billing link on the Timeline, with the note box", () => {
    search = new URLSearchParams("tab=Billing");
    const html = render();
    expect(html).toContain("Add a note");
    expect(html).toContain("Loading the timeline");
  });

  it("lists money with the wallet after and a day's order fees in one line", () => {
    search = new URLSearchParams("tab=Timeline");
    const client = new QueryClient();
    client.setQueryData(["admin", "merchant", "t1", "timeline"], {
      pageParams: [null],
      pages: [
        {
          nextBefore: null,
          entries: [
            { id: "log-1", kind: "change", at: "2026-11-16T12:00:00Z", title: "Gave 7 free trial days", detail: "Asked on the phone", who: "Ali", amount: null, walletAfter: null },
            { id: "wallet-a", kind: "money", at: "2026-11-16T11:00:00Z", title: "Order fee", detail: null, who: "Automatic", amount: -55, walletAfter: 945, orderFee: true },
            { id: "wallet-b", kind: "money", at: "2026-11-16T10:00:00Z", title: "Order fee", detail: null, who: "Automatic", amount: -55, walletAfter: 1000, orderFee: true },
          ],
        },
      ],
    });
    const html = render(client);
    expect(html).toContain("Gave 7 free trial days");
    expect(html).toContain("Ali");
    expect(html).toContain("Order fees");
    expect(html).toContain("2 orders");
    expect(html).toContain("\u2212110 IQD");
    expect(html).toContain("wallet 945");
    expect(html).not.toContain(">Order fee<");
    expect(html).not.toContain("Show older");
  });
});

describe("the Usage and Team tabs, in plain words", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T09:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts this month's orders against what the plan allows, and never calls a count money", () => {
    search = new URLSearchParams("tab=Usage");
    query = {
      ...query,
      data: {
        ...shop,
        planLimits: { plan: "starter", max_orders_per_month: 500, max_team_members: 3, base_price_iqd: 9000, order_price_iqd: 55, overage_price_iqd: 0, features: {} },
      },
    };
    const html = render();
    expect(html).toContain("Orders counted this month");
    expect(html).toContain(" of 500 the plan allows");
    expect(html).toContain("328");
    expect(html).toContain("Oct 2026");
    expect(html).not.toContain("billed");
    expect(html).not.toMatch(/Charged/);
  });

  it("lists the team owner first, with the role and since when in words", () => {
    search = new URLSearchParams("tab=Team");
    const member = (id: string, role: string, name: string, joined: string | null) => ({
      id, user_id: id, role, status: "active", invited_at: "2026-11-01T09:00:00Z", joined_at: joined,
      user_profiles: { email: `${id}@shop.iq`, display_name: name, avatar_url: null },
    });
    query = {
      ...query,
      data: { ...shop, team: [member("e1", "employee", "Sara Ali", null), member("o1", "owner", "Karim", "2026-11-02T09:00:00Z")] },
    };
    const html = render();
    expect(html).toContain("2 active members");
    expect(html.indexOf("Karim")).toBeLessThan(html.indexOf("Sara Ali"));
    expect(html).toContain("Owner");
    expect(html).toContain("Staff");
    expect(html).toContain("Joined Mon 2 Nov");
    expect(html).toContain("Added Sun 1 Nov, not signed in yet");
  });
});
