"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2, Calendar, Clock, TrendingUp } from "lucide-react";
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

interface UsageData {
  heatmapData: Array<{ date: string; count: number }>;
  hourlyCounts: number[];
  busiestDays: Array<{ date: string; count: number }>;
  quietestDays: Array<{ date: string; count: number }>;
  weeklyTrend: Array<{ week: string; count: number }>;
  totalOrders: number;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getHeatmapColor(count: number, maxCount: number): string {
  if (count === 0) return "bg-foreground/[0.03]";
  const ratio = count / maxCount;
  if (ratio < 0.15) return "bg-green-100 dark:bg-green-900/30";
  if (ratio < 0.3) return "bg-green-200 dark:bg-green-800/40";
  if (ratio < 0.5) return "bg-green-300 dark:bg-green-700/50";
  if (ratio < 0.7) return "bg-green-400 dark:bg-green-600/60";
  if (ratio < 0.85) return "bg-green-500 dark:bg-green-500/70";
  return "bg-green-600 dark:bg-green-400/80";
}

export default function UsagePage() {
  const [tenantFilter, setTenantFilter] = useState("");

  const { data, isLoading } = useQuery<UsageData>({
    queryKey: ["admin", "usage", tenantFilter],
    queryFn: async () => {
      const params = tenantFilter ? `?tenant_id=${tenantFilter}` : "";
      const res = await fetch(`/api/usage${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  // Build week grid for heatmap
  const heatmapGrid = useMemo(() => {
    if (!data?.heatmapData) return [];

    const weeks: Array<Array<{ date: string; count: number; dayOfWeek: number }>> = [];
    let currentWeek: Array<{ date: string; count: number; dayOfWeek: number }> = [];

    data.heatmapData.forEach((day) => {
      const d = new Date(day.date);
      const dow = d.getDay();

      if (dow === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }

      currentWeek.push({ ...day, dayOfWeek: dow });
    });

    if (currentWeek.length > 0) weeks.push(currentWeek);
    return weeks;
  }, [data?.heatmapData]);

  const maxCount = useMemo(
    () => Math.max(1, ...(data?.heatmapData?.map((d) => d.count) || [1])),
    [data?.heatmapData],
  );

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            Usage Heatmap
          </h1>
          <p className="text-foreground-muted mt-1">Platform activity patterns over 365 days</p>
        </div>
        <div className="flex items-center gap-2">
          <AnimatedCounter value={data.totalOrders} className="text-lg font-bold text-foreground" />
          <span className="text-sm text-foreground/50">total orders</span>
        </div>
      </div>

      {/* Heatmap */}
      <div className="pastel-card p-5 overflow-x-auto">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Activity Heatmap
        </h2>

        <div className="min-w-[700px]">
          {/* Month labels */}
          <div className="flex ml-8 mb-1">
            {(() => {
              const labels: Array<{ label: string; offset: number }> = [];
              let lastMonth = -1;
              heatmapGrid.forEach((week, i) => {
                const d = new Date(week[0].date);
                const m = d.getMonth();
                if (m !== lastMonth) {
                  labels.push({ label: MONTH_LABELS[m], offset: i });
                  lastMonth = m;
                }
              });
              return labels.map((l) => (
                <span
                  key={`${l.label}-${l.offset}`}
                  className="text-[9px] text-foreground/30 absolute"
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
                    <span className="text-[9px] text-foreground/30 w-6 text-right pr-1">{label}</span>
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
                      title={`${cell.date}: ${cell.count} orders`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-1 mt-3 ml-8">
            <span className="text-[9px] text-foreground/30">Less</span>
            {[0, 0.15, 0.3, 0.5, 0.7, 0.85, 1].map((ratio) => (
              <div
                key={ratio}
                className={cn(
                  "w-[12px] h-[12px] rounded-[2px]",
                  getHeatmapColor(Math.ceil(ratio * maxCount), maxCount),
                )}
              />
            ))}
            <span className="text-[9px] text-foreground/30">More</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Hourly Distribution */}
        <div className="pastel-card p-5">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Orders by Hour of Day
          </h2>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.hourlyCounts.map((count, hour) => ({ hour: `${hour}:00`, count }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "var(--foreground)" }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tick={{ fontSize: 10, fill: "var(--foreground)" }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#fcd34d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekly Trend */}
        <div className="pastel-card p-5">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Weekly Trend
          </h2>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.weeklyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="week" tick={{ fontSize: 9, fill: "var(--foreground)" }} axisLine={false} tickLine={false} interval={7} />
                <YAxis tick={{ fontSize: 10, fill: "var(--foreground)" }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#86efac" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Busiest Days */}
        <div className="pastel-card p-5">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-3">
            Top 10 Busiest Days
          </h2>
          <div className="space-y-2">
            {data.busiestDays.map((day, i) => (
              <div key={day.date} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-foreground/30 font-bold text-right">{i + 1}</span>
                <span className="flex-1 font-medium text-foreground">
                  {new Date(day.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <span className="text-foreground/50 font-mono">{day.count} orders</span>
              </div>
            ))}
            {data.busiestDays.length === 0 && (
              <p className="text-sm text-foreground/40 text-center py-4">No data</p>
            )}
          </div>
        </div>

        {/* Quietest Days */}
        <div className="pastel-card p-5">
          <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-3">
            Top 10 Quietest Days
          </h2>
          <div className="space-y-2">
            {data.quietestDays.map((day, i) => (
              <div key={day.date} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-foreground/30 font-bold text-right">{i + 1}</span>
                <span className="flex-1 font-medium text-foreground">
                  {new Date(day.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <span className="text-foreground/50 font-mono">{day.count} orders</span>
              </div>
            ))}
            {data.quietestDays.length === 0 && (
              <p className="text-sm text-foreground/40 text-center py-4">No data</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
