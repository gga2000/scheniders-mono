"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";
import type { StaffAction } from "@/types/leads";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { formatDayKey } from "@/lib/format";
import { useLiveTick } from "@/hooks/use-live-tick";

interface TeamPerformanceChartProps {
  employeeId?: string;
  actions?: StaffAction[];
}

// Days on the Baghdad calendar, as every day in the console is counted, so a
// staff member whose browser runs another clock sees the same buckets.
const BAGHDAD = "Asia/Baghdad";
const DAY_MS = 24 * 60 * 60 * 1000;

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: BAGHDAD });
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: BAGHDAD });
}

export function TeamPerformanceChart({
  actions = [],
}: TeamPerformanceChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const now = useLiveTick();

  const chartData = useMemo(() => {
    const days: { key: string; label: string; shortLabel: string; count: number }[] = [];

    // 14 Baghdad days, today last (Iraq keeps one offset all year).
    for (let i = 13; i >= 0; i--) {
      const date = new Date(now - i * DAY_MS);
      days.push({
        key: formatDayKey(date),
        label: formatDayLabel(date),
        shortLabel: formatShortDate(date),
        count: 0,
      });
    }

    // Count actions per day
    for (const action of actions) {
      const day = days.find((d) => d.key === formatDayKey(action.created_at));
      if (day) day.count++;
    }

    return days;
  }, [actions, now]);

  const stats = useMemo(() => {
    const total = chartData.reduce((sum, d) => sum + d.count, 0);
    const avg = chartData.length > 0 ? total / chartData.length : 0;
    const mostActiveDay = [...chartData].sort((a, b) => b.count - a.count)[0];
    return {
      total,
      avg: avg.toFixed(1),
      mostActiveDay: mostActiveDay?.count > 0 ? mostActiveDay : null,
    };
  }, [chartData]);

  const maxCount = useMemo(() => {
    return Math.max(...chartData.map((d) => d.count), 1);
  }, [chartData]);

  // Compute Y-axis scale ticks
  const yTicks = useMemo(() => {
    if (maxCount <= 5) {
      return Array.from({ length: maxCount + 1 }, (_, i) => i);
    }
    const step = Math.ceil(maxCount / 4);
    const ticks: number[] = [];
    for (let i = 0; i <= maxCount; i += step) {
      ticks.push(i);
    }
    if (ticks[ticks.length - 1] < maxCount) {
      ticks.push(maxCount);
    }
    return ticks;
  }, [maxCount]);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <NumberStrip columns={3}>
        <NumberCell label="Actions, last 14 days" value={stats.total} />
        <NumberCell label="Actions a day, last 14 days" value={stats.avg} />
        <NumberCell label="Busiest day, last 14 days" value={stats.mostActiveDay
              ? `${stats.mostActiveDay.shortLabel} (${stats.mostActiveDay.count})`
              : "---"} />
      </NumberStrip>

      {/* Bar Chart */}
      <div className="pastel-card p-5">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 className="w-4 h-4 text-foreground/70" />
          <h3 className="font-bold text-foreground text-sm">
            Daily Activity (Last 14 Days)
          </h3>
        </div>

        <div className="flex">
          {/* Y-axis labels */}
          <div className="flex flex-col justify-between pr-3 py-1" style={{ height: 200 }}>
            {[...yTicks].reverse().map((tick) => (
              <span
                key={tick}
                className="text-xs text-foreground/70 text-right tabular-nums leading-none"
              >
                {tick}
              </span>
            ))}
          </div>

          {/* Chart area */}
          <div className="flex-1">
            <div
              className="flex items-end gap-1 sm:gap-2"
              style={{ height: 200 }}
            >
              {chartData.map((day, i) => {
                const heightPct =
                  maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                const isHovered = hoveredIndex === i;
                const isToday = i === chartData.length - 1;

                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center justify-end relative"
                    style={{ height: "100%" }}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    {/* Tooltip */}
                    {isHovered && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-[var(--card-bg)] px-2 py-1 rounded-lg text-xs font-semibold whitespace-nowrap z-10 shadow-lg">
                        {day.count} action{day.count !== 1 ? "s" : ""}
                      </div>
                    )}

                    {/* Bar */}
                    <div
                      className={cn(
                        "w-full rounded-t-md transition-all duration-200 min-h-[2px]",
                        isHovered
                          ? "bg-[var(--primary)]"
                          : isToday
                            ? "bg-[var(--primary)]/80"
                            : day.count > 0
                              ? "bg-[var(--primary)]/40"
                              : "bg-foreground/5"
                      )}
                      style={{ height: `${Math.max(heightPct, 1)}%` }}
                    />
                  </div>
                );
              })}
            </div>

            {/* X-axis labels */}
            <div className="flex gap-1 sm:gap-2 mt-2">
              {chartData.map((day, i) => (
                <div key={i} className="flex-1 text-center">
                  <span
                    className={cn(
                      "text-xs leading-none",
                      i === chartData.length - 1
                        ? "font-semibold text-foreground/70"
                        : "text-foreground/70"
                    )}
                  >
                    {day.label.split(" ")[1]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
