"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE_CHROME } from "@/lib/animation-constants";
import type { Lead } from "@/types/leads";
import {
  LEAD_STATUS_CONFIG,
  LEAD_TIER_CONFIG,
  PLATFORM_CONFIG,
} from "@/types/leads";

interface LeadComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadA: Lead | null;
  leadB: Lead | null;
  onSelectLead: (position: "a" | "b") => void;
}

interface MetricDef {
  key: string;
  label: string;
  getValue: (lead: Lead) => string | number;
  getRawValue?: (lead: Lead) => number;
  higherIsBetter?: boolean;
  isNumeric?: boolean;
  maxValue?: number;
}

function engagementRate(lead: Lead): number {
  if (lead.follower_count <= 0) return 0;
  return ((lead.avg_like_count + lead.avg_comments_count) / lead.follower_count) * 100;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return new Intl.NumberFormat("en-IQ").format(n);
}

const METRICS: MetricDef[] = [
  {
    key: "merchant_name",
    label: "Merchant Name",
    getValue: (l) => l.merchant_name,
  },
  {
    key: "platform",
    label: "Platform",
    getValue: (l) => PLATFORM_CONFIG[l.platform].label,
  },
  {
    key: "follower_count",
    label: "Followers",
    getValue: (l) => formatNumber(l.follower_count),
    getRawValue: (l) => l.follower_count,
    higherIsBetter: true,
    isNumeric: true,
  },
  {
    key: "lead_score",
    label: "Lead Score",
    getValue: (l) => l.lead_score,
    getRawValue: (l) => l.lead_score,
    higherIsBetter: true,
    isNumeric: true,
    maxValue: 100,
  },
  {
    key: "tier",
    label: "Tier",
    getValue: (l) => LEAD_TIER_CONFIG[l.tier].label,
  },
  {
    key: "estimated_daily_orders",
    label: "Est. Daily Orders",
    getValue: (l) => l.estimated_daily_orders,
    getRawValue: (l) => l.estimated_daily_orders,
    higherIsBetter: true,
    isNumeric: true,
  },
  {
    key: "estimated_monthly_revenue",
    label: "Est. Monthly Revenue",
    getValue: (l) => `${formatNumber(l.estimated_monthly_revenue)} IQD`,
    getRawValue: (l) => l.estimated_monthly_revenue,
    higherIsBetter: true,
    isNumeric: true,
  },
  {
    key: "engagement_rate",
    label: "Engagement Rate",
    getValue: (l) => `${engagementRate(l).toFixed(1)}%`,
    getRawValue: (l) => engagementRate(l),
    higherIsBetter: true,
    isNumeric: true,
    maxValue: 20,
  },
  {
    key: "status",
    label: "Status",
    getValue: (l) => LEAD_STATUS_CONFIG[l.status].label,
  },
  {
    key: "city",
    label: "City",
    getValue: (l) => l.city || "\u2014",
  },
];

function ComparisonBar({
  valueA,
  valueB,
  maxValue,
  higherIsBetter,
}: {
  valueA: number;
  valueB: number;
  maxValue: number;
  higherIsBetter: boolean;
}) {
  const cappedMax = maxValue || Math.max(valueA, valueB, 1);
  const pctA = Math.min((valueA / cappedMax) * 100, 100);
  const pctB = Math.min((valueB / cappedMax) * 100, 100);

  const aWins = higherIsBetter ? valueA > valueB : valueA < valueB;
  const bWins = higherIsBetter ? valueB > valueA : valueB < valueA;
  const tie = valueA === valueB;

  return (
    <div className="flex items-center gap-3 w-full">
      {/* Bar A (grows right-to-left) */}
      <div className="flex-1 flex justify-end">
        <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden relative">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pctA}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={cn(
              "absolute right-0 top-0 h-full rounded-full",
              tie
                ? "bg-zinc-400"
                : aWins
                  ? "bg-emerald-500"
                  : "bg-zinc-400"
            )}
          />
        </div>
      </div>
      {/* Bar B (grows left-to-right) */}
      <div className="flex-1">
        <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pctB}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={cn(
              "h-full rounded-full",
              tie
                ? "bg-zinc-400"
                : bWins
                  ? "bg-emerald-500"
                  : "bg-zinc-400"
            )}
          />
        </div>
      </div>
    </div>
  );
}

export function LeadComparisonModal({
  isOpen,
  onClose,
  leadA,
  leadB,
  onSelectLead,
}: LeadComparisonModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.2, ease: EASE_CHROME }}
            className="fixed top-[5%] left-1/2 -translate-x-1/2 z-[201] w-full max-w-4xl max-h-[90vh] overflow-y-auto"
          >
            <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="w-4 h-4 text-[var(--muted)]" />
                  <h2 className="text-sm font-semibold text-[var(--foreground)]">
                    Compare Leads
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--card-border)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_1fr] gap-0 px-6 py-4 border-b border-[var(--card-border)]">
                {/* Lead A header */}
                <div className="text-center">
                  {leadA ? (
                    <div>
                      <div className="text-sm font-bold text-[var(--foreground)] truncate">
                        {leadA.merchant_name}
                      </div>
                      <div className="text-xs text-[var(--muted)] mt-0.5">
                        {PLATFORM_CONFIG[leadA.platform].label} &middot;{" "}
                        {LEAD_TIER_CONFIG[leadA.tier].label}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSelectLead("a")}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-dashed border-[var(--card-border)] text-sm font-medium text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
                    >
                      Select Lead A
                    </button>
                  )}
                </div>

                {/* VS divider */}
                <div className="flex items-center justify-center px-4">
                  <span className="text-xs font-bold text-[var(--muted)] uppercase tracking-widest">
                    vs
                  </span>
                </div>

                {/* Lead B header */}
                <div className="text-center">
                  {leadB ? (
                    <div>
                      <div className="text-sm font-bold text-[var(--foreground)] truncate">
                        {leadB.merchant_name}
                      </div>
                      <div className="text-xs text-[var(--muted)] mt-0.5">
                        {PLATFORM_CONFIG[leadB.platform].label} &middot;{" "}
                        {LEAD_TIER_CONFIG[leadB.tier].label}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSelectLead("b")}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 border-dashed border-[var(--card-border)] text-sm font-medium text-[var(--muted)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
                    >
                      Select Lead B
                    </button>
                  )}
                </div>
              </div>

              {/* Comparison rows */}
              {leadA && leadB ? (
                <div className="divide-y divide-[var(--card-border)]">
                  {METRICS.map((metric) => {
                    const valA = metric.getValue(leadA);
                    const valB = metric.getValue(leadB);
                    const rawA = metric.getRawValue?.(leadA) ?? 0;
                    const rawB = metric.getRawValue?.(leadB) ?? 0;

                    const isNumeric = metric.isNumeric && metric.getRawValue;
                    const aWins = metric.higherIsBetter
                      ? rawA > rawB
                      : rawA < rawB;
                    const bWins = metric.higherIsBetter
                      ? rawB > rawA
                      : rawB < rawA;
                    const tie = rawA === rawB;

                    return (
                      <div
                        key={metric.key}
                        className="grid grid-cols-[1fr_auto_1fr] gap-0 px-6 py-3 items-center"
                      >
                        {/* Value A */}
                        <div className="text-center">
                          <span
                            className={cn(
                              "text-sm",
                              isNumeric && !tie && aWins
                                ? "font-bold text-emerald-600 dark:text-emerald-400"
                                : isNumeric && !tie && bWins
                                  ? "text-[var(--muted)]"
                                  : "text-[var(--foreground)]"
                            )}
                          >
                            {valA}
                          </span>
                        </div>

                        {/* Label + optional bars */}
                        <div className="w-48 text-center px-3">
                          <div className="text-xs font-medium text-[var(--muted)] mb-1">
                            {metric.label}
                          </div>
                          {isNumeric && (
                            <ComparisonBar
                              valueA={rawA}
                              valueB={rawB}
                              maxValue={metric.maxValue || Math.max(rawA, rawB, 1)}
                              higherIsBetter={metric.higherIsBetter ?? true}
                            />
                          )}
                        </div>

                        {/* Value B */}
                        <div className="text-center">
                          <span
                            className={cn(
                              "text-sm",
                              isNumeric && !tie && bWins
                                ? "font-bold text-emerald-600 dark:text-emerald-400"
                                : isNumeric && !tie && aWins
                                  ? "text-[var(--muted)]"
                                  : "text-[var(--foreground)]"
                            )}
                          >
                            {valB}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-6 py-16 text-center">
                  <p className="text-sm text-[var(--muted)]">
                    Select both leads to see a side-by-side comparison.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
