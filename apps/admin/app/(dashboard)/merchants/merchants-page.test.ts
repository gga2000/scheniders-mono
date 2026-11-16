import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantListRow } from "@/lib/merchant-list";

/*
 * Merchants is one table (board s1): tabs with their counts, a search and a
 * sort. Grid, sheet, map and kanban are gone, and so are the tools around them.
 */

const karrada: MerchantListRow = {
  id: "s1",
  display_id: 100041,
  business_name: "موبايلات الكرادة",
  slug: "karrada",
  city: "Baghdad",
  contact_phone: "0770 000 3391",
  status: "active",
  plan: "starter",
  trial_ends_at: null,
  restrictions: null,
  wallet_iqd: 2175,
  subscription: { status: "active", current_period_end: "2026-12-01T00:00:00Z", auto_renew: true },
  billing_lock: { reason: "unpaid", since: "2026-11-13T08:00:00Z" },
  orders_30d: 19,
  last_order_at: null,
};

let list: Record<string, unknown>;
let counts: { data?: Record<string, number> };
vi.mock("@/hooks/use-merchant-list", () => ({
  LIST_PAGE_SIZE: 50,
  useMerchantList: () => list,
  useMerchantTabCounts: () => counts,
}));

let role: "super_admin" | "support_staff" | null = "super_admin";
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ role }) }));

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => search,
}));

const { default: MerchantsPage } = await import("./page");
const render = () => renderToStaticMarkup(createElement(MerchantsPage));

beforeEach(() => {
  role = "super_admin";
  search = new URLSearchParams();
  list = { merchants: [karrada], total: 8, isLoading: false, isError: false, hasNextPage: true, isFetchingNextPage: false };
  counts = { data: { all: 8, trial: 3, paying: 3, stopped: 0, cancelled: 0, internal: 1 } };
});

describe("the Merchants page", () => {
  it("shows one table, with no view switch, density, columns, alerts or compare", () => {
    const html = render();
    expect(html).toContain("<table");
    for (const gone of ["Cards", "Sheet", "Pipeline", "Compare", "Smart alerts", "Advanced filters", "selected"]) {
      expect(html).not.toContain(gone);
    }
  });

  it("carries the count on each tab and leaves out a tab with no shops", () => {
    const html = render();
    expect(html).toMatch(/All<span[^>]*>8<\/span>/);
    expect(html).toMatch(/Trial<span[^>]*>3<\/span>/);
    expect(html).toMatch(/Internal<span[^>]*>1<\/span>/);
    expect(html).not.toContain("On hold");
    expect(html).not.toContain("Cancelled<");
  });

  it("says why a shop stands where it does, in its row", () => {
    const html = render();
    expect(html).toContain("Locked");
    expect(html).toContain("not paid since Fri 13 Nov");
    expect(html).toContain("#100041");
    expect(html).toContain("2,175");
    expect(html).toContain("None yet");
  });

  it("says how many shops are shown and offers the next 50", () => {
    const html = render();
    expect(html).toContain("1 of 8 shops shown.");
    expect(html).toContain("Show 50 more");
  });

  it("offers export only to a login that may export", () => {
    expect(render()).toContain("Export");
    role = null;
    expect(render()).not.toContain("Export");
  });

  it("says plainly when a search finds nothing, and offers every shop", () => {
    search = new URLSearchParams("q=zzz");
    list = { ...list, merchants: [], total: 0, hasNextPage: false };
    const html = render();
    expect(html).toContain("No shop matches &quot;zzz&quot;");
    expect(html).toContain("Show every shop");
  });
});
