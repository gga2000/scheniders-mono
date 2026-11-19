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
  },
  walletBalanceIqd: 0,
  subscriptionEndsAt: null,
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
    expect(html).toContain(">paused<");
    expect(html).not.toContain(">limited<");
    expect(html).toContain("Trial ends");
  });

  it("shows no trial end for a paused paying shop", () => {
    const html = render(card("limited", { status_before: "active" }));
    expect(html).toContain(">paused<");
    expect(html).not.toContain("Trial ends");
  });

  it("shows a trial that is not paused as before", () => {
    const html = render(card("trial", {}));
    expect(html).toContain(">trial<");
    expect(html).toContain("Trial ends");
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
