import type { DashboardStats, IncomeStats, UsageStats } from "./console-stats";

/*
 * Answers shaped like the admin_*_stats SQL functions return them, for tests.
 * Today is Monday 16 November 2026 on the Baghdad clock.
 */

export const TODAY = "2026-11-16";
export const SHOP_A = "aaaaaaaa-0000-4000-8000-000000000001";
export const SHOP_B = "bbbbbbbb-0000-4000-8000-000000000002";
export const SHOP_C = "cccccccc-0000-4000-8000-000000000003";

export function dashboardStats(over: Partial<DashboardStats> = {}): DashboardStats {
  return {
    today: TODAY,
    orders: {
      today: 3,
      yesterday: 5,
      last7: 40,
      prev7: 50,
      month: 237,
      prevMonth: 407,
      allTime: 5445,
      daily7: [5, 6, 7, 8, 6, 5, 3],
    },
    sales: {
      month: 8_083_500,
      prevMonth: 9_067_750,
      last7: 1_200_000,
      prev7: 1_500_000,
      sum90: 22_000_000,
      count90: 500,
      daily7: [100_000, 200_000, 150_000, 250_000, 200_000, 180_000, 120_000],
    },
    delivery: { delivered: 45, ended: 50, prevDelivered: 60, prevEnded: 80 },
    // The live spread on 2026-11-16: nearly every delivered order sits in `completed`.
    statuses90: {
      new: 4,
      in_transit: 41,
      delivered: 5,
      completed: 511,
      rejected: 59,
      cancelled: 90,
      no_response: 99,
      suspended: 2,
    },
    shops: [
      {
        tenantId: SHOP_A,
        ordersAll: 5000,
        firstOrderAt: "2026-04-03T09:00:00+00:00",
        orders90: 800,
        sales90: 22_000_000,
        daily7: [5, 6, 7, 8, 6, 5, 3],
      },
      {
        tenantId: SHOP_B,
        ordersAll: 2,
        firstOrderAt: "2026-01-10T09:00:00+00:00",
        orders90: 0,
        sales90: 0,
        daily7: [0, 0, 0, 0, 0, 0, 0],
      },
    ],
    governorates90: [{ code: "BGD", orders: 500, sales: 15_000_000 }],
    cities90: [
      { city: "Baghdad", sales: 15_000_000 },
      { city: "Basra", sales: 3_000_000 },
    ],
    sources90: [
      { source: "whatsapp", sales: 6_000_000 },
      { source: "direct", sales: 100_000 },
    ],
    hours90: [
      { dow: 1, hour: 21, count: 30 },
      { dow: 5, hour: 0, count: 10 },
    ],
    ...over,
  };
}

export function usageStats(over: Partial<UsageStats> = {}): UsageStats {
  return {
    today: TODAY,
    total: 4093,
    days: { "2026-11-16": 3, "2026-11-15": 5, "2026-11-14": 6, "2026-11-08": 9, "2025-11-17": 2 },
    hours: Array.from({ length: 24 }, (_, hour) => (hour === 21 ? 30 : 1)),
    ...over,
  };
}

const quietMonth = (month: string) => ({ month, subscription: 0, orders: 0, whatsapp: 0, other: 0 });

export function incomeStats(over: Partial<IncomeStats> = {}): IncomeStats {
  return {
    today: TODAY,
    monthly: [
      ...["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].map(
        quietMonth,
      ),
      { month: "2026-10", subscription: 25_000, orders: 5_500, whatsapp: 300, other: 0 },
      // 79,000 of test reversals this month: a charge, but not income.
      { month: "2026-11", subscription: 9_000, orders: 1_100, whatsapp: 60, other: 79_000 },
    ],
    byPlan: [
      { month: "2026-10", plan: "growth", amount: 30_800 },
      { month: "2026-11", plan: "growth", amount: 1_160 },
      { month: "2026-11", plan: "starter", amount: 9_000 },
      // Older than the six months the Revenue page shows.
      { month: "2026-01", plan: "starter", amount: 9_000 },
    ],
    byPlan90: [
      { plan: "growth", amount: 31_960 },
      { plan: "starter", amount: 9_000 },
    ],
    cohorts: [
      { cohort: "2026-04", tenants: 1, months: [0, 0, 0, 0, 0, 0] },
      { cohort: "2026-11", tenants: 2, months: [10_160, 0, 0, 0, 0, 0] },
    ],
    byTenant: [
      { tenantId: SHOP_A, amount: 31_960 },
      { tenantId: SHOP_B, amount: 9_000 },
    ],
    feesDaily7: [0, 0, 9_000, 0, 1_160, 0, 0],
    topups: {
      daily7: [0, 1, 0, 0, 2, 0, 0],
      byDow: [
        { dow: 0, count: 0, total: 0 },
        { dow: 1, count: 3, total: 75_000 },
        { dow: 2, count: 0, total: 0 },
        { dow: 3, count: 0, total: 0 },
        { dow: 4, count: 1, total: 10_000 },
        { dow: 5, count: 0, total: 0 },
        { dow: 6, count: 0, total: 0 },
      ],
    },
    ...over,
  };
}
