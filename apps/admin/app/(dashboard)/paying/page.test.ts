import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { hasPermission } from "@/lib/admin-permissions";
import type { AdminAction, AdminRole } from "@/types/admin";

/*
 * Paying shops (Fermi B12 items 3 and 4). Ali chose one page for everyone,
 * with the staff pay box shown only to the logins that manage staff pay.
 */

let role: AdminRole;
vi.mock("@/hooks/use-admin-auth", () => ({
  useCan: () => (action: AdminAction) => hasPermission(role, action),
}));

const { default: PayingShopsPage } = await import("./page");

const PAYING = {
  at: "2026-11-18T23:30:00+00:00",
  count: 2,
  goals: [],
  shops: [
    {
      tenant_id: "5b0c9a52-7f3e-4c1a-9d2e-1a2b3c4d5e6f",
      display_id: 100_112,
      name: "Kut Perfumes",
      plan: "growth",
      // 10 Dec 23:30 in Baghdad.
      paid_until: "2026-12-10T20:30:00+00:00",
      month_end: "2026-12-10T20:30:00+00:00",
      first_paid_at: "2026-11-10T20:30:00+00:00",
      source: "signup",
    },
    {
      tenant_id: "7c1d0b63-8a4f-4d2b-8e3f-2b3c4d5e6f70",
      display_id: 100_118,
      name: "Baghdad Shoes",
      plan: "starter",
      paid_until: "2026-12-15T09:00:00+00:00",
      month_end: "2026-12-15T09:00:00+00:00",
      first_paid_at: "2026-11-15T09:00:00+00:00",
      source: "outreach",
    },
  ],
  month_ends: [
    { month: "2026-09", payers: 0 },
    { month: "2026-10", payers: 1 },
  ],
};

const STAFF_PAY = {
  people: [
    { id: "u1", name: "Karrar" },
    { id: "u2", name: "Noor" },
  ],
  months: [
    { month: "2026-11", payers: 2, perPersonIqd: 252_000, people: 2, totalIqd: 504_000, final: false },
    { month: "2026-10", payers: 1, perPersonIqd: 251_000, people: 2, totalIqd: 502_000, final: true },
  ],
};

/** `paying` null: the shops' read has not landed yet. */
function render(as: AdminRole, paying: unknown = PAYING): string {
  role = as;
  const client = new QueryClient();
  if (paying !== null) client.setQueryData(["admin", "paying-merchants"], paying);
  client.setQueryData(["admin", "staff-bonus"], STAFF_PAY);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(PayingShopsPage)));
}

describe("Paying shops", () => {
  it("shows every staff member the count, the goals, the month bars and the shops", () => {
    const html = render("support_staff");
    expect(html).toContain("Paying, now");
    expect(html).toContain("2 of 15");
    expect(html).toContain("2 of 60");
    expect(html).toContain("Goal for the end of Dec 2026");
    expect(html).toContain("Nov 2026, so far: 2 paying now");
    expect(html).toContain("Oct 2026: 1 paying at the month&#x27;s end");
    expect(html).toContain(`href="/merchants/${PAYING.shops[0]?.tenant_id}"`);
    expect(html).toContain("#100112");
    // Days on the Baghdad calendar.
    expect(html).toContain("10 Dec 2026");
    expect(html).toContain("Our outreach");
    expect(html).toContain("Signed up itself");
  });

  it("keeps the staff pay box from support staff", () => {
    const html = render("support_staff");
    expect(html).not.toContain("Staff pay");
    expect(html).not.toContain("252,000");
  });

  it("shows a super admin the staff pay, the running month marked so far", () => {
    const html = render("super_admin");
    expect(html).toContain("Only super admins see this box");
    expect(html).toContain("2 people");
    expect(html).toContain("Karrar, Noor");
    expect(html).toContain("252,000 IQD");
    expect(html).toContain("504,000 IQD");
    expect(html).toMatch(/Nov 2026<span[^>]*>, so far/);
    // Round 18: a month that ended counts who had joined by then, and says so.
    expect(html).toContain("each month counts the people above who had joined by its end");
  });

  // Round 18: the box was drawn on its own read, first, then jumped 263 px down
  // when the shops landed above it (layout shift 0.053, the console's worst).
  it("draws the staff pay box only once the shops above it have landed", () => {
    const html = render("super_admin", null);
    expect(html).not.toContain("Staff pay");
    expect(html).toContain("animate-spin");
  });

  // Round 18: "100231#متجر الأناقة", the number glued to the wrong side of an
  // Arabic name, and "growth" printed for the Team plan.
  it("keeps an Arabic shop name apart from its number and names the plan", () => {
    const arabic = { ...PAYING.shops[0], display_id: 100_095, name: "متجر تجريبي Claude للأزياء" };
    const html = render("support_staff", { ...PAYING, shops: [arabic, PAYING.shops[1]] });
    expect(html).toContain(`dir="auto" class="font-medium text-foreground hover:underline" href="/merchants/${arabic.tenant_id}">متجر تجريبي Claude للأزياء</a><span class="text-xs text-foreground/70 tabular-nums">#100095</span>`);
    expect(html).toContain(">Team<");
    expect(html).toContain(">Start<");
    expect(html).not.toMatch(/>(growth|starter)</);
    expect(html).not.toContain("capitalize");
  });

  // Round 20: "Paid until" printed paid_until, which carries the renewal wait
  // day: a day no charge paid for. The page names the month's own end.
  it("names a month waiting for its renewal by its own end, not the wait day", () => {
    const waiting = {
      ...PAYING.shops[1],
      // The month ended 18 Nov 23:00 in Baghdad; counted until 19 Nov 23:00.
      month_end: "2026-11-18T20:00:00+00:00",
      paid_until: "2026-11-19T20:00:00+00:00",
    };
    const html = render("support_staff", { ...PAYING, shops: [waiting, PAYING.shops[0]] });
    expect(html).toContain("18 Nov 2026<span class=\"text-foreground/70\">, renewal due</span>");
    expect(html).not.toContain("19 Nov 2026");
    // A month still running carries no note.
    expect(html).toMatch(/10 Dec 2026<\/td>/);
  });

  // Round 20: the rule sentence said our own store never counts, while a
  // shop moved to Internal keeps the months it paid.
  it("says how Internal and the renewal wait count", () => {
    const html = render("support_staff");
    expect(html).toContain("a shop moved to Internal keeps the months it paid");
    expect(html).toContain("A month that has ended still counts for one more day while its renewal runs");
  });

  it("says so when no shop pays yet, rather than an empty table", () => {
    const html = render("support_staff", { ...PAYING, count: 0, shops: [] });
    expect(html).toContain("No shop is paying yet");
    expect(html).not.toContain('data-testid="paying-shops"');
    expect(html).toContain("0 of 15");
  });
});
