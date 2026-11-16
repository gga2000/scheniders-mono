import { describe, expect, it } from "vitest";
import { isListSort, isMerchantTab, listStatus, tabFilters, type MerchantListRow } from "./merchant-list";

/* Where a shop stands, in a chip and a few words, for one cell of the Merchants table. */

const NOW = new Date("2026-11-16T09:00:00Z");

const row = (extra: Partial<MerchantListRow> = {}): MerchantListRow => ({
  id: "s1",
  display_id: 100041,
  business_name: "موبايلات الكرادة",
  slug: "karrada",
  city: "Baghdad",
  contact_phone: null,
  status: "active",
  plan: "starter",
  trial_ends_at: null,
  restrictions: null,
  wallet_iqd: 2175,
  subscription: { status: "active", current_period_end: "2026-12-01T00:00:00Z", auto_renew: true },
  billing_lock: null,
  orders_30d: 19,
  last_order_at: null,
  ...extra,
});

describe("listStatus", () => {
  it("puts a lock first, with why and since when, though the status reads active", () => {
    expect(listStatus(row({ billing_lock: { reason: "unpaid", since: "2026-11-13T08:00:00Z" } }), NOW)).toEqual({
      tone: "locked",
      label: "Locked",
      reason: "not paid since Fri 13 Nov",
    });
    expect(listStatus(row({ status: "trial", billing_lock: { reason: "trial_ended", since: "2026-11-15T06:21:00Z" } }), NOW).reason).toBe(
      "trial ended Sun 15 Nov, not paid",
    );
  });

  it("says when a trial ends, and that the wallet is empty when it is", () => {
    expect(listStatus(row({ status: "trial", trial_ends_at: "2026-11-17T06:21:00Z", wallet_iqd: 0 }), NOW)).toEqual({
      tone: "trial",
      label: "Trial",
      reason: "ends Tue 17 Nov, wallet is empty",
    });
    expect(listStatus(row({ status: "trial", trial_ends_at: "2026-11-17T06:21:00Z" }), NOW).reason).toBe("ends Tue 17 Nov");
  });

  it("says when a paying shop renews, or that renewal is off", () => {
    expect(listStatus(row(), NOW)).toEqual({ tone: "paying", label: "Paying", reason: "renews Tue 1 Dec" });
    const off = row({ subscription: { status: "active", current_period_end: "2026-12-01T00:00:00Z", auto_renew: false } });
    expect(listStatus(off, NOW).reason).toBe("renewal off, ends Tue 1 Dec");
  });

  it("does not call a shop paying when its subscription has ended", () => {
    expect(listStatus(row({ subscription: null }), NOW)).toEqual({ tone: "ended", label: "Active", reason: "subscription ended, not billed" });
  });

  it("names our own shops, shops on hold, paused shops and cancelled shops", () => {
    expect(listStatus(row({ plan: "internal" }), NOW).label).toBe("Internal");
    expect(listStatus(row({ status: "suspended" }), NOW)).toEqual({ tone: "hold", label: "On hold", reason: "no monthly fee" });
    expect(listStatus(row({ status: "limited", restrictions: { paused_until: "2026-11-18T09:00:00Z" } }), NOW).reason).toBe("until Wed 18 Nov");
    expect(listStatus(row({ status: "cancelled" }), NOW).label).toBe("Cancelled");
  });
});

describe("the list's tabs and sorts", () => {
  it("reads only tabs and sorts the list has", () => {
    expect(isMerchantTab("paying")).toBe(true);
    expect(isMerchantTab("attention")).toBe(false);
    expect(isListSort("wallet:desc")).toBe(true);
    expect(isListSort("health:desc")).toBe(false);
  });

  it("keeps our own shops out of Trial and Paying", () => {
    expect(tabFilters("paying")).toContainEqual(["plan", "neq", "internal"]);
    expect(tabFilters("trial")).toContainEqual(["plan", "neq", "internal"]);
  });

  it("reads Locked from the database's own lock rule", () => {
    expect(tabFilters("locked")).toEqual([["staff_locked", "is", "true"]]);
  });
});
