import { describe, expect, it } from "vitest";
import {
  calculateActivityHeatmap,
  calculateFulfillmentFunnel,
  calculateGrowthMetrics,
  calculateKpis,
  calculateMerchantLTV,
  calculateOnboardingProgress,
  calculatePeakHours,
  calculatePlatformOrderStats,
  calculatePlanMovements,
  calculatePlatformPipeline,
  calculateRevenueBreakdown,
  calculateGeoStats,
  calculateTimeToFirstOrder,
  calculateTopMerchants,
  calculateTopUpPatterns,
  getDateKey,
  MIN_ENDED_FOR_RATE,
  type DashboardTenant,
  type StatusChangeRow,
  type SubscriptionRow,
} from "./dashboard-calculations";
import { dashboardStats, incomeStats, SHOP_A, SHOP_B, SHOP_C, TODAY, usageStats } from "./console-stats.test-data";
import { ONBOARDING_STEPS } from "./onboarding-steps";

const tenant = (id: string, over: Partial<DashboardTenant> = {}): DashboardTenant => ({
  id,
  business_name: `Shop ${id.slice(0, 1).toUpperCase()}`,
  plan: "starter",
  status: "active",
  created_at: "2026-04-01T09:00:00Z",
  branding: { primary_color: "#1E1E1E" },
  wallet_balance: 0,
  team_members_count: 1,
  setup: { branding: null, storePublishes: 0, toppedUpIqd: 0 },
  ...over,
});

const tenants = [tenant(SHOP_A), tenant(SHOP_B, { status: "trial" }), tenant(SHOP_C, { status: "trial" })];

describe("getDateKey", () => {
    it("files 00:00-02:59 Baghdad time under that Baghdad day, not the UTC day before", () => {
        expect(getDateKey(new Date("2026-11-10T22:30:00Z"))).toBe("2026-11-11");
        expect(getDateKey(new Date("2026-11-10T20:59:00Z"))).toBe("2026-11-10");
    });
});

describe("order pipeline", () => {
  const pipeline = calculatePlatformPipeline(dashboardStats().statuses90);
  const stage = (status: string) => pipeline.find((s) => s.status === status);

  it("counts completed orders as delivered", () => {
    expect(stage("delivered")?.count).toBe(516); // 5 delivered + 511 completed
  });

  it("takes each share from the five stages shown, so the bars add up", () => {
    // 561 orders sit in the five stages; cancelled, refused and no-answer orders are not a stage.
    expect(pipeline.reduce((s, st) => s + st.count, 0)).toBe(561);
    expect(stage("delivered")?.pct).toBe(92);
    expect(stage("in_transit")?.pct).toBe(7);
    expect(stage("contacted")).toMatchObject({ count: 0, pct: 0 });
  });

  it("shows zeros, not NaN, with no orders", () => {
    expect(calculatePlatformPipeline({}).every((s) => s.count === 0 && s.pct === 0)).toBe(true);
  });
});

describe("fulfillment funnel", () => {
  it("follows the merchant app's rule: a refused parcel was still confirmed and shipped", () => {
    const [all, confirmed, shipped, delivered] = calculateFulfillmentFunnel(dashboardStats().statuses90);
    expect(all.count).toBe(811);
    expect(confirmed.count).toBe(616); // in_transit 41 + delivered 5 + completed 511 + rejected 59
    expect(shipped.count).toBe(616);
    expect(delivered.count).toBe(516);
    expect(delivered.dropOffPct).toBe(16);
  });
});

describe("growth, last 7 days against the 7 before", () => {
  it("compares orders and merchant sales over equal windows", () => {
    const [orders, sales] = calculateGrowthMetrics(dashboardStats(), tenants);
    expect(orders).toMatchObject({ label: "Orders", current: 40, previous: 50, deltaPct: -20 });
    expect(sales).toMatchObject({ label: "Merchant Sales", current: 1_200_000, previous: 1_500_000, isFinancial: true });
  });

  it("counts new merchants by Baghdad day", () => {
    // The 7-day window opens on 10 November, Baghdad time.
    const signups = [
      tenant(SHOP_A, { created_at: "2026-11-09T21:30:00Z" }), // 00:30 on the 10th in Baghdad: this week
      tenant(SHOP_B, { created_at: "2026-11-09T20:30:00Z" }), // 23:30 on the 9th in Baghdad: the week before
      tenant(SHOP_C, { created_at: "2026-04-01T09:00:00Z" }),
    ];
    const merchants = calculateGrowthMetrics(dashboardStats(), signups)[2];
    expect(merchants).toMatchObject({ label: "New Merchants", current: 1, previous: 1 });
  });

  it("shows delivered over delivered plus refused", () => {
    const rate = calculateGrowthMetrics(dashboardStats(), tenants)[3];
    expect(rate).toMatchObject({ label: "Delivery Rate", current: 90, previous: 75, unit: "%" });
  });

  it("shows no delivery rate on a sample too small to mean anything", () => {
    // Live on 2026-11-16: 2 of 2 parcels ended this week. That is not "100%".
    const few = dashboardStats({ delivery: { delivered: 2, ended: 2, prevDelivered: 75, prevEnded: 79 } });
    const rate = calculateGrowthMetrics(few, tenants)[3];
    expect(rate.current).toBeNull();
    expect(rate.previous).toBe(94.9);
    expect(rate.emptyNote).toContain(String(MIN_ENDED_FOR_RATE));
  });
});

describe("KPI cards", () => {
  const kpis = calculateKpis(dashboardStats(), incomeStats(), tenants);

  it("reads this month's orders and merchant sales from the database totals", () => {
    expect(kpis.totalOrders).toMatchObject({ label: "Orders, Nov", value: 237, previousValue: 407 });
    expect(kpis.totalRevenue).toMatchObject({ label: "Shop sales, Nov", value: 8_083_500, suffix: " IQD" });
    expect(kpis.totalOrders.sparkline).toEqual([5, 6, 7, 8, 6, 5, 3]);
  });

  it("shows no up/down badge for a month in progress against a whole month", () => {
    expect(kpis.totalOrders.deltaPct).toBeNull();
    expect(kpis.totalRevenue.deltaPct).toBeNull();
    expect(kpis.mrr.deltaPct).toBeNull();
  });

  it("calls collected fees what they are, and leaves other charges out", () => {
    // 9,000 plan + 1,100 delivered orders + 60 messages. The 79,000 of test reversals is not income.
    expect(kpis.mrr).toMatchObject({ label: "Our fees, Nov", value: 10_160, previousValue: 30_800 });
  });

  it("averages the order value over delivered orders of the last 90 days", () => {
    expect(kpis.avgOrderValue.value).toBe(44_000);
    const none = dashboardStats();
    none.sales.count90 = 0;
    expect(calculateKpis(none, incomeStats(), tenants).avgOrderValue.value).toBe(0);
  });

  it("counts merchants and the share that is active", () => {
    expect(kpis.totalMerchants.value).toBe(3);
    expect(kpis.activeRate.value).toBe(33);
  });
});

describe("order counts row", () => {
  const [today, week, month, allTime] = calculatePlatformOrderStats(dashboardStats().orders);

  it("shows the true all-time count, past the API's 1,000-row cap", () => {
    expect(allTime).toMatchObject({ label: "All time", value: 5445 });
    expect(allTime.previousLabel).toBeUndefined();
  });

  it("names what each figure is compared with, and badges only the fair comparison", () => {
    expect(today).toMatchObject({ value: 3, previousValue: 5, previousLabel: "yesterday", deltaPct: null });
    expect(week).toMatchObject({ label: "Last 7 days", value: 40, previousValue: 50, deltaPct: -20 });
    expect(month).toMatchObject({ value: 237, previousValue: 407, previousLabel: "last month", deltaPct: null });
  });
});

describe("merchant lifetime value", () => {
  const ltv = calculateMerchantLTV(tenants, incomeStats().byTenant, TODAY);

  it("averages fees over every shop, the ones that never paid included", () => {
    expect(ltv.avgLTV).toBe(13_653); // (31,960 + 9,000 + 0) / 3
  });

  it("lists only shops that paid, highest first", () => {
    expect(ltv.topMerchants.map((m) => m.tenantId)).toEqual([SHOP_A, SHOP_B]);
    expect(ltv.topMerchants[0]).toMatchObject({ businessName: "Shop A", totalRevenue: 31_960 });
  });

  it("puts the shops that never paid in their own bucket", () => {
    expect(ltv.distribution.find((b) => b.bucket === "0 IQD")?.count).toBe(1);
    expect(ltv.distribution.find((b) => b.bucket === "1-50K")?.count).toBe(2);
  });
});

describe("time to first order and onboarding", () => {
  it("measures to the shop's first order ever", () => {
    // Shop A signed up 1 April and first sold on 3 April; Shop B's first order is before its signup date.
    const buckets = calculateTimeToFirstOrder(tenants, dashboardStats().shops);
    const count = (label: string) => buckets.find((b) => b.label === label)?.count;
    expect(count("1-3 Days")).toBe(1);
    expect(count("> 1 Month")).toBe(1);
    expect(buckets.at(-1)).toMatchObject({ label: "Never", count: 1, isHighlight: true });
  });

  it("names done steps with the keys the tracker draws its ticks from", () => {
    const allDone = tenant(SHOP_A, {
      team_members_count: 2,
      setup: { branding: { logo_url: "https://cdn.example/logo.png" }, storePublishes: 3, toppedUpIqd: 25_000 },
    });
    const [row] = calculateOnboardingProgress([allDone], dashboardStats().shops);
    // The tracker had its own keys ("team", "wallet"...), so these read as crosses beside "100%".
    expect(row.completedSteps).toEqual(ONBOARDING_STEPS.map((step) => step.key));
    expect(row).toMatchObject({ totalSteps: 5, completionPct: 100 });
  });

  it("ticks First Order for a shop whose orders are older than 90 days", () => {
    const steps = calculateOnboardingProgress(tenants, dashboardStats().shops);
    expect(steps.find((t) => t.tenantId === SHOP_B)?.completedSteps).toContain("has_orders");
    expect(steps.find((t) => t.tenantId === SHOP_C)?.completedSteps).toEqual([]);
  });
});

describe("smaller widgets", () => {
  it("lists top merchants by orders in the last 90 days, skipping shops with none", () => {
    const top = calculateTopMerchants(dashboardStats().shops, tenants);
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({ tenantId: SHOP_A, businessName: "Shop A", orderCount: 800, revenue: 22_000_000 });
  });

  it("lays the year out as 365 Baghdad days ending today, quiet days as zero", () => {
    const days = calculateActivityHeatmap(usageStats());
    expect(days).toHaveLength(365);
    expect(days[0]).toEqual({ date: "2025-11-17", count: 2 });
    expect(days.at(-1)).toEqual({ date: TODAY, count: 3 });
    expect(days.at(-4)).toEqual({ date: "2026-11-13", count: 0 });
  });

  it("builds the weekday-by-hour grid", () => {
    const cells = calculatePeakHours(dashboardStats().hours90);
    expect(cells).toHaveLength(168);
    expect(cells.find((c) => c.dayOfWeek === 1 && c.hour === 21)).toMatchObject({ count: 30, intensity: 1 });
    expect(cells.find((c) => c.dayOfWeek === 5 && c.hour === 0)?.count).toBe(10);
  });

  it("averages top-ups per weekday", () => {
    const monday = calculateTopUpPatterns(incomeStats().topups.byDow)[1];
    expect(monday).toMatchObject({ dayLabel: "Mon", count: 3, avgAmount: 25_000 });
  });

  it("labels the breakdown slices", () => {
    const stats = dashboardStats();
    const geo = calculateGeoStats(stats.governorates90, stats.uncodedPlaces90);
    const breakdown = calculateRevenueBreakdown(incomeStats().byPlan90, geo, stats.sources90);
    expect(breakdown.byPlan[0]).toMatchObject({ label: "Growth", value: 31_960 });
    expect(breakdown.bySource[0].label).toBe("Whatsapp");
  });

  // The map left out every order with no governorate code (a quarter of sales
  // live), though most name the governorate in the city field, and the city
  // tab split one city into spellings: two answers for "sales in Baghdad".
  it("places an order with no governorate code by the city typed, and counts the rest as unknown", () => {
    const stats = dashboardStats();
    const geo = calculateGeoStats(stats.governorates90, stats.uncodedPlaces90);

    expect(geo.governorates).toEqual([
      { governorateCode: "BGD", orderCount: 520, revenue: 15_600_000 },
      { governorateCode: "BAS", orderCount: 100, revenue: 3_000_000 },
    ]);
    expect(geo.unknown).toEqual({ orderCount: 6, revenue: 250_000 });

    const sum = (n: number[]) => n.reduce((a, b) => a + b, 0);
    const placed = sum(geo.governorates.map((g) => g.orderCount)) + geo.unknown.orderCount;
    const fromDatabase = sum(stats.governorates90.map((g) => g.orders)) + sum(stats.uncodedPlaces90.map((p) => p.orders));
    expect(placed).toBe(fromDatabase);
  });

  it("gives the city tab the map's numbers, with Unknown city as a bar of its own", () => {
    const stats = dashboardStats();
    const geo = calculateGeoStats(stats.governorates90, stats.uncodedPlaces90);
    const { byCity } = calculateRevenueBreakdown(incomeStats().byPlan90, geo, stats.sources90);

    expect(byCity.map(({ label, value }) => [label, value])).toEqual([
      ["Baghdad", 15_600_000],
      ["Basra", 3_000_000],
      ["Unknown city", 250_000],
    ]);
  });

  it("shows at most ten places, the biggest sales first", () => {
    const governorates90 = ["BGD", "BAS", "ARB", "SMH", "NJF", "KRB", "DOH", "KRK", "MOS", "DYL", "KOT"].map((code, i) => ({
      code,
      orders: 10,
      sales: (i + 1) * 1_000,
    }));
    const geo = calculateGeoStats(governorates90, []);
    const { byCity } = calculateRevenueBreakdown([], geo, []);

    expect(byCity).toHaveLength(10);
    expect(byCity[0]).toMatchObject({ label: "Wasit", value: 11_000 });
    expect(byCity.map((c) => c.label)).not.toContain("Baghdad");
  });
});

describe("calculatePlanMovements", () => {
  // The card read cancellations from subscriptions.cancelled_at, which nothing
  // writes, so it could never show one. A shop is cancelled only by a staff
  // status change, which the staff log keeps with its day.
  const now = new Date("2026-11-16T22:00:00Z");
  const sub = (tenant_id: string, over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
    tenant_id,
    plan: "starter",
    status: "active",
    pending_plan: null,
    ...over,
  });
  const change = (tenant_id: string | null, status: string, created_at: string): StatusChangeRow => ({
    tenant_id,
    details: { status, previous_status: "active", source: "single" },
    created_at,
  });
  const shops = new Map([
    [SHOP_A, "starter"],
    [SHOP_B, "growth"],
    [SHOP_C, "growth"],
  ]);

  it("counts each shop staff cancelled in the last 30 days, under its plan", () => {
    const moves = calculatePlanMovements(
      [],
      [
        change(SHOP_A, "cancelled", "2026-11-01T10:00:00Z"),
        change(SHOP_B, "cancelled", "2026-11-15T10:00:00Z"),
        // Put on hold, not cancelled.
        change(SHOP_C, "suspended", "2026-11-15T10:00:00Z"),
        // Older than 30 days.
        change(SHOP_C, "cancelled", "2026-10-10T10:00:00Z"),
        // A row with no shop names nothing.
        change(null, "cancelled", "2026-11-15T10:00:00Z"),
      ],
      shops,
      now,
    );
    expect(moves).toEqual([
      { fromPlan: "starter", toPlan: "cancelled", count: 1, type: "cancellation" },
      { fromPlan: "growth", toPlan: "cancelled", count: 1, type: "cancellation" },
    ]);
  });

  it("shows a waiting plan change as an upgrade or a downgrade", () => {
    const moves = calculatePlanMovements(
      [
        sub(SHOP_A, { plan: "starter", pending_plan: "growth" }),
        sub(SHOP_B, { plan: "professional", pending_plan: "growth" }),
        sub(SHOP_C, { plan: "growth", pending_plan: "growth" }),
      ],
      [],
      shops,
      now,
    );
    expect(moves.map((m) => `${m.fromPlan}>${m.toPlan}:${m.type}`)).toEqual([
      "starter>growth:upgrade",
      "professional>growth:downgrade",
    ]);
  });

  it("shows no waiting change on a cancelled subscription", () => {
    expect(calculatePlanMovements([sub(SHOP_A, { status: "cancelled", pending_plan: "growth" })], [], shops, now)).toEqual([]);
  });

  it("leaves out shops that are not listed, such as the demo store", () => {
    const moves = calculatePlanMovements(
      [sub("demo-store", { plan: "growth", pending_plan: "starter" })],
      [change("demo-store", "cancelled", "2026-11-15T10:00:00Z")],
      shops,
      now,
    );
    expect(moves).toEqual([]);
  });
});
