"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Calendar, Clock, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { cn } from "@/lib/utils";
import { LoadError } from "@/components/shared/load-error";
import { StaleLine } from "@/components/shared/stale-line";
import { formatDateKey, formatDay, formatMonth } from "@/lib/format";
import { adminFetch } from "@/lib/admin-fetch";

interface UsageData {
  heatmapData: Array<{ date: string; count: number }>;
  hourlyCounts: number[];
  busiestDays: Array<{ date: string; count: number }>;
  quietestDays: Array<{ date: string; count: number }>;
  weeklyTrend: Array<{ week: string; count: number }>;
  totalOrders: number;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const orderCount = (n: number) => `${n} ${n === 1 ? "order" : "orders"}`;

function getHeatmapColor(count: number, maxCount: number): string {
  if (count === 0) return "bg-foreground/[0.03]";
  const ratio = count / maxCount;
  if (ratio < 0.15) return "bg-green-500/15";
  if (ratio < 0.3) return "bg-green-200 dark:bg-green-800/40";
  if (ratio < 0.5) return "bg-green-300 dark:bg-green-700/50";
  if (ratio < 0.7) return "bg-green-400 dark:bg-green-600/60";
  if (ratio < 0.85) return "bg-green-500 dark:bg-green-500/70";
  return "bg-green-600 dark:bg-green-400/80";
}

export default function UsagePage() {
  const pageRead = useQuery<UsageData>({
    queryKey: ["admin", "usage"],
    queryFn: async () => {
      const res = await adminFetch("/api/usage");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const { data, isLoading, isError, error, isFetching, refetch } = pageRead;

  const heatmapData = data?.heatmapData;

  // Build week grid for heatmap
  const heatmapGrid = useMemo(() => {
    if (!heatmapData) return [];

    const weeks: Array<Array<{ date: string; count: number; dayOfWeek: number }>> = [];
    let currentWeek: Array<{ date: string; count: number; dayOfWeek: number }> = [];

    heatmapData.forEach((day) => {
      // A day key is a Baghdad calendar day: read it as a plain date, not in the browser's zone.
      const d = new Date(day.date);
      const dow = d.getUTCDay();

      if (dow === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      currentWeek.push({ ...day, dayOfWeek: dow });
    });

    if (currentWeek.length > 0) weeks.push(currentWeek);
    return weeks;
  }, [heatmapData]);

  const maxCount = useMemo(() => Math.max(1, ...(heatmapData?.map((d) => d.count) || [1])), [heatmapData]);

  if (isError && !data) {
    return <LoadError what="the usage numbers" error={error} onRetry={() => refetch()} retrying={isFetching} />;
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-foreground/70" />
      </div>
    );
  }

  // The year of the week in progress: a week tick names its year only when it is another one.
  const thisYear = data.weeklyTrend.at(-1)?.week.slice(0, 4);

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-foreground">Orders by hour</h1>
          <p className="text-[13px] text-foreground/70">Orders per day and hour, Baghdad time, last 365 days</p>
          <StaleLine read={pageRead} what="the usage numbers" className="mt-2" />
        </div>
        <div className="flex items-center gap-2">
          <AnimatedCounter value={data.totalOrders} className="text-lg font-bold text-foreground" />
          <span className="text-sm text-foreground/70">orders in 365 days</span>
        </div>
      </div>

      {/* Heatmap */}
      <div className="pastel-card p-5 overflow-x-auto">
        <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Activity Heatmap
        </h2>

        <div className="min-w-[700px]">
          {/* Month labels: each sits over the first week of its month */}
          <div className="relative h-3 mb-1">
            {(() => {
              const labels: Array<{ label: string; offset: number }> = [];
              let lastMonth = "";
              heatmapGrid.forEach((week, i) => {
                const month = week[0].date.slice(0, 7);
                if (month !== lastMonth) {
                  labels.push({ label: formatMonth(month, false), offset: i });
                  lastMonth = month;
                }
              });
              return labels.map((l) => (
                <span
                  key={`${l.label}-${l.offset}`}
                  className="text-xs text-foreground/70 absolute"
                  style={{ left: `${l.offset * 14 + 32}px` }}
                >
                  {l.label}
                </span>
              ));
            })()}
          </div>

          {/* Grid */}
          <div className="flex gap-0.5 mt-4 relative">
            {/* Day labels */}
            <div className="flex flex-col gap-0.5 mr-1 shrink-0">
              {DAY_LABELS.map((label, i) => (
                <div key={label} className="h-[12px] flex items-center">
                  {i % 2 === 1 && (
                    <span className="text-xs text-foreground/70 w-6 text-right pr-1">{label}</span>
                  )}
                </div>
              ))}
            </div>

            {/* Weeks */}
            {heatmapGrid.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-0.5">
                {Array.from({ length: 7 }, (_, dayIdx) => {
                  const cell = week.find((c) => c.dayOfWeek === dayIdx);
                  if (!cell) return <div key={dayIdx} className="w-[12px] h-[12px]" />;
                  return (
                    <div
                      key={dayIdx}
                      className={cn(
                        "w-[12px] h-[12px] rounded-[2px] transition-colors",
                        getHeatmapColor(cell.count, maxCount),
                      )}
                      title={`${formatDateKey(cell.date)}: ${orderCount(cell.count)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-1 mt-3 ml-8">
            <span className="text-xs text-foreground/70">Less</span>
            {[0, 0.15, 0.3, 0.5, 0.7, 0.85, 1].map((ratio) => (
              <div
                key={ratio}
                className={cn(
                  "w-[12px] h-[12px] rounded-[2px]",
                  getHeatmapColor(Math.ceil(ratio * maxCount), maxCount),
                )}
              />
            ))}
            <span className="text-xs text-foreground/70">More</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Hourly Distribution */}
        <div className="pastel-card p-5">
          <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Orders by Hour of Day
          </h2>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.hourlyCounts.map((count, hour) => ({ hour: `${hour}:00`, count }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="hour" tick={{ fontSize: 13, fill: "var(--foreground)" }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tick={{ fontSize: 13, fill: "var(--foreground)" }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#fcd34d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekly Trend */}
        <div className="pastel-card p-5">
          <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Weekly Trend
          </h2>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                {/* Week keys ("2025-11-23") printed raw ran into each other and off the edge (r4-8). */}
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 13, fill: "var(--foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  interval={7}
                  tickFormatter={(week: string) => formatDateKey(week, week.slice(0, 4) !== thisYear)}
                />
                <YAxis tick={{ fontSize: 13, fill: "var(--foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip labelFormatter={(week) => `Week of ${formatDateKey(String(week))}`} />
                <Line type="monotone" dataKey="count" stroke="#86efac" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Busiest Days */}
        <div className="pastel-card p-5">
          <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-3">
            Top 10 Busiest Days
          </h2>
          <div className="space-y-2">
            {data.busiestDays.map((day, i) => (
              <div key={day.date} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-foreground/70 font-bold text-right">{i + 1}</span>
                <span className="flex-1 font-medium text-foreground">
                  {formatDay(day.date)}
                </span>
                <span className="text-foreground/70 font-mono">{orderCount(day.count)}</span>
              </div>
            ))}
            {data.busiestDays.length === 0 && (
              <p className="text-sm text-foreground/70 text-center py-4">No data</p>
            )}
          </div>
        </div>

        {/* Quietest Days */}
        <div className="pastel-card p-5">
          <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-3">
            Top 10 Quietest Days
          </h2>
          <div className="space-y-2">
            {data.quietestDays.map((day, i) => (
              <div key={day.date} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-foreground/70 font-bold text-right">{i + 1}</span>
                <span className="flex-1 font-medium text-foreground">
                  {formatDay(day.date)}
                </span>
                <span className="text-foreground/70 font-mono">{orderCount(day.count)}</span>
              </div>
            ))}
            {data.quietestDays.length === 0 && (
              <p className="text-sm text-foreground/70 text-center py-4">No data</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
