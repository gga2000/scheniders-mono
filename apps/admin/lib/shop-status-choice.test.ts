import { describe, expect, it } from "vitest";
import type { TenantStatus } from "@/types/admin";
import { STATUS_REFUSALS, isTrialSubscription, statusPickRefusal, type StatusRefusal } from "./shop-status-choice";
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

  const paying = { status: "active" as TenantStatus, trial_subscription: false };
  const cases: Array<[string, { status: TenantStatus; trial_subscription: boolean }, TenantStatus, StatusRefusal | null]> = [
    ["Paused is set by Pause", paying, "limited", "use_pause"],
    ["a paused shop has no move", { status: "limited", trial_subscription: true }, "active", "paused"],
    ["a paused shop cannot be put on hold", { status: "limited", trial_subscription: true }, "suspended", "paused"],
    ["a trial does not become paying by a pick", { status: "trial", trial_subscription: true }, "active", "still_trial"],
    ["a paying shop does not go back to Trial", paying, "trial", "not_trialing"],
    ["a held trial can go back to Trial", { status: "suspended", trial_subscription: true }, "trial", null],
    ["a held trial can be picked Active (it reopens as a trial)", { status: "suspended", trial_subscription: true }, "active", null],
    ["a paying shop can be held", paying, "suspended", null],
    ["a trial can be cancelled", { status: "trial", trial_subscription: true }, "cancelled", null],
    ["the current status is no move", { status: "limited", trial_subscription: false }, "limited", null],
  ];
  it.each(cases)("%s", (_, shop, to, refusal) => {
    expect(statusPickRefusal(shop, to)).toBe(refusal);
  });

  it("count a shop with no subscription, or a trialing one, as able to go back to Trial", () => {
    expect([undefined, null, "trialing", "active", "past_due", "cancelled"].map(isTrialSubscription)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});
