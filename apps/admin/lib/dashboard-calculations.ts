/**
 * Shapes the admin dashboard's widgets from totals counted in the database
 * (see console-stats.ts). Pure functions, no DB calls and no clock: "today" is
 * the Baghdad day the database returned.
 */

import type {
  PipelineStage,
  LeaderboardEntry,
  GeoDistribution,
  GeoStats,
  HeatmapCell,
  FunnelStep,
  GrowthMetric,
  WalletHealthData,
  ActivityDay,
  RevenueBreakdown,
  PlanMovement,
  TopUpPattern,
  MerchantLTV,
  LTVDistribution,
  TimeToFirstOrderBucket,
  TenantOnboarding,
  KpiData,
  PlatformOrderStat,
} from "@/types/dashboard";
import { addDays } from "./baghdad-day";
import { daysEnding, feesOf, type DashboardStats, type IncomeStats, type UsageStats } from "./console-stats";
import { ONBOARDING_STEPS, onboardingDone, type OnboardingFacts } from "./onboarding-steps";
import { SHOP_GOVERNORATES, shopGovernorate } from "./shop-city";

// ─── Shared Helpers ─────────────────────────────────────────────────────────

export interface DashboardTenant {
  id: string;
  business_name: string;
  plan: string;
  status: string;
  created_at: string;
  branding: { primary_color: string } | null;
  wallet_balance: number;
  team_members_count: number;
  /** What the onboarding steps read besides orders and the team (lib/onboarding-steps). */
  setup: Pick<OnboardingFacts, "branding" | "storePublishes" | "toppedUpIqd">;
}

/** A shop's subscription as Home reads it for Plan Movements. */
export interface SubscriptionRow {
  tenant_id: string;
  plan: string;
  status: string;
  pending_plan: string | null;
  cancelled_at: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / DAY_MS);
}

const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The Baghdad calendar day (UTC+3, no DST) of an instant; the UTC day files 00:00-02:59 under the day before. */
export function getDateKey(d: Date): string {
  return new Date(d.getTime() + BAGHDAD_OFFSET_MS).toISOString().slice(0, 10);
}

const pctChange = (curr: number, prev: number) =>
  prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ─── Pipeline ───────────────────────────────────────────────────────────────

// "completed" is where a delivered order ends up once the courier's money is
// settled, so it belongs to Delivered. Counted alone, `delivered` showed 5 of
// 516 delivered orders.
const PIPELINE_STAGES = [
  { status: "new", statuses: ["new"], label: "New", color: "var(--pastel-yellow)" },
  { status: "contacted", statuses: ["contacted"], label: "Contacted", color: "var(--pastel-blue)" },
  { status: "confirmed", statuses: ["confirmed"], label: "Confirmed", color: "var(--pastel-green)" },
  { status: "in_transit", statuses: ["in_transit"], label: "In Transit", color: "var(--pastel-mint)" },
  { status: "delivered", statuses: ["delivered", "completed"], label: "Delivered", color: "var(--pastel-purple)" },
];

const sumStatuses = (counts: DashboardStats["statuses90"], statuses: string[]) =>
  statuses.reduce((s, status) => s + (counts[status] ?? 0), 0);

/** Orders of the last 90 days in the five stages shown; each share is of those five, so the bars add up to 100%. */
export function calculatePlatformPipeline(statuses90: DashboardStats["statuses90"]): PipelineStage[] {
  const stages = PIPELINE_STAGES.map(({ statuses, ...stage }) => ({
    ...stage,
    count: sumStatuses(statuses90, statuses),
  }));
  const total = stages.reduce((s, stage) => s + stage.count, 0);

  return stages.map((stage) => ({
    ...stage,
    pct: total > 0 ? Math.round((stage.count / total) * 100) : 0,
  }));
}

// ─── Top Merchants Leaderboard ──────────────────────────────────────────────

/** The ten shops with the most orders in the last 90 days. `shops` arrives sorted by that count. */
export function calculateTopMerchants(
  shops: DashboardStats["shops"],
  tenants: DashboardTenant[],
): LeaderboardEntry[] {
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  return shops
    .filter((s) => s.orders90 > 0)
    .slice(0, 10)
    .map((s) => {
      const t = tenantMap.get(s.tenantId);
      return {
        tenantId: s.tenantId,
        businessName: t?.business_name ?? "Unknown",
        primaryColor: t?.branding?.primary_color ?? "#1E1E1E",
        orderCount: s.orders90,
        revenue: s.sales90,
        sparkline: s.daily7,
      };
    });
}

// ─── Geographic Stats ───────────────────────────────────────────────────────

/**
 * Orders and shop sales by governorate, last 90 days. An order with no
 * governorate code is placed by the city typed on it, with the console's one
 * city rule (the Merchants map's), so "بغداد" counts for Baghdad; what that
 * rule cannot read is "unknown", never left out.
 */
export function calculateGeoStats(
  governorates90: DashboardStats["governorates90"],
  uncodedPlaces90: DashboardStats["uncodedPlaces90"],
): GeoDistribution {
  const byCode = new Map<string, GeoStats>();
  const add = (code: string, orders: number, sales: number) => {
    const row = byCode.get(code) ?? { governorateCode: code, orderCount: 0, revenue: 0 };
    row.orderCount += orders;
    row.revenue += sales;
    byCode.set(code, row);
  };
  for (const g of governorates90) add(g.code, g.orders, g.sales);

  const unknown = { orderCount: 0, revenue: 0 };
  for (const place of uncodedPlaces90) {
    const governorate = shopGovernorate(place.city);
    if (governorate) {
      add(governorate.code, place.orders, place.sales);
    } else {
      unknown.orderCount += place.orders;
      unknown.revenue += place.sales;
    }
  }

  const governorates = [...byCode.values()].sort(
    (a, b) => b.orderCount - a.orderCount || a.governorateCode.localeCompare(b.governorateCode),
  );
  return { governorates, unknown };
}

// ─── Peak Hours Heatmap ─────────────────────────────────────────────────────

/** Orders by Baghdad weekday and hour, last 90 days. */
export function calculatePeakHours(hours90: DashboardStats["hours90"]): HeatmapCell[] {
  const grid: number[][] = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const h of hours90) {
    if (grid[h.dow]?.[h.hour] !== undefined) grid[h.dow][h.hour] = h.count;
  }

  const max = Math.max(1, ...grid.flat());
  const cells: HeatmapCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ dayOfWeek: day, hour, count: grid[day][hour], intensity: grid[day][hour] / max });
    }
  }
  return cells;
}

// ─── Fulfillment Funnel ─────────────────────────────────────────────────────

/**
 * The merchant dashboard's funnel (get_dashboard_metrics), across every shop:
 * a parcel refused at the door was still confirmed and shipped.
 */
export function calculateFulfillmentFunnel(statuses90: DashboardStats["statuses90"]): FunnelStep[] {
  const total = Object.values(statuses90).reduce((s, n) => s + n, 0);
  const steps = [
    { label: "New Orders", count: total, color: "var(--pastel-blue)" },
    {
      label: "Confirmed",
      count: sumStatuses(statuses90, ["confirmed", "in_transit", "delivered", "completed", "rejected"]),
      color: "var(--pastel-green)",
    },
    {
      label: "Shipped",
      count: sumStatuses(statuses90, ["in_transit", "delivered", "completed", "rejected"]),
      color: "var(--pastel-yellow)",
    },
    {
      label: "Delivered",
      count: sumStatuses(statuses90, ["delivered", "completed"]),
      color: "var(--pastel-mint)",
    },
  ];

  return steps.map((s, i) => ({
    ...s,
    dropOffPct: i === 0 ? 0 : steps[i - 1].count > 0
      ? Math.round(((steps[i - 1].count - s.count) / steps[i - 1].count) * 100)
      : 0,
  }));
}

// ─── Growth: the last 7 days against the 7 before ───────────────────────────

/** Below this many ended parcels a delivery rate is noise: 2 of 2 reads "100%". */
export const MIN_ENDED_FOR_RATE = 20;

/** Delivered over delivered plus refused, in percent with one decimal; null on too small a sample. */
function deliveryRate(delivered: number, ended: number): number | null {
  if (ended < MIN_ENDED_FOR_RATE) return null;
  return Math.round((delivered / ended) * 1000) / 10;
}

export function calculateGrowthMetrics(stats: DashboardStats, tenants: DashboardTenant[]): GrowthMetric[] {
  const { orders, sales, delivery, today } = stats;

  const weekStart = addDays(today, -6);
  const prevStart = addDays(today, -13);
  const signupDays = tenants.map((t) => getDateKey(new Date(t.created_at)));
  const newMerchants = signupDays.filter((d) => d >= weekStart).length;
  const newMerchantsPrev = signupDays.filter((d) => d >= prevStart && d < weekStart).length;

  const rate = deliveryRate(delivery.delivered, delivery.ended);
  const ratePrev = deliveryRate(delivery.prevDelivered, delivery.prevEnded);

  return [
    {
      label: "Orders",
      current: orders.last7,
      previous: orders.prev7,
      delta: orders.last7 - orders.prev7,
      deltaPct: pctChange(orders.last7, orders.prev7),
      isFinancial: false,
    },
    {
      label: "Merchant Sales",
      current: sales.last7,
      previous: sales.prev7,
      delta: sales.last7 - sales.prev7,
      deltaPct: pctChange(sales.last7, sales.prev7),
      isFinancial: true,
    },
    {
      label: "New Merchants",
      current: newMerchants,
      previous: newMerchantsPrev,
      delta: newMerchants - newMerchantsPrev,
      deltaPct: pctChange(newMerchants, newMerchantsPrev),
      isFinancial: false,
    },
    {
      label: "Delivery Rate",
      current: rate,
      previous: ratePrev,
      delta: rate !== null && ratePrev !== null ? rate - ratePrev : 0,
      deltaPct: null,
      isFinancial: false,
      unit: "%",
      emptyNote: `under ${MIN_ENDED_FOR_RATE} ended parcels`,
    },
  ];
}

// ─── Wallet Health ──────────────────────────────────────────────────────────

export function calculateWalletHealth(
  tenants: DashboardTenant[],
  topUpsDaily7: IncomeStats["topups"]["daily7"],
): WalletHealthData {
  const balances = tenants.map((t) => t.wallet_balance).sort((a, b) => a - b);

  const healthy = balances.filter((b) => b > 50000).length;
  const warning = balances.filter((b) => b >= 10000 && b <= 50000).length;
  const critical = balances.filter((b) => b < 10000).length;
  const avgBalance = balances.length ? balances.reduce((a, b) => a + b, 0) / balances.length : 0;
  const medianBalance = balances.length ? balances[Math.floor(balances.length / 2)] : 0;

  return { healthy, warning, critical, avgBalance, medianBalance, topUpRateSparkline: topUpsDaily7 };
}

// ─── Activity Heatmap (GitHub-style, 52 weeks) ─────────────────────────────

/** One entry per Baghdad day for the 365 days ending today, quiet days included. */
export function calculateActivityHeatmap(usage: UsageStats): ActivityDay[] {
  return daysEnding(usage.today, 365).map((date) => ({ date, count: usage.days[date] ?? 0 }));
}

// ─── Revenue Breakdown ──────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  starter: "var(--pastel-blue)",
  growth: "var(--pastel-green)",
  professional: "var(--pastel-purple)",
  enterprise: "var(--pastel-yellow)",
};

const SLICE_COLORS = [
  "var(--pastel-blue)", "var(--pastel-green)", "var(--pastel-yellow)",
  "var(--pastel-pink)", "var(--pastel-purple)", "var(--pastel-mint)",
];

/** The most places the "by city" bars show. */
const CITY_SLICES = 10;

/**
 * Last 90 days. By plan is the fees we collected; by city and by source are
 * the merchants' sales. By city reads the map's numbers, so both say the same
 * for Baghdad, and "Unknown city" is a bar of its own.
 */
export function calculateRevenueBreakdown(
  byPlan90: IncomeStats["byPlan90"],
  geo: GeoDistribution,
  sources90: DashboardStats["sources90"],
): RevenueBreakdown {
  const places = [
    ...geo.governorates.map((g) => ({
      label: SHOP_GOVERNORATES.find((s) => s.code === g.governorateCode)?.name ?? g.governorateCode,
      value: g.revenue,
    })),
    { label: "Unknown city", value: geo.unknown.revenue },
  ]
    .filter((place) => place.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, CITY_SLICES);

  return {
    byPlan: byPlan90.map((p) => ({
      label: titleCase(p.plan),
      value: p.amount,
      color: PLAN_COLORS[p.plan] || "var(--pastel-mint)",
    })),
    byCity: places.map((place, i) => ({
      ...place,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
    })),
    bySource: sources90.map((s, i) => ({
      label: titleCase(s.source),
      value: s.sales,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
    })),
  };
}

// ─── Plan Movements ─────────────────────────────────────────────────────────

const PLAN_RANK: Record<string, number> = {
  starter: 1, growth: 2, professional: 3, enterprise: 4,
};

/**
 * The "Plan Movements (30d)" card. No table keeps a plan's history, so the
 * card shows only what the subscriptions prove: a cancellation dated in the
 * last 30 days, and a plan change still waiting for the next payment. A
 * cancellation older than that, or with no date, is not a move of the last 30
 * days. Only shops in `shopIds` count, so the demo store stays out.
 */
export function calculatePlanMovements(
  rows: SubscriptionRow[],
  shopIds: ReadonlySet<string>,
  now: Date,
): PlanMovement[] {
  const since = now.getTime() - 30 * DAY_MS;
  const moves: PlanMovement[] = [];
  for (const s of rows) {
    if (!shopIds.has(s.tenant_id)) continue;
    const from = s.plan as PlanMovement["fromPlan"];
    if (s.status === "cancelled") {
      if (s.cancelled_at && Date.parse(s.cancelled_at) >= since) {
        moves.push({ fromPlan: from, toPlan: "cancelled", count: 1, type: "cancellation" });
      }
    } else if (s.pending_plan && s.pending_plan !== s.plan) {
      const up = (PLAN_RANK[s.pending_plan] || 0) > (PLAN_RANK[s.plan] || 0);
      moves.push({
        fromPlan: from,
        toPlan: s.pending_plan as PlanMovement["toPlan"],
        count: 1,
        type: up ? "upgrade" : "downgrade",
      });
    }
  }
  return moves;
}

// ─── Top-Up Patterns ────────────────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Top-ups of the last 90 days by Baghdad weekday. */
export function calculateTopUpPatterns(byDow: IncomeStats["topups"]["byDow"]): TopUpPattern[] {
  return byDow.map((d) => ({
    dayOfWeek: d.dow,
    dayLabel: DAY_LABELS[d.dow] ?? String(d.dow),
    count: d.count,
    avgAmount: d.count > 0 ? Math.round(d.total / d.count) : 0,
  }));
}

// ─── Merchant LTV ───────────────────────────────────────────────────────────

const LTV_BUCKETS = [
  { label: "0 IQD", min: 0, max: 0 },
  { label: "1-50K", min: 1, max: 50000 },
  { label: "50K-200K", min: 50001, max: 200000 },
  { label: "200K-500K", min: 200001, max: 500000 },
  { label: "500K-1M", min: 500001, max: 1000000 },
  { label: "1M+", min: 1000001, max: Infinity },
];

/**
 * What each shop has paid us in fees since it signed up. The average is over
 * every shop, the ones that never paid included, and the dashboard and the
 * Revenue page both read this one function so they cannot disagree.
 */
export function calculateMerchantLTV(
  tenants: Pick<DashboardTenant, "id" | "business_name" | "created_at">[],
  byTenant: IncomeStats["byTenant"],
  today: string,
  top = 5,
): { topMerchants: MerchantLTV[]; distribution: LTVDistribution[]; avgLTV: number } {
  const feesByTenant = new Map(byTenant.map((t) => [t.tenantId, t.amount]));
  // Noon of the Baghdad day the database calls today.
  const now = new Date(`${today}T09:00:00Z`);

  const ltvList: MerchantLTV[] = tenants.map((t) => {
    const totalRevenue = feesByTenant.get(t.id) ?? 0;
    const lifetimeDays = Math.max(1, daysBetween(new Date(t.created_at), now));
    return {
      tenantId: t.id,
      businessName: t.business_name,
      totalRevenue,
      lifetimeDays,
      avgMonthlyRevenue: (totalRevenue / lifetimeDays) * 30,
    };
  });

  const topMerchants = ltvList
    .filter((l) => l.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, top);

  const distribution: LTVDistribution[] = LTV_BUCKETS.map((b) => ({
    bucket: b.label,
    count: ltvList.filter((l) => l.totalRevenue >= b.min && l.totalRevenue <= b.max).length,
    minValue: b.min,
    maxValue: b.max,
  }));

  const avgLTV = ltvList.length
    ? Math.round(ltvList.reduce((s, l) => s + l.totalRevenue, 0) / ltvList.length)
    : 0;

  return { topMerchants, distribution, avgLTV };
}

// ─── Time to First Order ────────────────────────────────────────────────────

const FIRST_ORDER_BUCKETS = [
  { label: "Same Day", min: 0, max: 0 },
  { label: "1-3 Days", min: 1, max: 3 },
  { label: "4-7 Days", min: 4, max: 7 },
  { label: "1-2 Weeks", min: 8, max: 14 },
  { label: "2-4 Weeks", min: 15, max: 28 },
  { label: "> 1 Month", min: 29, max: Infinity },
];

/** From signup to the shop's first real order ever (not its first in the last 90 days). */
export function calculateTimeToFirstOrder(
  tenants: DashboardTenant[],
  shops: DashboardStats["shops"],
): TimeToFirstOrderBucket[] {
  const firstOrderAt = new Map(shops.map((s) => [s.tenantId, s.firstOrderAt]));
  const counts = new Map<string, number>([...FIRST_ORDER_BUCKETS.map((b) => [b.label, 0] as const), ["Never", 0]]);

  for (const t of tenants) {
    const first = firstOrderAt.get(t.id);
    if (!first) {
      counts.set("Never", (counts.get("Never") ?? 0) + 1);
      continue;
    }
    const days = daysBetween(new Date(t.created_at), new Date(first));
    const bucket = FIRST_ORDER_BUCKETS.find((b) => days >= b.min && days <= b.max);
    if (bucket) counts.set(bucket.label, (counts.get(bucket.label) ?? 0) + 1);
  }

  return [...counts].map(([label, count]) => ({ label, count, isHighlight: label === "Never" }));
}

// ─── Onboarding Progress ────────────────────────────────────────────────────

export function calculateOnboardingProgress(
  tenants: DashboardTenant[],
  shops: DashboardStats["shops"],
): TenantOnboarding[] {
  const ordersByTenant = new Map(shops.map((s) => [s.tenantId, s.ordersAll]));

  return tenants.map((t) => {
    const done = onboardingDone({
      orders: ordersByTenant.get(t.id) ?? 0,
      activeMembers: t.team_members_count,
      ...t.setup,
    });
    const completed = ONBOARDING_STEPS.map((step) => step.key).filter((key) => done[key]);

    return {
      tenantId: t.id,
      businessName: t.business_name,
      primaryColor: t.branding?.primary_color || "#1E1E1E",
      completedSteps: completed,
      totalSteps: ONBOARDING_STEPS.length,
      completionPct: Math.round((completed.length / ONBOARDING_STEPS.length) * 100),
    };
  });
}

// ─── KPI Calculations ───────────────────────────────────────────────────────

/*
 * A month in progress against a whole month is not a fair race (16 days of
 * November against 31 of October reads "-42%"), so month figures carry the
 * last month's number but no up/down badge.
 */

export function calculateKpis(
  stats: DashboardStats,
  income: IncomeStats,
  tenants: DashboardTenant[],
): Record<string, KpiData> {
  const { orders, sales, today } = stats;

  const activeTenants = tenants.filter((t) => t.status === "active").length;
  const activeRate = tenants.length ? Math.round((activeTenants / tenants.length) * 100) : 0;

  const signupDays = tenants.map((t) => getDateKey(new Date(t.created_at)));
  const signupsDaily7 = daysEnding(today, 7).map((day) => signupDays.filter((d) => d === day).length);

  const avgOrderValue = sales.count90 > 0 ? Math.round(sales.sum90 / sales.count90) : 0;

  // Cards name the month: "Orders, Nov" says which month and fits on one line.
  const month = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

  const feesThisMonth = feesOf(income.monthly[11]);
  const feesLastMonth = feesOf(income.monthly[10]);

  return {
    totalOrders: {
      label: `Orders, ${month}`,
      value: orders.month,
      previousValue: orders.prevMonth,
      delta: orders.month - orders.prevMonth,
      deltaPct: null,
      sparkline: orders.daily7,
    },
    totalRevenue: {
      label: `Shop sales, ${month}`,
      value: sales.month,
      previousValue: sales.prevMonth,
      delta: sales.month - sales.prevMonth,
      deltaPct: null,
      sparkline: sales.daily7,
      suffix: " IQD",
    },
    totalMerchants: {
      label: "Merchants",
      value: tenants.length,
      previousValue: tenants.length,
      delta: 0,
      deltaPct: null,
      sparkline: signupsDaily7,
    },
    activeRate: {
      label: "Active rate",
      value: activeRate,
      previousValue: activeRate,
      delta: 0,
      deltaPct: null,
      sparkline: [],
      suffix: "%",
    },
    avgOrderValue: {
      label: "Avg order, 90 d",
      value: avgOrderValue,
      previousValue: avgOrderValue,
      delta: 0,
      deltaPct: null,
      sparkline: [],
      suffix: " IQD",
    },
    // Fees collected this Baghdad month: monthly plan, delivered orders and
    // paid messages. Not a run-rate, so it is not called MRR.
    mrr: {
      label: `Our fees, ${month}`,
      value: feesThisMonth,
      previousValue: feesLastMonth,
      delta: feesThisMonth - feesLastMonth,
      deltaPct: null,
      sparkline: income.feesDaily7,
      suffix: " IQD",
    },
  };
}

// ─── Platform Order Stats ───────────────────────────────────────────────────

export function calculatePlatformOrderStats(orders: DashboardStats["orders"]): PlatformOrderStat[] {
  return [
    {
      label: "Today",
      value: orders.today,
      previousValue: orders.yesterday,
      previousLabel: "yesterday",
      delta: orders.today - orders.yesterday,
      deltaPct: null,
    },
    {
      label: "Last 7 days",
      value: orders.last7,
      previousValue: orders.prev7,
      previousLabel: "7 days before",
      delta: orders.last7 - orders.prev7,
      deltaPct: pctChange(orders.last7, orders.prev7),
    },
    {
      label: "This month",
      value: orders.month,
      previousValue: orders.prevMonth,
      previousLabel: "last month",
      delta: orders.month - orders.prevMonth,
      deltaPct: null,
    },
    {
      label: "All time",
      value: orders.allTime,
      previousValue: orders.allTime,
      delta: 0,
      deltaPct: null,
    },
  ];
}
