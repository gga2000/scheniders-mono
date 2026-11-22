import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminTenant } from "@/types/admin";

/*
 * Round 23 (UX new 2): Merchants reads its list again when staff come back to
 * the tab. A failed read kept the last shops with nothing to say they may be
 * old, and the count beside the title turned to "—" though the shops were
 * still on screen, as it did when only "load more" failed.
 *
 * Round 24 structure new 6: the line for badges that could not be read was
 * tested in the hook only; nothing checked the page draws it.
 */

type ListRead = Record<string, unknown>;
let list: ListRead;
vi.mock("@/hooks/use-infinite-merchants", () => ({ useInfiniteMerchants: () => list }));
type Badges = import("@/hooks/use-last-actors").LastActors;
let badges: Badges;
vi.mock("@/hooks/use-last-actors", () => ({ useLastActors: () => badges }));
vi.mock("@/hooks/use-admin-auth", () => ({
  useAdminAuth: () => ({ role: "super_admin" }),
  useCan: () => () => true,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/merchants",
}));

const { default: MerchantsPage } = await import("./page");

const SHOP: AdminTenant = {
  id: "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d",
  display_id: 100_095,
  business_name: "Kut Perfumes",
  slug: "kut-perfumes",
  plan: "starter",
  status: "active",
  trial_ends_at: null,
  branding: { logo_url: null, primary_color: "#1E1E1E", secondary_color: "#8b5cf6" },
  settings: { timezone: "Asia/Baghdad", language: "ar", currency: "IQD" },
  contact_email: null,
  contact_phone: null,
  address: null,
  city: "Baghdad",
  created_at: "2026-11-01T09:00:00Z",
  tags: [],
  last_active_at: null,
  fees_30d: 0,
  fees_today: 0,
  order_sparkline: [],
  staff_health_score: 80,
  staff_health_parts: { status: 40, wallet: 20, orders: 20 },
  wallet: { balance_iqd: 20_000, threshold_iqd: 5_000, total_charged_iqd: 0, total_topped_up_iqd: 20_000 },
};

const loaded = {
  data: { pages: [{ merchants: [SHOP], total: 37, page: 1, limit: 50 }], pageParams: [1] },
  // Read at 20:00 in Baghdad.
  dataUpdatedAt: Date.parse("2026-11-22T17:00:00Z"),
  merchants: [SHOP],
  pageIds: [[SHOP.id]],
  total: 37,
  isLoading: false,
  isError: false,
  isRefetchError: false,
  isFetchNextPageError: false,
  error: null,
  isFetching: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  refetch: () => {},
  fetchNextPage: () => {},
};

const render = () =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(MerchantsPage)));

const noBadgeTrouble: Badges = { actors: {}, failed: false, error: null, retrying: false, retry: () => {} };

beforeEach(() => {
  list = { ...loaded };
  badges = noBadgeTrouble;
});

describe("Merchants after a failed read again", () => {
  it("keeps the shops and their count, and says how old the list is", () => {
    list = { ...loaded, isError: true, isRefetchError: true, error: new TypeError("Failed to fetch") };
    const html = render();
    expect(html).toMatch(/Could not refresh the merchants\. This list is from (Sun 22 Nov, )?20:00\./);
    expect(html).toContain("Kut Perfumes");
    expect(html).toMatch(/>37<\/span>/);
  });

  it("keeps the count when only the next page failed, with no refresh line", () => {
    list = { ...loaded, isError: true, isFetchNextPageError: true, error: new TypeError("Failed to fetch") };
    const html = render();
    expect(html).toMatch(/>37<\/span>/);
    expect(html).not.toContain("Could not refresh");
  });

  it("shows no count before the first read lands", () => {
    list = { ...loaded, data: undefined, merchants: [], pageIds: [], total: 0, isLoading: true };
    expect(render()).toMatch(/>—<\/span>/);
  });

  it("says nothing extra after a good read", () => {
    const html = render();
    expect(html).not.toContain("Could not refresh");
    expect(html).toMatch(/>37<\/span>/);
  });
});

describe("Merchants when some badges could not be read", () => {
  it("says so over the cards, with Try again, and keeps the shops", () => {
    badges = { ...noBadgeTrouble, failed: true, error: new TypeError("Failed to fetch") };
    const html = render();
    expect(html).toContain("Could not load who last acted on some shops.");
    expect(html).toContain("Try again");
    expect(html).toContain("Kut Perfumes");
  });

  it("says nothing when every badge was read", () => {
    expect(render()).not.toContain("who last acted");
  });
});
