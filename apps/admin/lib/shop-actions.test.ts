import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/admin-permissions";
import {
  endAfterDays,
  freeDaysKind,
  isSubscriptionRunning,
  moreActions,
  shopFormFrom,
  shopFormHref,
  typedAmount,
  type ShopFacts,
} from "./shop-actions";
import type { AdminRole } from "@/types/admin";

const as = (role: AdminRole) => (action: Parameters<typeof hasPermission>[1]) => hasPermission(role, action);
const shop = (facts: Partial<ShopFacts> = {}): ShopFacts => ({
  status: "active",
  locked: false,
  subscriptionRunning: true,
  ...facts,
});

describe("Give free days", () => {
  it("lengthens a trial for anyone who may extend trials, support staff too", () => {
    expect(freeDaysKind(shop({ status: "trial" }), as("support_staff"))).toBe("trial");
    expect(freeDaysKind(shop({ status: "trial", locked: true }), as("super_admin"))).toBe("trial");
  });

  it("lengthens a paying shop's month for super admins only", () => {
    expect(freeDaysKind(shop(), as("super_admin"))).toBe("month");
    expect(freeDaysKind(shop(), as("support_staff"))).toBeNull();
  });

  it("is not offered when there is no month to lengthen or the shop is stopped", () => {
    expect(freeDaysKind(shop({ subscriptionRunning: false }), as("super_admin"))).toBeNull();
    for (const status of ["limited", "suspended", "cancelled"]) {
      expect(freeDaysKind(shop({ status }), as("super_admin"))).toBeNull();
    }
  });
});

describe("More", () => {
  it("gives a super admin the plan, pause, hold and note tools on a paying shop", () => {
    expect(moreActions(shop(), as("super_admin"))).toEqual(["plan", "pause", "hold", "note"]);
  });

  it("offers store orders first on a locked shop, and paid time with no charge on a trial", () => {
    expect(moreActions(shop({ status: "trial", locked: true }), as("super_admin"))).toEqual([
      "orders", "plan", "pause", "hold", "convert", "note",
    ]);
  });

  it("brings a shop on hold back, and does not pause or hold it again", () => {
    expect(moreActions(shop({ status: "suspended" }), as("super_admin"))).toEqual(["plan", "reactivate", "note"]);
    expect(moreActions(shop({ status: "limited" }), as("super_admin"))).toEqual(["plan", "hold", "note"]);
  });

  it("shows support staff only what their login may do", () => {
    expect(moreActions(shop(), as("support_staff"))).toEqual(["note"]);
    expect(moreActions(shop({ status: "trial", locked: true }), as("support_staff"))).toEqual(["orders", "note"]);
  });
});

describe("where free days end", () => {
  const now = new Date("2026-11-16T09:00:00Z");

  it("counts from the current end while it is ahead", () => {
    expect(endAfterDays("2026-11-19T09:00:00Z", 7, now).toISOString()).toBe("2026-11-26T09:00:00.000Z");
  });

  it("counts from now once the end has passed, as the database does", () => {
    expect(endAfterDays("2026-11-10T09:00:00Z", 7, now).toISOString()).toBe("2026-11-23T09:00:00.000Z");
    expect(endAfterDays(null, 1, now).toISOString()).toBe("2026-11-17T09:00:00.000Z");
  });
});

describe("small readers", () => {
  it("reads a typed amount with or without separators, and nothing else", () => {
    expect(typedAmount("10,000")).toBe(10_000);
    expect(typedAmount(" 9000 IQD")).toBe(9_000);
    expect(typedAmount("")).toBeNull();
    expect(typedAmount("0")).toBeNull();
  });

  it("counts trialing, active and past-due subscriptions as running", () => {
    expect(["trialing", "active", "past_due"].every(isSubscriptionRunning)).toBe(true);
    expect(isSubscriptionRunning("cancelled")).toBe(false);
    expect(isSubscriptionRunning(undefined)).toBe(false);
  });
});

describe("links that open a shop page form", () => {
  it("open the shop's own page, with the form named in the link", () => {
    expect(shopFormHref("t1", "money")).toBe("/merchants/t1?action=add-money");
    expect(shopFormHref("t1", "days")).toBe("/merchants/t1?action=free-days");
  });

  it("read back the form each link names", () => {
    for (const form of ["money", "days"] as const) {
      const action = new URL(shopFormHref("t1", form), "https://admin.test").searchParams.get("action");
      expect(shopFormFrom(action)).toBe(form);
    }
  });

  it("still open free days from the menu's old extend-trial link", () => {
    expect(shopFormFrom("extend-trial")).toBe("days");
  });

  it("open nothing for no action or a word it does not know", () => {
    expect(shopFormFrom(null)).toBeNull();
    expect(shopFormFrom("delete-shop")).toBeNull();
  });
});
