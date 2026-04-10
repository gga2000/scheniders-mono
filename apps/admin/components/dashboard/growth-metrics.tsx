"use client";

import { TrendingUp } from "lucide-react";
import type { GrowthMetric } from "@/types/dashboard";

interface GrowthMetricsProps {
  growth: GrowthMetric[] | undefined;
}

function formatValue(metric: GrowthMetric): string {
  if (metric.isFinancial) {
    return new Intl.NumberFormat("en-IQ").format(metric.current) + " IQD";
  }
  if (metric.unit === "%") {
    return metric.current.toFixed(1) + "%";
  }
  return new Intl.NumberFormat("en-IQ").format(metric.current);
}

function formatPrevious(metric: GrowthMetric): string {
  if (metric.isFinancial) {
    return new Intl.NumberFormat("en-IQ").format(metric.previous) + " IQD";
  }
  if (metric.unit === "%") {
    return metric.previous.toFixed(1) + "%";
  }
  return new Intl.NumberFormat("en-IQ").format(metric.previous);
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[var(--card-border)] p-4 animate-pulse">
      <div className="h-3 w-20 rounded bg-foreground/[0.08] mb-3" />
      <div className="h-6 w-24 rounded-lg bg-foreground/[0.1] mb-2" />
      <div className="h-3 w-16 rounded bg-foreground/[0.06]" />
    </div>
  );
}

export function GrowthMetrics({ growth }: GrowthMetricsProps) {
  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[var(--pastel-green)]/40 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-green-700" />
        </div>
        <h3 className="font-bold text-foreground text-sm">
          Growth (Week over Week)
        </h3>
      </div>

      {!growth ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : growth.length === 0 ? (
        <p className="text-sm text-foreground/40 py-6 text-center">
          No growth data available.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {growth.map((metric, i) => {
            const isPositive = metric.delta >= 0;
            const gradients = [
              "bg-gradient-to-br from-blue-50/80 to-blue-100/40 dark:from-blue-950/20 dark:to-blue-900/10",
              "bg-gradient-to-br from-green-50/80 to-green-100/40 dark:from-green-950/20 dark:to-green-900/10",
              "bg-gradient-to-br from-purple-50/80 to-purple-100/40 dark:from-purple-950/20 dark:to-purple-900/10",
              "bg-gradient-to-br from-amber-50/80 to-amber-100/40 dark:from-amber-950/20 dark:to-amber-900/10",
            ];
            return (
              <div
                key={metric.label}
                className={`rounded-2xl border border-[var(--card-border)] p-4 ${gradients[i] || gradients[0]}`}
              >
                <p className="text-[11px] font-semibold text-foreground/50 uppercase tracking-wider mb-2">
                  {metric.label}
                </p>
                <p className="text-xl font-bold text-foreground tracking-tight">
                  {formatValue(metric)}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-foreground/40">
                    prev: {formatPrevious(metric)}
                  </span>
                  {metric.deltaPct !== null && (
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isPositive
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {metric.deltaPct.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
