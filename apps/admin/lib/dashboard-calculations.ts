/**
 * Pure calculation functions for the admin dashboard V2.
 * These operate on pre-fetched data arrays — no DB calls.
 * Adapted from platform's dashboard-calculations.ts for cross-tenant aggregation.
 */

import type {
  PipelineStage,
  LeaderboardEntry,
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

// ─── Shared Helpers ─────────────────────────────────────────────────────────

interface RawOrder {
  id: string;
  tenant_id: string;
  status: string;
  price: number;
  delivery_fee: number;
  city: string | null;
  governorate_code: string | null;
  source: string | null;
  created_at: string;
  delivered_at: string | null;
}

interface RawTenant {
  id: string;
  business_name: string;
  plan: string;
  status: string;
  city: string | null;
  created_at: string;
  branding: { primary_color: string } | null;
  wallet_balance: number;
  total_charged: number;
  total_topped_up: number;
  orders_count: number;
  team_members_count: number;
  has_branding: boolean;
  has_storefront: boolean;
  wallet_funded: boolean;
}

interface RawWalletTransaction {
  type: string;
  amount_iqd: number;
  created_at: string;
  tenant_id: string;
}

interface RawSubscriptionChange {
  tenant_id: string;
  from_plan: string | null;
  to_plan: string | null;
  changed_at: string;
  type: string; // 'plan_change' | 'new' | 'cancellation'
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function getDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Pipeline ───────────────────────────────────────────────────────────────

export function calculatePlatformPipeline(orders: RawOrder[]): PipelineStage[] {
  const stages = [
    { status: "new", label: "New", color: "var(--pastel-yellow)" },
    { status: "contacted", label: "Contacted", color: "var(--pastel-blue)" },
    { status: "confirmed", label: "Confirmed", color: "var(--pastel-green)" },
    { status: "in_transit", label: "In Transit", color: "var(--pastel-mint)" },
    { status: "delivered", label: "Delivered", color: "var(--pastel-purple)" },
  ];

  const counts: Record<string, number> = {};
  for (const o of orders) {
    counts[o.status] = (counts[o.status] || 0) + 1;
  }
  const total = orders.length || 1;

  return stages.map((s) => ({
    ...s,
    count: counts[s.status] || 0,
    pct: Math.round(((counts[s.status] || 0) / total) * 100),
  }));
}

// ─── Top Merchants Leaderboard ──────────────────────────────────────────────

export function calculateTopMerchants(
  orders: RawOrder[],
  tenants: RawTenant[],
): LeaderboardEntry[] {
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));
  const stats: Record<string, { count: number; revenue: number; daily: Record<string, number> }> = {};

  const now = new Date();
  for (const o of orders) {
    if (!stats[o.tenant_id]) {
      stats[o.tenant_id] = { count: 0, revenue: 0, daily: {} };
    }
    stats[o.tenant_id].count++;
    if (["confirmed", "delivered", "completed"].includes(o.status)) {
      stats[o.tenant_id].revenue += Number(o.price);
    }
    // Sparkline: last 7 days
    const dayKey = getDateKey(new Date(o.created_at));
    stats[o.tenant_id].daily[dayKey] = (stats[o.tenant_id].daily[dayKey] || 0) + 1;
  }

  // Build sparkline (last 7 days)
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return getDateKey(d);
  });

  return Object.entries(stats)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([tenantId, s]) => {
      const t = tenantMap.get(tenantId);
      return {
        tenantId,
        businessName: t?.business_name ?? "Unknown",
        primaryColor: t?.branding?.primary_color ?? "#1E1E1E",
        orderCount: s.count,
        revenue: s.revenue,
        sparkline: last7.map((d) => s.daily[d] || 0),
      };
    });
}

// ─── Geographic Stats ───────────────────────────────────────────────────────

export function calculateGeoStats(orders: RawOrder[]): GeoStats[] {
  const stats: Record<string, { count: number; revenue: number }> = {};

  for (const o of orders) {
    const code = o.governorate_code;
    if (!code) continue;
    if (!stats[code]) stats[code] = { count: 0, revenue: 0 };
    stats[code].count++;
    if (["confirmed", "delivered", "completed"].includes(o.status)) {
      stats[code].revenue += Number(o.price);
    }
  }

  return Object.entries(stats).map(([code, s]) => ({
    governorateCode: code,
    orderCount: s.count,
    revenue: s.revenue,
  }));
}

// ─── Peak Hours Heatmap ─────────────────────────────────────────────────────

export function calculatePeakHours(orders: RawOrder[]): HeatmapCell[] {
  const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));

  for (const o of orders) {
    const d = new Date(o.created_at);
    grid[d.getDay()][d.getHours()]++;
  }

  const max = Math.max(1, ...grid.flat());
  const cells: HeatmapCell[] = [];

  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({
        dayOfWeek: day,
        hour,
        count: grid[day][hour],
        intensity: grid[day][hour] / max,
      });
    }
  }

  return cells;
}

// ─── Fulfillment Funnel ─────────────────────────────────────────────────────

export function calculateFulfillmentFunnel(orders: RawOrder[]): FunnelStep[] {
  const total = orders.length;
  const confirmed = orders.filter((o) =>
    ["confirmed", "in_transit", "delivered", "completed"].includes(o.status),
  ).length;
  const shipped = orders.filter((o) =>
    ["in_transit", "delivered", "completed"].includes(o.status),
  ).length;
  const delivered = orders.filter((o) =>
    ["delivered", "completed"].includes(o.status),
  ).length;

  const steps = [
    { label: "New Orders", count: total, color: "var(--pastel-blue)" },
    { label: "Confirmed", count: confirmed, color: "var(--pastel-green)" },
    { label: "Shipped", count: shipped, color: "var(--pastel-yellow)" },
    { label: "Delivered", count: delivered, color: "var(--pastel-mint)" },
  ];

  return steps.map((s, i) => ({
    ...s,
    dropOffPct: i === 0 ? 0 : steps[i - 1].count > 0
      ? Math.round(((steps[i - 1].count - s.count) / steps[i - 1].count) * 100)
      : 0,
  }));
}

// ─── Growth Metrics (Week-over-Week) ────────────────────────────────────────

export function calculateGrowthMetrics(
  orders: RawOrder[],
  tenants: RawTenant[],
): GrowthMetric[] {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const currOrders = orders.filter((o) => new Date(o.created_at) >= weekAgo);
  const prevOrders = orders.filter((o) => {
    const d = new Date(o.created_at);
    return d >= twoWeeksAgo && d < weekAgo;
  });

  const revenue = (set: RawOrder[]) =>
    set.filter((o) => ["confirmed", "delivered", "completed"].includes(o.status))
      .reduce((s, o) => s + Number(o.price), 0);

  const newMerchantsCurr = tenants.filter((t) => new Date(t.created_at) >= weekAgo).length;
  const newMerchantsPrev = tenants.filter((t) => {
    const d = new Date(t.created_at);
    return d >= twoWeeksAgo && d < weekAgo;
  }).length;

  const deliveryRate = (set: RawOrder[]) => {
    const terminal = set.filter((o) => ["delivered", "completed", "rejected"].includes(o.status));
    if (!terminal.length) return 0;
    return Math.round(
      (terminal.filter((o) => ["delivered", "completed"].includes(o.status)).length / terminal.length) * 100,
    );
  };

  const pct = (curr: number, prev: number) =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;

  return [
    {
      label: "Orders",
      current: currOrders.length,
      previous: prevOrders.length,
      delta: currOrders.length - prevOrders.length,
      deltaPct: pct(currOrders.length, prevOrders.length),
      isFinancial: false,
    },
    {
      label: "Revenue",
      current: revenue(currOrders),
      previous: revenue(prevOrders),
      delta: revenue(currOrders) - revenue(prevOrders),
      deltaPct: pct(revenue(currOrders), revenue(prevOrders)),
      isFinancial: true,
    },
    {
      label: "New Merchants",
      current: newMerchantsCurr,
      previous: newMerchantsPrev,
      delta: newMerchantsCurr - newMerchantsPrev,
      deltaPct: pct(newMerchantsCurr, newMerchantsPrev),
      isFinancial: false,
    },
    {
      label: "Delivery Rate",
      current: deliveryRate(currOrders),
      previous: deliveryRate(prevOrders),
      delta: deliveryRate(currOrders) - deliveryRate(prevOrders),
      deltaPct: null,
      isFinancial: false,
      unit: "%",
    },
  ];
}

// ─── Wallet Health ──────────────────────────────────────────────────────────

export function calculateWalletHealth(
  tenants: RawTenant[],
  transactions: RawWalletTransaction[],
): WalletHealthData {
  const balances = tenants.map((t) => t.wallet_balance).sort((a, b) => a - b);

  const healthy = balances.filter((b) => b > 50000).length;
  const warning = balances.filter((b) => b >= 10000 && b <= 50000).length;
  const critical = balances.filter((b) => b < 10000).length;
  const avgBalance = balances.length ? balances.reduce((a, b) => a + b, 0) / balances.length : 0;
  const medianBalance = balances.length ? balances[Math.floor(balances.length / 2)] : 0;

  // Top-up sparkline: last 7 days
  const now = new Date();
  const topUpRateSparkline = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(now);
    day.setDate(day.getDate() - (6 - i));
    const dayKey = getDateKey(day);
    return transactions.filter(
      (t) => t.type === "topup" && t.created_at.startsWith(dayKey),
    ).length;
  });

  return { healthy, warning, critical, avgBalance, medianBalance, topUpRateSparkline };
}

// ─── Activity Heatmap (GitHub-style, 52 weeks) ─────────────────────────────

export function calculateActivityHeatmap(orders: RawOrder[]): ActivityDay[] {
  const counts: Record<string, number> = {};
  for (const o of orders) {
    const key = getDateKey(new Date(o.created_at));
    counts[key] = (counts[key] || 0) + 1;
  }

  const now = new Date();
  const days: ActivityDay[] = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = getDateKey(d);
    days.push({ date: key, count: counts[key] || 0 });
  }

  return days;
}

// ─── Revenue Breakdown ──────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, string> = {
  starter: "var(--pastel-blue)",
  growth: "var(--pastel-green)",
  professional: "var(--pastel-purple)",
  enterprise: "var(--pastel-yellow)",
};

export function calculateRevenueBreakdown(
  transactions: RawWalletTransaction[],
  tenants: RawTenant[],
  orders: RawOrder[],
): RevenueBreakdown {
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  // By plan — charges grouped by tenant's plan
  const planRevenue: Record<string, number> = {};
  for (const tx of transactions.filter((t) => t.type === "charge")) {
    const tenant = tenantMap.get(tx.tenant_id);
    const plan = tenant?.plan || "unknown";
    planRevenue[plan] = (planRevenue[plan] || 0) + Math.abs(tx.amount_iqd);
  }

  const byPlan = Object.entries(planRevenue)
    .map(([plan, value]) => ({
      label: plan.charAt(0).toUpperCase() + plan.slice(1),
      value,
      color: PLAN_COLORS[plan] || "var(--pastel-mint)",
    }))
    .sort((a, b) => b.value - a.value);

  // By city — from orders with revenue statuses
  const cityRevenue: Record<string, number> = {};
  for (const o of orders) {
    if (!o.city || !["confirmed", "delivered", "completed"].includes(o.status)) continue;
    cityRevenue[o.city] = (cityRevenue[o.city] || 0) + Number(o.price);
  }

  const cityColors = [
    "var(--pastel-blue)", "var(--pastel-green)", "var(--pastel-yellow)",
    "var(--pastel-pink)", "var(--pastel-purple)", "var(--pastel-mint)",
  ];
  const byCity = Object.entries(cityRevenue)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([city, value], i) => ({
      label: city,
      value,
      color: cityColors[i % cityColors.length],
    }));

  // By source
  const sourceRevenue: Record<string, number> = {};
  for (const o of orders) {
    if (!["confirmed", "delivered", "completed"].includes(o.status)) continue;
    const source = o.source || "direct";
    sourceRevenue[source] = (sourceRevenue[source] || 0) + Number(o.price);
  }

  const bySource = Object.entries(sourceRevenue)
    .sort(([, a], [, b]) => b - a)
    .map(([source, value], i) => ({
      label: source.charAt(0).toUpperCase() + source.slice(1),
      value,
      color: cityColors[i % cityColors.length],
    }));

  return { byPlan, byCity, bySource };
}

// ─── Plan Movements ─────────────────────────────────────────────────────────

const PLAN_RANK: Record<string, number> = {
  starter: 1, growth: 2, professional: 3, enterprise: 4,
};

export function calculatePlanMovements(changes: RawSubscriptionChange[]): PlanMovement[] {
  return changes.map((c) => {
    let type: PlanMovement["type"] = "new";
    if (c.type === "cancellation") {
      type = "cancellation";
    } else if (c.from_plan && c.to_plan) {
      type = (PLAN_RANK[c.to_plan] || 0) > (PLAN_RANK[c.from_plan] || 0)
        ? "upgrade"
        : "downgrade";
    }

    return {
      fromPlan: (c.from_plan || "new") as PlanMovement["fromPlan"],
      toPlan: (c.to_plan || "cancelled") as PlanMovement["toPlan"],
      count: 1,
      type,
    };
  });
}

// ─── Top-Up Patterns ────────────────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function calculateTopUpPatterns(transactions: RawWalletTransaction[]): TopUpPattern[] {
  const topups = transactions.filter((t) => t.type === "topup");
  const byDay: Record<number, { count: number; total: number }> = {};

  for (let i = 0; i < 7; i++) byDay[i] = { count: 0, total: 0 };

  for (const tx of topups) {
    const day = new Date(tx.created_at).getDay();
    byDay[day].count++;
    byDay[day].total += Math.abs(tx.amount_iqd);
  }

  return Object.entries(byDay).map(([day, s]) => ({
    dayOfWeek: Number(day),
    dayLabel: DAY_LABELS[Number(day)],
    count: s.count,
    avgAmount: s.count > 0 ? Math.round(s.total / s.count) : 0,
  }));
}

// ─── Merchant LTV ───────────────────────────────────────────────────────────

export function calculateMerchantLTV(
  tenants: RawTenant[],
  transactions: RawWalletTransaction[],
): { topMerchants: MerchantLTV[]; distribution: LTVDistribution[]; avgLTV: number } {
  const now = new Date();
  const revenueByTenant: Record<string, number> = {};

  for (const tx of transactions.filter((t) => t.type === "charge")) {
    revenueByTenant[tx.tenant_id] = (revenueByTenant[tx.tenant_id] || 0) + Math.abs(tx.amount_iqd);
  }

  const ltvList: MerchantLTV[] = tenants.map((t) => {
    const totalRevenue = revenueByTenant[t.id] || 0;
    const lifetimeDays = Math.max(1, daysBetween(new Date(t.created_at), now));
    const avgMonthlyRevenue = (totalRevenue / lifetimeDays) * 30;

    return {
      tenantId: t.id,
      businessName: t.business_name,
      totalRevenue,
      lifetimeDays,
      avgMonthlyRevenue,
    };
  });

  const topMerchants = [...ltvList]
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 5);

  // Distribution buckets
  const buckets = [
    { label: "0 IQD", min: 0, max: 0 },
    { label: "1-50K", min: 1, max: 50000 },
    { label: "50K-200K", min: 50001, max: 200000 },
    { label: "200K-500K", min: 200001, max: 500000 },
    { label: "500K-1M", min: 500001, max: 1000000 },
    { label: "1M+", min: 1000001, max: Infinity },
  ];

  const distribution: LTVDistribution[] = buckets.map((b) => ({
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

export function calculateTimeToFirstOrder(
  tenants: RawTenant[],
  orders: RawOrder[],
): TimeToFirstOrderBucket[] {
  // Find first order per tenant
  const firstOrderDate: Record<string, Date> = {};
  for (const o of orders) {
    const d = new Date(o.created_at);
    if (!firstOrderDate[o.tenant_id] || d < firstOrderDate[o.tenant_id]) {
      firstOrderDate[o.tenant_id] = d;
    }
  }

  const bucketDefs = [
    { label: "Same Day", min: 0, max: 0 },
    { label: "1-3 Days", min: 1, max: 3 },
    { label: "4-7 Days", min: 4, max: 7 },
    { label: "1-2 Weeks", min: 8, max: 14 },
    { label: "2-4 Weeks", min: 15, max: 28 },
    { label: "> 1 Month", min: 29, max: Infinity },
    { label: "Never", min: -1, max: -1 },
  ];

  const counts: Record<string, number> = {};
  for (const b of bucketDefs) counts[b.label] = 0;

  for (const t of tenants) {
    const first = firstOrderDate[t.id];
    if (!first) {
      counts["Never"]++;
      continue;
    }
    const days = daysBetween(new Date(t.created_at), first);
    const bucket = bucketDefs.find((b) => b.min >= 0 && days >= b.min && days <= b.max);
    if (bucket) counts[bucket.label]++;
  }

  return bucketDefs.map((b) => ({
    label: b.label,
    count: counts[b.label],
    isHighlight: b.label === "Never",
  }));
}

// ─── Onboarding Progress ────────────────────────────────────────────────────

const ONBOARDING_STEPS = [
  { key: "has_orders", label: "First Order" },
  { key: "has_team", label: "Team Member" },
  { key: "has_branding", label: "Branding" },
  { key: "has_storefront", label: "Storefront" },
  { key: "wallet_funded", label: "Wallet Funded" },
];

export function calculateOnboardingProgress(
  tenants: RawTenant[],
  orders: RawOrder[],
): TenantOnboarding[] {
  const tenantsWithOrders = new Set(orders.map((o) => o.tenant_id));

  return tenants.map((t) => {
    const completed: string[] = [];

    if (tenantsWithOrders.has(t.id)) completed.push("has_orders");
    if (t.team_members_count > 1) completed.push("has_team");
    if (t.has_branding) completed.push("has_branding");
    if (t.has_storefront) completed.push("has_storefront");
    if (t.wallet_funded) completed.push("wallet_funded");

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

export function calculateKpis(
  orders: RawOrder[],
  tenants: RawTenant[],
  transactions: RawWalletTransaction[],
): Record<string, KpiData> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Helper: daily counts for sparkline
  const dailyCounts = (items: { created_at: string }[], countFn?: (item: { created_at: string }) => number) => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(now);
      day.setDate(day.getDate() - (6 - i));
      const dayKey = getDateKey(day);
      return items
        .filter((item) => item.created_at.startsWith(dayKey))
        .reduce((sum, item) => sum + (countFn ? countFn(item) : 1), 0);
    });
  };

  // Total orders
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisMonthOrders = orders.filter((o) => new Date(o.created_at) >= thisMonthStart).length;
  const lastMonthOrders = orders.filter((o) => {
    const d = new Date(o.created_at);
    return d >= lastMonthStart && d < thisMonthStart;
  }).length;

  // Total revenue
  const revenueOrders = orders.filter((o) => ["confirmed", "delivered", "completed"].includes(o.status));
  const thisMonthRevenue = revenueOrders
    .filter((o) => new Date(o.created_at) >= thisMonthStart)
    .reduce((s, o) => s + Number(o.price), 0);
  const lastMonthRevenue = revenueOrders
    .filter((o) => {
      const d = new Date(o.created_at);
      return d >= lastMonthStart && d < thisMonthStart;
    })
    .reduce((s, o) => s + Number(o.price), 0);

  // Active rate
  const activeTenants = tenants.filter((t) => t.status === "active").length;
  const activeRate = tenants.length ? Math.round((activeTenants / tenants.length) * 100) : 0;

  // Avg order value
  const avgOrderValue = revenueOrders.length
    ? Math.round(revenueOrders.reduce((s, o) => s + Number(o.price), 0) / revenueOrders.length)
    : 0;

  // MRR from charges this month
  const thisMonthCharges = transactions
    .filter((t) => t.type === "charge" && t.created_at >= thisMonthStart.toISOString())
    .reduce((s, t) => s + Math.abs(t.amount_iqd), 0);
  const lastMonthCharges = transactions
    .filter((t) => {
      const d = t.created_at;
      return t.type === "charge" && d >= lastMonthStart.toISOString() && d < thisMonthStart.toISOString();
    })
    .reduce((s, t) => s + Math.abs(t.amount_iqd), 0);

  const pct = (curr: number, prev: number) =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;

  return {
    totalOrders: {
      label: "Total Orders",
      value: thisMonthOrders,
      previousValue: lastMonthOrders,
      delta: thisMonthOrders - lastMonthOrders,
      deltaPct: pct(thisMonthOrders, lastMonthOrders),
      sparkline: dailyCounts(orders),
    },
    totalRevenue: {
      label: "Revenue",
      value: thisMonthRevenue,
      previousValue: lastMonthRevenue,
      delta: thisMonthRevenue - lastMonthRevenue,
      deltaPct: pct(thisMonthRevenue, lastMonthRevenue),
      sparkline: dailyCounts(revenueOrders, (o) => Number((o as unknown as RawOrder).price || 0)),
      suffix: " IQD",
    },
    totalMerchants: {
      label: "Merchants",
      value: tenants.length,
      previousValue: tenants.length, // simplified
      delta: 0,
      deltaPct: null,
      sparkline: dailyCounts(tenants),
    },
    activeRate: {
      label: "Active Rate",
      value: activeRate,
      previousValue: activeRate,
      delta: 0,
      deltaPct: null,
      sparkline: [activeRate, activeRate, activeRate, activeRate, activeRate, activeRate, activeRate],
      suffix: "%",
    },
    avgOrderValue: {
      label: "Avg Order Value",
      value: avgOrderValue,
      previousValue: avgOrderValue,
      delta: 0,
      deltaPct: null,
      sparkline: [],
      suffix: " IQD",
    },
    mrr: {
      label: "MRR",
      value: thisMonthCharges,
      previousValue: lastMonthCharges,
      delta: thisMonthCharges - lastMonthCharges,
      deltaPct: pct(thisMonthCharges, lastMonthCharges),
      sparkline: dailyCounts(
        transactions.filter((t) => t.type === "charge"),
        (t) => Math.abs((t as unknown as RawWalletTransaction).amount_iqd || 0),
      ),
      suffix: " IQD",
    },
  };
}

// ─── Platform Order Stats ───────────────────────────────────────────────────

export function calculatePlatformOrderStats(orders: RawOrder[]): PlatformOrderStat[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const todayOrders = orders.filter((o) => new Date(o.created_at) >= todayStart).length;
  const yesterdayOrders = orders.filter((o) => {
    const d = new Date(o.created_at);
    return d >= yesterdayStart && d < todayStart;
  }).length;

  const thisWeekOrders = orders.filter((o) => new Date(o.created_at) >= weekAgo).length;
  const lastWeekOrders = orders.filter((o) => {
    const d = new Date(o.created_at);
    return d >= twoWeeksAgo && d < weekAgo;
  }).length;

  const thisMonthOrders = orders.filter((o) => new Date(o.created_at) >= monthStart).length;
  const lastMonthOrders = orders.filter((o) => {
    const d = new Date(o.created_at);
    return d >= lastMonthStart && d < monthStart;
  }).length;

  const pct = (curr: number, prev: number) =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;

  return [
    {
      label: "Today",
      value: todayOrders,
      previousValue: yesterdayOrders,
      delta: todayOrders - yesterdayOrders,
      deltaPct: pct(todayOrders, yesterdayOrders),
    },
    {
      label: "This Week",
      value: thisWeekOrders,
      previousValue: lastWeekOrders,
      delta: thisWeekOrders - lastWeekOrders,
      deltaPct: pct(thisWeekOrders, lastWeekOrders),
    },
    {
      label: "This Month",
      value: thisMonthOrders,
      previousValue: lastMonthOrders,
      delta: thisMonthOrders - lastMonthOrders,
      deltaPct: pct(thisMonthOrders, lastMonthOrders),
    },
    {
      label: "All Time",
      value: orders.length,
      previousValue: orders.length,
      delta: 0,
      deltaPct: null,
    },
  ];
}
