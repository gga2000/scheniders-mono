import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/admin-permissions";
import {
  endAfterDays,
  freeDaysKind,
  isSubscriptionRunning,
  moreActions,
  reactivateComeback,
  reactivateWords,
  renewalWords,
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
  demo: false,
  prospect: false,
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
  });

  it("does not offer a paused shop a pause or a hold, which the database refuses until the pause is lifted", () => {
    expect(moreActions(shop({ status: "limited" }), as("super_admin"))).toEqual(["plan", "note"]);
    expect(moreActions(shop({ status: "limited", locked: true }), as("super_admin"))).toEqual(["orders", "plan", "note"]);
  });

  it("shows support staff only what their login may do", () => {
    expect(moreActions(shop(), as("support_staff"))).toEqual(["note"]);
    expect(moreActions(shop({ status: "trial", locked: true }), as("support_staff"))).toEqual(["orders", "note"]);
  });
});

describe("the demo store", () => {
  // Each of these was offered, filled in, and then refused by the database
  // ("The demo store has no paid time to extend"; "This is the demo store.
  // Its status does not change.").
  it("offers no free days, pause or hold, since the database refuses them for it", () => {
    expect(freeDaysKind(shop({ demo: true }), as("super_admin"))).toBeNull();
    expect(moreActions(shop({ demo: true }), as("super_admin"))).toEqual(["plan", "note"]);
  });

  it("still offers what works on it", () => {
    expect(moreActions(shop({ demo: true }), as("support_staff"))).toEqual(["note"]);
  });

  it("is never offered paid time with no charge, even on trial", () => {
    expect(moreActions(shop({ demo: true, status: "trial" }), as("super_admin"))).not.toContain("convert");
  });
});

// Round 19: a lead's pre-built store is on trial, and "Start paid time, no
// charge" was offered on it. Converted that way, the lead could no longer be
// converted into it (convert_lead_atomic answers prospect_not_open).
describe("a store built for a lead", () => {
  it("is not offered paid time with no charge; the lead is converted instead", () => {
    expect(moreActions(shop({ prospect: true, status: "trial" }), as("super_admin"))).not.toContain("convert");
    expect(moreActions(shop({ status: "trial" }), as("super_admin"))).toContain("convert");
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

describe("what Reactivate says", () => {
  const now = new Date("2026-11-16T09:00:00Z");

  it("says a shop that paid comes back active and is charged as usual", () => {
    expect(reactivateWords("active", "2026-11-01T09:00:00Z", now)).toBe(
      "The shop is active again now, and its monthly fee is charged as usual.",
    );
  });

  it("says a trial that was never paid comes back as a trial, locked once it has ended", () => {
    expect(reactivateWords("trial", "2026-11-10T09:00:00Z", now)).toBe(
      "The shop goes back to its trial now. Its trial ended unpaid, so it stays locked until it pays.",
    );
    expect(reactivateWords("trial", "2026-11-20T09:00:00Z", now)).toBe(
      "The shop goes back to its trial now: its trial was never paid.",
    );
  });

  it("says a shop whose last month is unpaid comes back locked until its wallet covers the month", () => {
    expect(reactivateWords("active_unpaid", null, now)).toBe(
      "The shop is active again now, but its last month is not paid, so it stays locked until its wallet covers the month.",
    );
  });
});

/*
 * Round 15: admin_update_shop saves Active for a held shop that is not a never-
 * paid trial, and tenant_billing_lock locks an active shop whose subscription
 * is past_due at once (never the internal plan).
 */
describe("what a shop on hold comes back as", () => {
  it("a trial never paid comes back as a trial", () => {
    expect(reactivateComeback(true, "trialing", "starter")).toBe("trial");
  });

  it("a paid shop whose last month is unpaid comes back active and locked", () => {
    expect(reactivateComeback(false, "past_due", "starter")).toBe("active_unpaid");
  });

  it("a paid shop in good standing, or on the internal plan, comes back active", () => {
    expect(reactivateComeback(false, "active", "starter")).toBe("active");
    expect(reactivateComeback(false, null, "starter")).toBe("active");
    expect(reactivateComeback(false, "past_due", "internal")).toBe("active");
  });
});

describe("the renewal line", () => {
  it("says a shop that is not running is not charged while it stays so", () => {
    expect(renewalWords(true, false, "active")).toBe("On: charges the wallet each month");
    expect(renewalWords(true, false, "trial")).toBe("On: charges the wallet each month");
    expect(renewalWords(true, false, "limited")).toBe("On: not charged while paused, then charges the wallet each month");
    expect(renewalWords(true, false, "suspended")).toBe("On: not charged while on hold, then charges the wallet each month");
    expect(renewalWords(true, false, "cancelled")).toBe("On: not charged while cancelled");
  });

  it("says the demo store is never charged, and an ended renewal is off", () => {
    expect(renewalWords(true, true, "active")).toBe("On: renews each month, never charged (demo store)");
    expect(renewalWords(false, false, "suspended")).toBe("Off: the month ends and is not renewed");
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
