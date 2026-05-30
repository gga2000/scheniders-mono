"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import { useLeadAnalytics } from "@/hooks/use-lead-analytics";
import {
  LEAD_STATUS_CONFIG,
  LEAD_TIER_CONFIG,
  PLATFORM_CONFIG,
} from "@/types/leads";
import type { LeadStatus, LeadTier } from "@/types/leads";
import {
  ArrowLeft,
  BarChart3,
  Users,
  TrendingUp,
  Clock,
  DollarSign,
  Medal,
} from "lucide-react";

// ── Status pipeline order ─────────────────────────────────────────────

const STATUS_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "interested",
  "store_built",
  "converted",
  "lost",
];

const TIER_ORDER: LeadTier[] = [
  "bronze",
  "silver",
  "gold",
  "diamond",
  "legendary",
];

// ── Medal colors for top 3 ────────────────────────────────────────────

const MEDAL_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"] as const;

// ── Loading skeleton ──────────────────────────────────────────────────

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] animate-pulse",
        className
      )}
    />
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="h-28" />
        ))}
      </div>
      {/* Funnel */}
      <SkeletonCard className="h-48" />
      {/* Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-64" />
      </div>
      {/* Industry */}
      <SkeletonCard className="h-64" />
      {/* Trends */}
      <SkeletonCard className="h-72" />
      {/* Table */}
      <SkeletonCard className="h-64" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center mb-4">
        <BarChart3 className="w-8 h-8 text-[var(--muted)]" />
      </div>
      <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">
        No analytics data yet
      </h3>
      <p className="text-sm text-[var(--muted)] max-w-sm">
        Start adding leads to your pipeline to see analytics and insights here.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

export default function LeadAnalyticsPage() {
  const { data, isLoading } = useLeadAnalytics();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/leads"
          className="w-9 h-9 rounded-xl border border-[var(--card-border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#60A5FA]/20 to-[#A78BFA]/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-[#60A5FA]" />
            </div>
            Lead Analytics
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Pipeline insights and performance metrics
          </p>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : !data || data.total_leads === 0 ? (
        <EmptyState />
      ) : (
        <AnalyticsDashboard data={data} />
      )}
    </div>
  );
}

// ── Dashboard content (when data exists) ──────────────────────────────

function AnalyticsDashboard({
  data,
}: {
  data: NonNullable<ReturnType<typeof useLeadAnalytics>["data"]>;
}) {
  const maxStatus = Math.max(
    ...STATUS_ORDER.map((s) => data.by_status[s] ?? 0),
    1
  );

  const platformEntries = Object.entries(data.by_platform)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  const maxPlatform = Math.max(...platformEntries.map(([, c]) => c), 1);

  const totalTierLeads = TIER_ORDER.reduce(
    (sum, t) => sum + (data.by_tier[t] ?? 0),
    0
  );

  const industryEntries = [...data.by_industry].sort(
    (a, b) => b.count - a.count
  );
  const maxIndustry = Math.max(...industryEntries.map((i) => i.count), 1);

  const trendMax = Math.max(
    ...data.monthly_trends.map((m) => Math.max(m.added, m.converted)),
    1
  );

  return (
    <div className="space-y-6">
      {/* ── KPI Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Leads"
          value={data.total_leads.toLocaleString()}
          icon={<Users className="w-5 h-5" />}
          iconColor="#60A5FA"
          iconBg="rgba(96,165,250,0.15)"
        />
        <KpiCard
          label="Conversion Rate"
          value={`${data.conversion_rate.toFixed(1)}%`}
          icon={<TrendingUp className="w-5 h-5" />}
          iconColor="#34D399"
          iconBg="rgba(52,211,153,0.15)"
          valueColor="#34D399"
        />
        <KpiCard
          label="Avg Time to Convert"
          value={`${data.avg_time_to_convert_days.toFixed(1)} days`}
          icon={<Clock className="w-5 h-5" />}
          iconColor="#60A5FA"
          iconBg="rgba(96,165,250,0.15)"
          valueColor="#60A5FA"
        />
        <KpiCard
          label="Total Est. Revenue"
          value={formatIQD(data.total_estimated_revenue)}
          icon={<DollarSign className="w-5 h-5" />}
          iconColor="#A78BFA"
          iconBg="rgba(167,139,250,0.15)"
          valueColor="#A78BFA"
        />
      </div>

      {/* ── Pipeline Funnel ──────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
        <h2 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider mb-5">
          Pipeline Funnel
        </h2>
        <div className="flex items-end gap-3">
          {STATUS_ORDER.map((status) => {
            const count = data.by_status[status] ?? 0;
            const cfg = LEAD_STATUS_CONFIG[status];
            const widthPct = Math.max((count / maxStatus) * 100, 8);

            return (
              <div key={status} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-sm font-bold text-[var(--foreground)]">
                  {count}
                </span>
                <div
                  className="w-full rounded-lg transition-all"
                  style={{
                    height: `${Math.max((count / maxStatus) * 120, 12)}px`,
                    backgroundColor: cfg.color,
                    opacity: 0.85,
                  }}
                />
                <span
                  className="text-[11px] font-semibold text-center leading-tight"
                  style={{ color: cfg.color }}
                >
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Distribution Charts (2 col) ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By Platform */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
          <h2 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider mb-5">
            By Platform
          </h2>
          <div className="space-y-3">
            {platformEntries.map(([platform, count]) => {
              const cfg =
                PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG];
              const barColor = cfg?.color ?? "#6B7280";
              const label = cfg?.label ?? platform;

              return (
                <div key={platform} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-[var(--muted)] w-20 truncate text-right">
                    {label}
                  </span>
                  <div className="flex-1 h-6 rounded-md bg-[var(--card-border)] overflow-hidden relative">
                    <div
                      className="h-full rounded-md transition-all"
                      style={{
                        width: `${(count / maxPlatform) * 100}%`,
                        backgroundColor: barColor,
                        opacity: 0.8,
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold text-[var(--foreground)] w-8 text-right">
                    {count}
                  </span>
                </div>
              );
            })}
            {platformEntries.length === 0 && (
              <p className="text-sm text-[var(--muted)] text-center py-4">
                No platform data
              </p>
            )}
          </div>
        </div>

        {/* By Tier */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
          <h2 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider mb-5">
            By Tier
          </h2>
          {/* Stacked horizontal bar */}
          {totalTierLeads > 0 ? (
            <>
              <div className="flex h-10 rounded-xl overflow-hidden mb-5">
                {TIER_ORDER.map((tier) => {
                  const count = data.by_tier[tier] ?? 0;
                  if (count === 0) return null;
                  const cfg = LEAD_TIER_CONFIG[tier];
                  const pct = (count / totalTierLeads) * 100;

                  return (
                    <div
                      key={tier}
                      className="h-full flex items-center justify-center text-[10px] font-bold transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: cfg.color,
                        color: tier === "bronze" || tier === "gold" || tier === "legendary" ? "#000" : "#fff",
                        minWidth: count > 0 ? "28px" : 0,
                      }}
                      title={`${cfg.label}: ${count}`}
                    >
                      {pct > 8 ? count : ""}
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="space-y-2.5">
                {TIER_ORDER.map((tier) => {
                  const count = data.by_tier[tier] ?? 0;
                  const cfg = LEAD_TIER_CONFIG[tier];
                  const pct =
                    totalTierLeads > 0
                      ? ((count / totalTierLeads) * 100).toFixed(1)
                      : "0";

                  return (
                    <div key={tier} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-sm"
                          style={{ backgroundColor: cfg.color }}
                        />
                        <span className="text-xs font-medium text-[var(--foreground)]">
                          {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[var(--muted)]">{pct}%</span>
                        <span className="text-xs font-bold text-[var(--foreground)] w-6 text-right">
                          {count}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)] text-center py-4">
              No tier data
            </p>
          )}
        </div>
      </div>

      {/* ── Industry Breakdown ───────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
        <h2 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider mb-5">
          Industry Breakdown
        </h2>
        {industryEntries.length > 0 ? (
          <div className="space-y-3">
            {industryEntries.map((entry) => {
              const pct =
                data.total_leads > 0
                  ? ((entry.count / data.total_leads) * 100).toFixed(1)
                  : "0";

              return (
                <div key={entry.industry_name} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-[var(--muted)] w-32 truncate text-right">
                    {entry.industry_name}
                  </span>
                  <div className="flex-1 h-6 rounded-md bg-[var(--card-border)] overflow-hidden relative">
                    <div
                      className="h-full rounded-md bg-[var(--primary)] transition-all"
                      style={{
                        width: `${(entry.count / maxIndustry) * 100}%`,
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold text-[var(--foreground)] w-8 text-right">
                    {entry.count}
                  </span>
                  <span className="text-[11px] text-[var(--muted)] w-12 text-right">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)] text-center py-4">
            No industry data
          </p>
        )}
      </div>

      {/* ── Monthly Trends ───────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
        <h2 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider mb-2">
          Monthly Trends
        </h2>
        <div className="flex items-center gap-5 mb-5">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#60A5FA]" />
            <span className="text-xs text-[var(--muted)]">Added</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-[#34D399]" />
            <span className="text-xs text-[var(--muted)]">Converted</span>
          </div>
        </div>

        {data.monthly_trends.length > 0 ? (
          <div className="flex items-end gap-2 h-44">
            {data.monthly_trends.map((month) => (
              <div
                key={month.month}
                className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
              >
                <div className="flex items-end gap-1 flex-1 w-full justify-center">
                  {/* Added bar */}
                  <div
                    className="w-[40%] rounded-t-md bg-[#60A5FA] transition-all"
                    style={{
                      height: `${Math.max((month.added / trendMax) * 100, 4)}%`,
                      opacity: 0.8,
                    }}
                    title={`Added: ${month.added}`}
                  />
                  {/* Converted bar */}
                  <div
                    className="w-[40%] rounded-t-md bg-[#34D399] transition-all"
                    style={{
                      height: `${Math.max((month.converted / trendMax) * 100, 4)}%`,
                      opacity: 0.8,
                    }}
                    title={`Converted: ${month.converted}`}
                  />
                </div>
                <span className="text-[10px] text-[var(--muted)] font-medium mt-1 truncate w-full text-center">
                  {formatMonth(month.month)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)] text-center py-8">
            No trend data yet
          </p>
        )}
      </div>

      {/* ── Top Employees Table ───────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--card-border)]">
          <h2 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider">
            Top Employees
          </h2>
        </div>

        {data.top_employees.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="py-3 px-6 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider w-12">
                  #
                </th>
                <th className="py-3 px-4 text-left text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
                  Name
                </th>
                <th className="py-3 px-4 text-right text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
                  Leads Added
                </th>
                <th className="py-3 px-4 text-right text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
                  Converted
                </th>
                <th className="py-3 px-4 text-right text-xs font-bold text-[var(--muted)] uppercase tracking-wider">
                  Commission
                </th>
              </tr>
            </thead>
            <tbody>
              {data.top_employees
                .sort((a, b) => b.leads_converted - a.leads_converted)
                .map((emp, idx) => (
                  <tr
                    key={emp.user_id}
                    className="border-b border-[var(--card-border)] last:border-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3 px-6">
                      {idx < 3 ? (
                        <Medal
                          className="w-5 h-5"
                          style={{ color: MEDAL_COLORS[idx] }}
                        />
                      ) : (
                        <span className="text-xs font-medium text-[var(--muted)]">
                          {idx + 1}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--primary)] to-[#A78BFA] flex items-center justify-center text-xs font-bold text-white">
                          {(emp.display_name ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-[var(--foreground)]">
                          {emp.display_name ?? "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-[var(--foreground)]">
                      {emp.leads_added}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-bold text-[#34D399]">
                        {emp.leads_converted}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-semibold text-[#A78BFA]">
                        {formatIQD(emp.commission_earned)}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-[var(--muted)]">
              No employee data available
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── KPI Card component ────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  iconColor,
  iconBg,
  valueColor,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 flex items-start gap-4">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--muted)] mb-1">{label}</p>
        <p
          className="text-xl font-bold truncate"
          style={{ color: valueColor ?? "var(--foreground)" }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatMonth(monthStr: string): string {
  // Expects "YYYY-MM" or similar
  try {
    const [year, month] = monthStr.split("-");
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleString("en", { month: "short" });
  } catch {
    return monthStr;
  }
}
