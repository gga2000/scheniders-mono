import { describe, expect, it } from "vitest";
import type { AdminTenant } from "@/types/admin";
import { computedShopFilters } from "./merchant-filters";
import {
  healthBand,
  healthChipClass,
  healthDotClass,
  isChurnRisk,
  listChurnRisk,
  newestMonthOrders,
} from "./merchant-health";

const NOW = Date.parse("2026-11-16T09:00:00+03:00");
const inDays = (days: number) => new Date(NOW + days * 24 * 60 * 60 * 1000).toISOString();

const paying = { status: "active", trialEndsAt: null, walletIqd: 40_000, ordersNewestMonth: 30 };

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

  it("flames a shop under 5,000 IQD that sold fewer than 5 orders", () => {
    expect(isChurnRisk({ ...paying, walletIqd: 4_999, ordersNewestMonth: 4 }, NOW)).toBe(true);
    // Either one alone is not enough.
    expect(isChurnRisk({ ...paying, walletIqd: 5_000, ordersNewestMonth: 4 }, NOW)).toBe(false);
    expect(isChurnRisk({ ...paying, walletIqd: 4_999, ordersNewestMonth: 5 }, NOW)).toBe(false);
  });

  it("flames a trial in its last 3 days with no order", () => {
    const trial = { status: "trial", trialEndsAt: inDays(3), walletIqd: 20_000, ordersNewestMonth: 0 };
    expect(isChurnRisk(trial, NOW)).toBe(true);
    expect(isChurnRisk({ ...trial, trialEndsAt: inDays(-1) }, NOW)).toBe(true);
    expect(isChurnRisk({ ...trial, trialEndsAt: inDays(4) }, NOW)).toBe(false);
    expect(isChurnRisk({ ...trial, ordersNewestMonth: 1 }, NOW)).toBe(false);
    expect(isChurnRisk({ ...trial, trialEndsAt: null }, NOW)).toBe(false);
  });
});

describe("the list and the shop dialog", () => {
  // A shop with 2,000 IQD that sold 60 orders over older months and 3 in its
  // newest month. The dialog used to add the months up (63 orders, no flame)
  // while the list read the newest month (3 orders, flame).
  const usage = [
    { year: 2026, month: 9, orders_count: 40 },
    { year: 2026, month: 11, orders_count: 3 },
    { year: 2026, month: 10, orders_count: 20 },
  ];

  it("read the same month, so they show the same flame", () => {
    expect(newestMonthOrders(usage)).toBe(3);

    const fromDialog = isChurnRisk(
      { status: "active", trialEndsAt: null, walletIqd: 2_000, ordersNewestMonth: newestMonthOrders(usage) },
      NOW,
    );
    const row = {
      status: "active",
      trial_ends_at: null,
      wallet: { balance_iqd: 2_000 },
      usage: { orders_count: 3, orders_charged: 3, team_members_count: 1 },
    } as unknown as AdminTenant;

    expect(fromDialog).toBe(true);
    expect(listChurnRisk(row, NOW)).toBe(true);
  });

  it("reads the newest month across a year change and treats no usage as no orders", () => {
    expect(
      newestMonthOrders([
        { year: 2026, month: 12, orders_count: 9 },
        { year: 2027, month: 1, orders_count: 2 },
      ]),
    ).toBe(2);
    expect(newestMonthOrders([])).toBe(0);
    expect(newestMonthOrders([{ year: 2026, month: 11, orders_count: null }])).toBe(0);
  });

  it("treats a list row with no wallet and no usage as empty, not as fine", () => {
    const row = { status: "active", trial_ends_at: null, wallet: undefined, usage: null } as unknown as AdminTenant;
    expect(listChurnRisk(row, NOW)).toBe(true);
  });
});
