import { describe, expect, it } from "vitest";
import type { AdminTenant } from "@/types/admin";
import { computedShopFilters } from "./merchant-filters";
import {
  healthBand,
  healthChipClass,
  healthDotClass,
  isChurnRisk,
  listChurnRisk,
  shopsAtRiskLine,
} from "./merchant-health";

const NOW = Date.parse("2026-11-16T09:00:00+03:00");
const inDays = (days: number) => new Date(NOW + days * 24 * 60 * 60 * 1000).toISOString();

const paying = { status: "active", trialEndsAt: null, walletIqd: 40_000, orders30d: 30 };

describe("healthBand", () => {
  it("cuts the score where the Merchants health filter cuts it", () => {
    // The filter's own lines, read back from the filter: at risk under 40, healthy from 70.
    const [[, , atRiskBelow]] = computedShopFilters({ health: "at_risk" });
    const [[, , healthyFrom]] = computedShopFilters({ health: "healthy" });
    expect([atRiskBelow, healthyFrom]).toEqual([40, 70]);

    expect(healthBand(39)).toBe("at_risk");
    expect(healthBand(40)).toBe("warning");
    expect(healthBand(69)).toBe("warning");
    expect(healthBand(70)).toBe("healthy");
    expect(healthBand(0)).toBe("at_risk");
    expect(healthBand(100)).toBe("healthy");
  });

  it("gives one colour per band, chip and dot alike", () => {
    expect(healthChipClass(85)).toContain("emerald");
    expect(healthDotClass(85)).toContain("emerald");
    expect(healthChipClass(50)).toContain("amber");
    expect(healthDotClass(50)).toContain("amber");
    expect(healthChipClass(20)).toContain("rose");
    expect(healthDotClass(20)).toContain("rose");
  });
});

describe("isChurnRisk", () => {
  it("shows no flame on a paying shop that sells", () => {
    expect(isChurnRisk(paying, NOW)).toBe(false);
  });

  it("flames a suspended shop whatever its numbers", () => {
    expect(isChurnRisk({ ...paying, status: "suspended" }, NOW)).toBe(true);
  });

  it("never flames a cancelled shop: it has already left", () => {
    expect(isChurnRisk({ ...paying, status: "cancelled", walletIqd: 0, orders30d: 0 }, NOW)).toBe(false);
  });

  it("flames a shop under 5,000 IQD that sold fewer than 5 orders", () => {
    expect(isChurnRisk({ ...paying, walletIqd: 4_999, orders30d: 4 }, NOW)).toBe(true);
    // Either one alone is not enough.
    expect(isChurnRisk({ ...paying, walletIqd: 5_000, orders30d: 4 }, NOW)).toBe(false);
    expect(isChurnRisk({ ...paying, walletIqd: 4_999, orders30d: 5 }, NOW)).toBe(false);
  });

  it("flames a trial in its last 3 days with no order", () => {
    const trial = { status: "trial", trialEndsAt: inDays(3), walletIqd: 20_000, orders30d: 0 };
    expect(isChurnRisk(trial, NOW)).toBe(true);
    expect(isChurnRisk({ ...trial, trialEndsAt: inDays(-1) }, NOW)).toBe(true);
    expect(isChurnRisk({ ...trial, trialEndsAt: inDays(4) }, NOW)).toBe(false);
    expect(isChurnRisk({ ...trial, orders30d: 1 }, NOW)).toBe(false);
    expect(isChurnRisk({ ...trial, trialEndsAt: null }, NOW)).toBe(false);
  });

  it("flames a paused trial as a trial: its days still run", () => {
    const pausedTrial = { status: "limited", restrictions: { status_before: "trial" }, trialEndsAt: inDays(2), walletIqd: 20_000, orders30d: 0 };
    expect(isChurnRisk(pausedTrial, NOW)).toBe(true);
    // A paying shop paused, with an old trial date, is no trial.
    expect(isChurnRisk({ ...pausedTrial, restrictions: { status_before: "active" } }, NOW)).toBe(false);
  });

  it("counts the last 3 days on the Baghdad calendar, as the Trials page does", () => {
    // NOW is 09:00 on 16 Nov. 23:00 on the 19th is three days away by the calendar
    // (3 days and 14 hours by the clock); 00:30 on the 20th is four.
    const trial = { status: "trial", walletIqd: 20_000, orders30d: 0 };
    expect(isChurnRisk({ ...trial, trialEndsAt: "2026-11-19T20:00:00Z" }, NOW)).toBe(true);
    expect(isChurnRisk({ ...trial, trialEndsAt: "2026-11-19T21:30:00Z" }, NOW)).toBe(false);
  });
});

describe("the list's flame", () => {
  it("reads the shop's real orders of 30 days, not the plan's usage counter", () => {
    // A shop with 2,000 IQD that sold 40 real orders, most through its store
    // checkout, which the plan's counter never sees (it says 3).
    const row = {
      status: "active",
      trial_ends_at: null,
      wallet: { balance_iqd: 2_000 },
      orders_30d: 40,
      usage: { orders_count: 3, orders_charged: 3, team_members_count: 1 },
    } as unknown as AdminTenant;
    expect(listChurnRisk(row, NOW)).toBe(false);
    expect(listChurnRisk({ ...row, orders_30d: 4 }, NOW)).toBe(true);
  });

  it("treats a list row with no wallet and no order numbers as empty, not as fine", () => {
    const row = { status: "active", trial_ends_at: null, wallet: undefined, usage: null } as unknown as AdminTenant;
    expect(listChurnRisk(row, NOW)).toBe(true);
  });
});

describe("shopsAtRiskLine", () => {
  it("counts one shop once when it is at risk and low on money", () => {
    // Live on 17 Nov: "2 issues detected" for one shop.
    expect(shopsAtRiskLine([{ tenant_id: "a" }], [{ tenant_id: "a" }])).toBe("1 shop needs a look: 1 at risk, 1 low wallet");
  });

  it("counts every shop across both lists", () => {
    expect(shopsAtRiskLine([{ tenant_id: "a" }, { tenant_id: "b" }], [{ tenant_id: "b" }, { tenant_id: "c" }])).toBe(
      "3 shops need a look: 2 at risk, 2 low wallets",
    );
  });
});
