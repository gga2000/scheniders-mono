import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SupportShopCard as ShopCard } from "@/lib/support";

/*
 * Round 12: the card read the raw status, so a paused trial showed "limited"
 * and no trial end, while "Needs us" listed the same shop as "Trial ends soon".
 */

vi.mock("@/components/support/support-shop-check", () => ({ SupportShopCheck: () => null }));
vi.mock("@/components/support/support-call-list", () => ({ SupportCallList: () => null }));
vi.mock("@/components/support/support-view-button", () => ({ SupportViewButton: () => null }));
vi.mock("@/hooks/use-live-tick", () => ({ useLiveTick: () => Date.parse("2026-11-16T09:00:00Z") }));
vi.mock("@/hooks/use-support-cases", () => ({ useSupportTakeShop: () => ({ mutate: () => {}, isPending: false }) }));

const { SupportShopCard } = await import("./support-shop-card");

const card = (status: string, restrictions: unknown, plan = "starter"): ShopCard => ({
  tenant: {
    id: "2b0f8f8e-6a43-4a34-9a5e-4d8a3c1f0a11",
    business_name: "Noor",
    display_id: 100123,
    plan,
    status,
    restrictions,
    city: null,
    contact_phone: null,
    trial_ends_at: "2026-11-20T09:00:00Z",
    created_at: "2026-11-13T09:00:00Z",
    is_demo: false,
  },
  walletBalanceIqd: 0,
  subscription: null,
  ordersLast7Days: 0,
  ordersTotal: 0,
  teamSize: 1,
  pinnedNotes: [],
  earlierCases: [],
  owner: null,
  calls: [],
});

const render = (shop: ShopCard) => renderToStaticMarkup(createElement(SupportShopCard, { shop, caseId: "case-1" }));

describe("SupportShopCard", () => {
  it("shows a paused trial as paused, with its trial end", () => {
    const html = render(card("limited", { status_before: "trial" }));
    expect(html).toContain(">Paused<");
    expect(html).not.toContain(">limited<");
    expect(html).toContain("Trial ends");
  });

  it("shows no trial end for a paused paying shop", () => {
    const html = render(card("limited", { status_before: "active" }));
    expect(html).toContain(">Paused<");
    expect(html).not.toContain("Trial ends");
  });

  it("shows a trial that is not paused as before", () => {
    const html = render(card("trial", {}));
    expect(html).toContain(">Trial<");
    expect(html).toContain("Trial ends");
  });

  // Round 19: the card wrote its own status words beside the one status map.
  it.each([
    ["active", "Active"],
    ["suspended", "On hold"],
    ["cancelled", "Cancelled"],
  ])("names the %s status %s, as the Merchants page does", (status, word) => {
    const html = render(card(status, {}));
    expect(html).toContain(`>${word}<`);
    expect(html).not.toContain("capitalize");
  });

  it.each([
    ["starter", "Start"],
    ["growth", "Team"],
    ["professional", "Business"],
    ["enterprise", "Custom"],
    ["internal", "Internal (no billing)"],
  ])("names the %s plan %s, never the stored key", (plan, name) => {
    const html = render(card("active", {}, plan));
    expect(html).toContain(`>${name}<`);
  });
});

/*
 * Round 21 (data new 2): the "Renews" row gave the end of any subscription.
 * An unpaid ended trial read "Renews Tue 17 Nov", the internal shop would read
 * "Renews Sat 9 May", and a shop with renewal off "Renews" a day that locks it.
 * The card's clock is Mon 16 Nov 09:00Z.
 */
describe("the card's month end", () => {
  type Sub = NonNullable<ShopCard["subscription"]>;
  const withSub = (status: string, sub: Partial<Sub>, plan = "starter", tenant: Partial<ShopCard["tenant"]> = {}) => {
    const shop = card(status, {}, plan);
    return {
      ...shop,
      tenant: { ...shop.tenant, ...tenant },
      subscription: { status: "active", plan, auto_renew: true, current_period_end: "2026-11-28T09:00:00Z", ...sub },
    };
  };
  const monthRow = (shop: ShopCard) => {
    const html = render(shop);
    const row = /<dt[^>]*>(Renews|Ends|Ended)<\/dt><dd[^>]*>([^<]*)<\/dd>/.exec(html);
    return row ? `${row[1]} ${row[2]}` : null;
  };

  it("says Renews for a month that renews", () => {
    expect(monthRow(withSub("active", {}))).toBe("Renews Sat 28 Nov");
    expect(monthRow(withSub("trial", { status: "trialing", current_period_end: "2026-11-20T09:00:00Z" }))).toBe("Renews Fri 20 Nov");
  });

  it("says an unpaid ended trial is unpaid, never Renews", () => {
    const shop = withSub("trial", { status: "past_due", current_period_end: "2026-11-15T09:00:00Z" });
    expect(monthRow(shop)).toBe("Ended Sun 15 Nov, unpaid");
  });

  it("says a month with renewal off is not renewed", () => {
    expect(monthRow(withSub("active", { auto_renew: false }))).toBe("Ends Sat 28 Nov, not renewed (renewal off)");
  });

  it("gives a stopped shop's month its date, and says it was not charged once it has passed", () => {
    expect(monthRow(withSub("suspended", {}))).toBe("Ends Sat 28 Nov");
    expect(monthRow(withSub("limited", { current_period_end: "2026-11-14T09:00:00Z" }))).toBe(
      "Ended Sat 14 Nov, not charged while paused",
    );
  });

  it("shows no month for the internal plan or an ended subscription", () => {
    expect(monthRow(withSub("active", {}, "internal"))).toBeNull();
    expect(monthRow(withSub("active", { plan: "internal" }))).toBeNull();
    expect(monthRow(withSub("cancelled", { status: "cancelled" }))).toBeNull();
    expect(monthRow(card("active", {}))).toBeNull();
  });

  it("says the demo store renews at no charge, whatever its switch says", () => {
    expect(monthRow(withSub("active", { auto_renew: false }, "starter", { is_demo: true }))).toBe(
      "Renews Sat 28 Nov, never charged (demo store)",
    );
  });
});
