"use client";

import { cn } from "@/lib/utils";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { formatCount, formatIQD } from "@/lib/format";
import { useLeadAnalytics } from "@/hooks/use-lead-analytics";
import { LoadError } from "@/components/shared/load-error";
import {
  LEAD_STATUS_CONFIG,
  LEAD_STATUS_UI,
  LEAD_TIER_CONFIG,
  LEAD_TIER_UI,
  PLATFORM_CONFIG,
} from "@/types/leads";
import type { LeadStatus, LeadTier } from "@/types/leads";
import {
  BarChart3,
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
  const { data, isError, error, refetch, isFetching } = useLeadAnalytics();

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header: the menu calls this page Lead numbers (board n3, one name). */}
      <div>
        <h1 className="text-[22px] font-semibold text-foreground">Lead numbers</h1>
        <p className="text-xs text-foreground/70">Every lead together: where they stand, where they came from, how many became shops.</p>
      </div>

      {/* Content */}
      {isError ? (
        <LoadError what="the lead numbers" error={error} onRetry={() => refetch()} retrying={isFetching} />
      ) : !data ? (
        <LoadingState />
      ) : data.total_leads === 0 ? (
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
      {/* ── Headline numbers, one surface (board v6) ───────────── */}
      <NumberStrip columns={4} label="Lead numbers">
        <NumberCell label="Leads, now" value={formatCount(data.total_leads)} />
        <NumberCell label="Became a shop, all time" value={`${data.conversion_rate.toFixed(1)}%`} note="of all leads" />
        <NumberCell
          label="Days from lead to shop, average"
          value={
            data.avg_time_to_convert_days === null
              ? "None yet"
              : `${data.avg_time_to_convert_days} ${data.avg_time_to_convert_days === 1 ? "day" : "days"}`
          }
          note={data.avg_time_to_convert_days === null ? "No lead has become a shop yet" : undefined}
        />
        {/* The sum leaves out converted and lost leads (api/leads/analytics), and each lead gives its monthly sales. */}
        <NumberCell label="Est. monthly sales, open leads" value={formatIQD(data.total_estimated_revenue)} />
      </NumberStrip>

      {/* ── Pipeline Funnel ──────────────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
        <h2 className="text-sm font-bold text-[var(--foreground)] uppercase tracking-wider mb-5">
          Pipeline Funnel
        </h2>
        <div className="flex items-end gap-3">
          {STATUS_ORDER.map((status) => {
            const count = data.by_status[status] ?? 0;
            const cfg = LEAD_STATUS_CONFIG[status];

            return (
              <div key={status} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-sm font-bold text-[var(--foreground)]">
                  {count}
                </span>
                <div
                  className="w-full rounded-lg transition-all"
                  style={{
                    height: `${Math.max((count / maxStatus) * 120, 12)}px`,
                    backgroundColor: LEAD_STATUS_UI[status].solid,
                  }}
                />
                <span className="text-xs font-semibold text-center leading-tight text-foreground/70">
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
                  <span className="text-xs font-medium text-[var(--muted)] w-20 truncate text-right" title={label}>
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
                      className="h-full flex items-center justify-center text-xs font-bold transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: LEAD_TIER_UI[tier].strong,
                        color: LEAD_TIER_UI[tier].solid,
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
                          style={{ backgroundColor: LEAD_TIER_UI[tier].solid }}
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
                  <span className="text-xs font-medium text-[var(--muted)] w-32 truncate text-right" title={entry.industry_name}>
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
                  <span className="text-xs text-[var(--muted)] w-12 text-right">
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
                <span className="text-xs text-[var(--muted)] font-medium mt-1 truncate w-full text-center" title={formatMonth(month.month)}>
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
              {/* In the server's order: most made shops, then most leads added. */}
              {data.top_employees.map((emp, idx) => (
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
                        <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-bold text-foreground">
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
                      <span className="font-bold text-[var(--ink-green)]">
                        {emp.leads_converted}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-semibold text-[var(--ink-violet)]">
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

// ── Helpers ───────────────────────────────────────────────────────────

const MONTH = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });

/** "2026-11" -> "Nov". The month is a calendar month, not an instant: read and named in UTC, it cannot shift. */
function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-").map(Number);
  if (!year || !month) return monthStr;
  return MONTH.format(Date.UTC(year, month - 1, 1));
}
