"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";

interface RevenueChartProps {
  transactions: Array<{
    type: string;
    amount_iqd: number;
    created_at: string;
  }>;
  isLoading?: boolean;
}

type Days = 7 | 14 | 30;

interface ChartDataPoint {
  date: string;
  topups: number;
  charges: number;
}

function formatAmount(value: number): string {
  if (value >= 1000) {
    return (value / 1000).toFixed(0) + "K";
  }
  return String(value);
}

function formatFullAmount(value: number): string {
  return new Intl.NumberFormat("en-IQ").format(value) + " IQD";
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-xl p-3 text-sm">
      <p className="font-bold text-foreground mb-2">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-muted">{p.name}:</span>
          <span className="font-semibold text-foreground">
            {formatFullAmount(p.value)}
          </span>
        </p>
      ))}
    </div>
  );
};

export function RevenueChart({ transactions, isLoading }: RevenueChartProps) {
  const [days, setDays] = useState<Days>(30);

  const data = useMemo<ChartDataPoint[]>(() => {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() - days);

    const buckets: Record<string, { topups: number; charges: number }> = {};

    // Initialize all day buckets to ensure continuous axis
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { topups: 0, charges: 0 };
    }

    // Aggregate transactions into buckets
    for (const tx of transactions) {
      const txDate = new Date(tx.created_at);
      if (txDate < cutoff) continue;
      const key = txDate.toISOString().slice(0, 10);
      if (!buckets[key]) continue;

      const normalizedType = tx.type.toLowerCase();
      if (normalizedType.includes("topup") || normalizedType.includes("top-up") || normalizedType.includes("top_up")) {
        buckets[key].topups += tx.amount_iqd;
      } else {
        buckets[key].charges += tx.amount_iqd;
      }
    }

    // Convert to chart data with formatted date labels
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, values]) => {
        const d = new Date(dateStr + "T00:00:00");
        const label = d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        return {
          date: label,
          topups: values.topups,
          charges: values.charges,
        };
      });
  }, [transactions, days]);

  const totalRevenue = data.reduce((s, d) => s + d.topups + d.charges, 0);

  if (isLoading) {
    return (
      <div className="pastel-card p-5 md:p-6 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gray-200 animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0" style={{ minHeight: 220 }}>
          <div className="w-full h-full bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="pastel-card p-5 md:p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)]/40 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-blue-700" />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-sm">Revenue Trend</h3>
            <p className="text-xs text-muted">
              Total: {formatFullAmount(totalRevenue)}
            </p>
          </div>
        </div>

        {/* Day toggle */}
        <div className="flex items-center gap-1 bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]">
          {([7, 14, 30] as Days[]).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                days === d
                  ? "bg-[var(--card-bg)] text-foreground shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0" style={{ minHeight: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="topupBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#A6C8FF" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#A6C8FF" stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--card-border)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "var(--foreground-subtle)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--foreground-subtle)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatAmount(v)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="topups"
              name="Top-ups"
              fill="url(#topupBarGrad)"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
            <Line
              type="monotone"
              dataKey="charges"
              name="Charges"
              stroke="#FBE38E"
              strokeWidth={2.5}
              dot={{ fill: "#FBE38E", r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#FBE38E" }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
