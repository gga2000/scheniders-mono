import { describe, expect, it } from "vitest";
import { RENEWAL_RUN_EVERY_MS } from "./billing-check";
import { newestDefinition } from "./sql-migrations.test-data";

/*
 * Round 21 (structure new 5): the console's 25 hours ("missed") and the
 * renewal's one-day carry-on were two numbers with no common home. The watch
 * now counts from the run's period, and this holds that period to the window
 * the newest SQL writes, in the renewal and in the paying count that reads
 * the same month back. A change to either fails here.
 */
describe("the watch's day is the renewal's day", () => {
  const DAY = /interval '(\d+) day'/;

  it("matches renew_subscription_core's carry-on window", () => {
    const start = /_start := CASE WHEN [^;]*?> _now - (interval '\d+ day')/.exec(newestDefinition("renew_subscription_core"));
    expect(start, "renew_subscription_core no longer starts a month on time within a window").not.toBeNull();
    expect(Number(DAY.exec(start?.[1] ?? "")?.[1]) * 24 * 60 * 60 * 1000).toBe(RENEWAL_RUN_EVERY_MS);
  });

  it("matches paid_plan_months' reading of the same month", () => {
    const window = /WHEN e\.ended > c\.created_at - (interval '\d+ day')/.exec(newestDefinition("paid_plan_months"));
    expect(window, "paid_plan_months no longer reads a renewal's carry-on window").not.toBeNull();
    expect(Number(DAY.exec(window?.[1] ?? "")?.[1]) * 24 * 60 * 60 * 1000).toBe(RENEWAL_RUN_EVERY_MS);
  });
});
