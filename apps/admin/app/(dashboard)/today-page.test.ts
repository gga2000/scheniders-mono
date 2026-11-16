import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandledRow, TodayResponse, TodayShop } from "@/lib/today";

/*
 * Today is the console's home page (board h1): the shops that need someone,
 * grouped by why, four numbers above them, and one next step on each row.
 */

const base = {
  display_id: 100095,
  business_name: "متجر تجريبي Claude",
  status: "trial",
  plan: "starter",
  contact_phone: "07700000000",
  wallet_iqd: 0,
};
const receipt = (n: number): TodayShop => ({
  ...base,
  group: "money",
  tenant_id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  display_id: 100100 + n,
  at: "2026-11-16T05:42:00Z",
  receipts: 1,
  amount_iqd: 50000,
});
const trialEnds: TodayShop = {
  ...base,
  group: "lock_soon",
  tenant_id: "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d",
  at: "2026-11-17T03:21:00Z",
  reason: "trial_ends",
  price_iqd: 9000,
  short_iqd: 9000,
  nothing_to_renew: false,
};

const done = { tenant_id: trialEnds.tenant_id, display_id: 100095, business_name: "متجر تجريبي Claude", who: "Karrar" };
const handled: HandledRow[] = [
  { ...done, kind: "reply", at: "2026-11-16T07:20:00Z", case_id: "8d4e6d9b-eaf5-42f9-abd1-a8afee593d9d", who: "Noor" },
  { ...done, kind: "receipt", at: "2026-11-16T06:40:00Z", outcome: "approved", amount_iqd: 15000, credited_iqd: 15000, reject_reason: null },
];

let today: { data?: TodayResponse; isLoading: boolean; dataUpdatedAt: number; error?: unknown };
vi.mock("@/hooks/use-today", () => ({ useToday: () => today }));
vi.mock("@/hooks/use-merchant-list", () => ({
  useMerchantTabCounts: () => ({
    data: { all: 2, locked: 0, trial: 1, paying: 0, stopped: 0, cancelled: 0, internal: 1 },
  }),
}));
vi.mock("@/hooks/use-leads", () => ({ useLeadsWithNoOwner: () => ({ data: 28 }) }));

let role: "super_admin" | "support_staff" | null = "super_admin";
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ role }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const { default: TodayPage } = await import("./page");
const render = () => renderToStaticMarkup(createElement(TodayPage));
const numbers = { orders_today: 4, orders_yesterday_by_now: 5, fees_month: 23870 };

beforeEach(() => {
  role = "super_admin";
  today = { data: { shops: [receipt(1), trialEnds], numbers, handled }, isLoading: false, dataUpdatedAt: Date.now() };
});

describe("the Today page", () => {
  it("opens on who is waiting, not on charts", () => {
    const html = render();
    expect(html).toContain("Today");
    expect(html).toContain("2 shops are waiting for someone.");
    expect(html).not.toContain("Command Center");
    expect(html).toContain("Money waiting");
    expect(html).toContain("1 receipt to check");
    expect(html).toContain("Will lock within 3 days");
    expect(html).toContain("Trial ends");
    expect(html).not.toContain("Locked shops");
  });

  it("shows four numbers, each naming its window", () => {
    const html = render();
    expect(html).toContain("Shops, now");
    expect(html).toContain("1 trial, 1 internal.");
    expect(html).toContain("Orders today, since midnight");
    expect(html).toContain("5 by this time yesterday");
    expect(html).toMatch(/Our fees, \w{3} so far/);
    expect(html).toContain("23,870 IQD");
    expect(html).toContain("Leads with no owner");
    expect(html).toContain(">28<");
  });

  it("gives money the one filled button, and the owner a WhatsApp link", () => {
    const html = render();
    expect(html.match(/bg-emerald-700/g)).toHaveLength(1);
    expect(html).toContain(">Check receipt<");
    expect(html).toContain('href="https://wa.me/9647700000000"');
    expect(html).toContain("0770 000 0000");
  });

  it("shows five rows a group and offers the rest", () => {
    today = {
      ...today,
      data: { shops: Array.from({ length: 7 }, (_, n) => receipt(n + 1)), numbers, handled },
    };
    const html = render();
    expect(html.match(/>Check receipt</g)).toHaveLength(5);
    expect(html).toContain("Show all 7");
  });

  it("says so when nobody is waiting", () => {
    today = { ...today, data: { shops: [], numbers, handled: [] } };
    const html = render();
    expect(html).toContain("Nobody is waiting.");
    expect(html).toContain("Last checked at");
    expect(html).not.toContain("Handled today");
  });

  it("lists what was handled today under the list, newest first, with the time and who", () => {
    const html = render();
    expect(html).toContain("Handled today");
    expect(html).toContain("2 so far");
    expect(html).toContain("10:20"); // 07:20 UTC in Baghdad
    expect(html).toContain('href="/support?case=8d4e6d9b-eaf5-42f9-abd1-a8afee593d9d"');
    expect(html).toContain("Question answered");
    expect(html).toContain("Receipt approved, 15,000 IQD");
    expect(html.indexOf("Question answered")).toBeLessThan(html.indexOf("Receipt approved"));
    expect(html).toContain(">Karrar<");
    expect(html).toContain(">Noor<");
  });

  it("says it could not load, never that nobody is waiting", () => {
    today = { isLoading: false, dataUpdatedAt: 0, error: new Error("boom") };
    const html = render();
    expect(html).toContain("Could not load who is waiting");
    expect(html).not.toContain("Nobody is waiting.");
  });
});
