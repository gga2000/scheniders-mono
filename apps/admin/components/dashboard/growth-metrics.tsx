"use client";

import { TrendingUp } from "lucide-react";
import type { GrowthMetric } from "@/types/dashboard";

interface GrowthMetricsProps {
  growth: GrowthMetric[] | undefined;
}

function formatNumber(metric: GrowthMetric, value: number | null, withCurrency = true): string {
  if (value === null) return "\u2014";
  if (metric.isFinancial) {
    return new Intl.NumberFormat("en-IQ").format(value) + (withCurrency ? " IQD" : "");
  }
  if (metric.unit === "%") {
    return value.toFixed(1) + "%";
  }
  return new Intl.NumberFormat("en-IQ").format(value);
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
          Last 7 days vs the 7 before
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
          {growth.map((metric) => {
            const isPositive = metric.delta >= 0;
            return (
              <div
                key={metric.label}
                className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4"
              >
                <p className="text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-2">
                  {metric.label}
                </p>
                <p className="text-xl font-bold text-foreground tracking-tight">
                  {formatNumber(metric, metric.current)}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-foreground/40">
                    {metric.current === null && metric.emptyNote
                      ? metric.emptyNote
                      : `before: ${formatNumber(metric, metric.previous, false)}`}
                  </span>
                  {metric.deltaPct !== null && (
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold ${
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
