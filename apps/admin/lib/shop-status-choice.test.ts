import { describe, expect, it } from "vitest";
import type { TenantStatus, TrialPayment } from "@/types/admin";
import {
  STATUS_REFUSALS,
  isTrialUnpaid,
  stageMoveNote,
  statusLandedText,
  statusPickRefusal,
  statusPickSaves,
  trialPayment,
  type StatusRefusal,
} from "./shop-status-choice";
import { SHOP_UPDATE_REFUSALS } from "./shop-update";
import { newestDefinition } from "./sql-migrations.test-data";

/*
 * Round 12 (structure new 6, workflow new 2). The card menu and the Pipeline
 * knew one of admin_update_shop's status refusals (trial to Active), so a
 * paused shop was offered four moves and a paying shop "Trial", each refused
 * after a round trip. The screens now ask statusPickRefusal, and these tests
 * hold it to the newest admin_update_shop as it ships.
 */

const updateShop = newestDefinition("admin_update_shop");

/** The refusal codes of a stretch of the function: `'error', '<code>'`. */
const codes = (sql: string) => [...sql.matchAll(/'error',\s*'([a-z_]+)'/g)].map((m) => m[1]).sort();

/** The status checks: after the new status is worked out, before the plan checks. */
function statusChecks(): string {
  const from = updateShop.indexOf("_new_status := coalesce(_status, _shop_status);");
  const to = updateShop.indexOf("IF _auto_renew IS NOT NULL");
  expect(from, "admin_update_shop works out _new_status").toBeGreaterThan(-1);
  expect(to, "admin_update_shop checks auto_renew after the status").toBeGreaterThan(from);
  return updateShop.slice(from, to);
}

/** The demo store is on no list (CUSTOMER_SHOP), so no menu offers it a move. */
const OFF_THE_LISTS = ["demo_store"];

describe("the status moves staff are offered", () => {
  it("cover every status refusal of the newest admin_update_shop", () => {
    expect(codes(statusChecks())).toEqual([...Object.keys(STATUS_REFUSALS), ...OFF_THE_LISTS].sort());
  });

  it("use the words the server answers with, for every code it can send", () => {
    expect(Object.keys(SHOP_UPDATE_REFUSALS).sort()).toEqual([...new Set(codes(updateShop))].sort());
    for (const code of Object.keys(STATUS_REFUSALS) as StatusRefusal[]) {
      expect(SHOP_UPDATE_REFUSALS[code].error).toBe(STATUS_REFUSALS[code]);
    }
  });

  type Shop = { status: TenantStatus; trial_payment: TrialPayment };
  const paying: Shop = { status: "active", trial_payment: "paid" };
  const held = (trial_payment: TrialPayment): Shop => ({ status: "suspended", trial_payment });
  const cases: Array<[string, Shop, TenantStatus, StatusRefusal | null]> = [
    ["Paused is set by Pause", paying, "limited", "use_pause"],
    ["a paused shop has no move", { status: "limited", trial_payment: "never_paid" }, "active", "paused"],
    ["a paused shop cannot be put on hold", { status: "limited", trial_payment: "never_paid" }, "suspended", "paused"],
    ["a trial does not become paying by a pick", { status: "trial", trial_payment: "never_paid" }, "active", "still_trial"],
    ["a paying shop does not go back to Trial", paying, "trial", "not_trialing"],
    ["a held trial never paid can go back to Trial", held("never_paid"), "trial", null],
    ["a held shop with no subscription can go back to Trial", held("no_subscription"), "trial", null],
    ["a held shop that paid cannot go back to Trial", held("paid"), "trial", "not_trialing"],
    ["a held trial can be picked Active (it reopens as a trial)", held("never_paid"), "active", null],
    ["a paying shop can be held", paying, "suspended", null],
    ["a trial can be cancelled", { status: "trial", trial_payment: "never_paid" }, "cancelled", null],
    ["the current status is no move", { status: "limited", trial_payment: "paid" }, "limited", null],
  ];
  it.each(cases)("%s", (_, shop, to, refusal) => {
    expect(statusPickRefusal(shop, to)).toBe(refusal);
  });

});

/*
 * Round 13 (data new 1, workflow new 3, structure new 5). A held trial that
 * was never paid (its subscription past due at its trial end) was refused
 * Trial, "not a trial", yet Active brought it back as Trial with no word.
 * One rule now decides both, in TS and in SQL, and the screens say when
 * Active lands as Trial.
 */
describe("a trial that was never paid", () => {
  const TRIAL_END = "2026-11-17T03:21:00+00:00";

  it("is a trialing subscription, or one past due at its trial end", () => {
    expect(isTrialUnpaid({ status: "trialing", current_period_end: TRIAL_END }, TRIAL_END)).toBe(true);
    // The same moment written two ways (the database and JSON) still matches.
    expect(isTrialUnpaid({ status: "past_due", current_period_end: "2026-11-17T03:21:00.000Z" }, TRIAL_END)).toBe(true);
    expect(isTrialUnpaid({ status: "past_due", current_period_end: "2026-12-17T03:21:00+00:00" }, TRIAL_END)).toBe(false);
    expect(isTrialUnpaid({ status: "past_due", current_period_end: TRIAL_END }, null)).toBe(false);
    expect(isTrialUnpaid({ status: "active", current_period_end: TRIAL_END }, TRIAL_END)).toBe(false);
    expect(isTrialUnpaid({ status: "cancelled", current_period_end: TRIAL_END }, TRIAL_END)).toBe(false);
  });

  it("is told apart from a paid subscription and from none", () => {
    expect(trialPayment(null, null)).toBe("no_subscription");
    expect(trialPayment(undefined, TRIAL_END)).toBe("no_subscription");
    expect(trialPayment({ status: "past_due", current_period_end: TRIAL_END }, TRIAL_END)).toBe("never_paid");
    expect(trialPayment({ status: "active", current_period_end: TRIAL_END }, TRIAL_END)).toBe("paid");
  });

  // Round 14 (data new 3): the list sent one flag for "no subscription, or
  // never paid", so the Pipeline could not tell that Active saves as Trial.
  it("saves Active as Trial only for a trial never paid, as the SQL rewrite does", () => {
    const held = (trial_payment: TrialPayment) => ({ status: "suspended" as TenantStatus, trial_payment });
    expect(statusPickSaves(held("never_paid"), "active")).toBe("trial");
    expect(statusPickSaves({ status: "cancelled", trial_payment: "never_paid" }, "active")).toBe("trial");
    // No subscription: _trial_unpaid is false in SQL, so Active is saved as picked.
    expect(statusPickSaves(held("no_subscription"), "active")).toBe("active");
    expect(statusPickSaves(held("paid"), "active")).toBe("active");
    expect(statusPickSaves(held("never_paid"), "trial")).toBe("trial");
    expect(statusPickSaves(held("never_paid"), "cancelled")).toBe("cancelled");
  });

  it("is the rule the newest admin_update_shop uses for both Trial and Active", () => {
    const checks = statusChecks().replace(/\s+/g, " ");
    expect(checks).toContain(
      "_trial_unpaid := coalesce( _sub_status = 'trialing' OR ( _sub_status = 'past_due' AND _trial_ends_at IS NOT NULL AND _sub_period_end = _trial_ends_at), false);",
    );
    expect(checks).toContain("IF _new_status = 'active' AND _trial_unpaid THEN _new_status := 'trial';");
    expect(checks).toContain("ELSIF _new_status = 'trial' AND _sub_id IS NOT NULL AND NOT _trial_unpaid THEN");
  });

  it("is said by the Pipeline's confirm before the move, as Reactivate says it", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    expect(stageMoveNote("active", "trial", TRIAL_END, now)).toBe(
      "The shop goes back to its trial now. Its trial ended unpaid, so it stays locked until it pays.",
    );
    expect(stageMoveNote("active", "trial", "2026-11-30T00:00:00Z", now)).toBe(
      "The shop goes back to its trial now: its trial was never paid.",
    );
    expect(stageMoveNote("active", "active", TRIAL_END, now)).toBe("The merchant's status will update immediately.");
    // Trial picked as Trial names the shop page's button for more days.
    expect(stageMoveNote("trial", "trial", TRIAL_END, now)).toBe(
      "Its trial end date stays as it is. To give more days, use Give free days on its page.",
    );
  });

  it("is said when Active comes back as Trial, and only then", () => {
    expect(statusLandedText("active", { status: "trial", id: "t1" })).toBe(
      "Back on Trial: its trial was never paid, so it reopens as a trial.",
    );
    expect(statusLandedText("active", { status: "active" })).toBeNull();
    expect(statusLandedText("trial", { status: "trial" })).toBeNull();
    expect(statusLandedText("active", "not a shop")).toBeNull();
  });
});
