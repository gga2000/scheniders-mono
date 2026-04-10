import type { PlanTier, TenantStatus } from "./admin";

// ─── KPI Stats ──────────────────────────────────────────────────────────────
export interface KpiData {
  label: string;
  value: number;
  previousValue: number;
  delta: number;
  deltaPct: number | null;
  sparkline: number[]; // last 7 days
  prefix?: string;
  suffix?: string;
}

// ─── Order Pipeline ─────────────────────────────────────────────────────────
export interface PipelineStage {
  status: string;
  label: string;
  count: number;
  color: string;
  pct: number;
}

// ─── Leaderboard ────────────────────────────────────────────────────────────
export interface LeaderboardEntry {
  tenantId: string;
  businessName: string;
  primaryColor: string;
  orderCount: number;
  revenue: number;
  sparkline: number[]; // last 7 days order counts
}

// ─── Geographic Heatmap ─────────────────────────────────────────────────────
export interface GeoStats {
  governorateCode: string;
  orderCount: number;
  revenue: number;
}

// ─── Peak Hours Heatmap ─────────────────────────────────────────────────────
export interface HeatmapCell {
  dayOfWeek: number; // 0=Sun
  hour: number;
  count: number;
  intensity: number; // 0–1 normalized
}

// ─── Fulfillment Funnel ─────────────────────────────────────────────────────
export interface FunnelStep {
  label: string;
  count: number;
  dropOffPct: number;
  color: string;
}

// ─── Growth Metrics (Week-over-Week) ────────────────────────────────────────
export interface GrowthMetric {
  label: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
  isFinancial: boolean;
  unit?: string;
}

// ─── Wallet Health ──────────────────────────────────────────────────────────
export interface WalletHealthData {
  healthy: number;   // >50K IQD
  warning: number;   // 10K-50K
  critical: number;  // <10K
  avgBalance: number;
  medianBalance: number;
  topUpRateSparkline: number[]; // daily top-up counts, last 7 days
}

// ─── Activity Heatmap (GitHub-style) ────────────────────────────────────────
export interface ActivityDay {
  date: string; // YYYY-MM-DD
  count: number;
}

// ─── Revenue Breakdown ──────────────────────────────────────────────────────
export interface RevenueSlice {
  label: string;
  value: number;
  color: string;
}

export interface RevenueBreakdown {
  byPlan: RevenueSlice[];
  byCity: RevenueSlice[];
  bySource: RevenueSlice[];
}

// ─── Plan Movement ──────────────────────────────────────────────────────────
export interface PlanMovement {
  fromPlan: PlanTier | "new" | "cancelled";
  toPlan: PlanTier | "cancelled";
  count: number;
  type: "upgrade" | "downgrade" | "cancellation" | "new";
}

// ─── Top-Up Patterns ────────────────────────────────────────────────────────
export interface TopUpPattern {
  dayOfWeek: number; // 0=Sun
  dayLabel: string;
  count: number;
  avgAmount: number;
}

// ─── Merchant LTV ───────────────────────────────────────────────────────────
export interface MerchantLTV {
  tenantId: string;
  businessName: string;
  totalRevenue: number;
  lifetimeDays: number;
  avgMonthlyRevenue: number;
}

export interface LTVDistribution {
  bucket: string;
  count: number;
  minValue: number;
  maxValue: number;
}

// ─── Time to First Order ────────────────────────────────────────────────────
export interface TimeToFirstOrderBucket {
  label: string;
  count: number;
  isHighlight: boolean; // "never" bucket highlighted in red
}

// ─── Onboarding Progress ────────────────────────────────────────────────────
export interface OnboardingStep {
  key: string;
  label: string;
  icon: string;
}

export interface TenantOnboarding {
  tenantId: string;
  businessName: string;
  primaryColor: string;
  completedSteps: string[];
  totalSteps: number;
  completionPct: number;
}

// ─── Platform Order Stats ───────────────────────────────────────────────────
export interface PlatformOrderStat {
  label: string;
  value: number;
  previousValue: number;
  delta: number;
  deltaPct: number | null;
}

// ─── Full V2 Dashboard Response ─────────────────────────────────────────────
export interface DashboardV2Stats {
  // KPIs
  kpis: {
    totalOrders: KpiData;
    totalRevenue: KpiData;
    totalMerchants: KpiData;
    activeRate: KpiData;
    avgOrderValue: KpiData;
    mrr: KpiData;
  };

  // Platform order stats
  platformStats: PlatformOrderStat[];

  // Widgets
  pipeline: PipelineStage[];
  topMerchants: LeaderboardEntry[];
  geoStats: GeoStats[];
  peakHours: HeatmapCell[];
  funnel: FunnelStep[];
  growth: GrowthMetric[];
  walletHealth: WalletHealthData;
  activityHeatmap: ActivityDay[];
  revenueBreakdown: RevenueBreakdown;
  planMovements: PlanMovement[];
  topUpPatterns: TopUpPattern[];
  merchantLTV: {
    topMerchants: MerchantLTV[];
    distribution: LTVDistribution[];
    avgLTV: number;
  };
  timeToFirstOrder: TimeToFirstOrderBucket[];
  onboarding: TenantOnboarding[];
}
