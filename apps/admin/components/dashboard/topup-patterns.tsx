"use client";

import { Wallet } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TopUpPattern } from "@/types/dashboard";

interface TopUpPatternsProps {
  patterns: TopUpPattern[] | undefined;
}

function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(amount) + " IQD";
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const count = payload.find((p) => p.name === "count")?.value ?? 0;
  const avg = payload.find((p) => p.name === "avgAmount")?.value ?? 0;
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-foreground/70">
        Count: <span className="font-semibold text-foreground">{count}</span>
      </p>
      <p className="text-foreground/70">
        Avg: <span className="font-semibold text-foreground">{formatIQD(avg)}</span>
      </p>
    </div>
  );
};

function Skeleton() {
  return (
    <div className="h-[220px] w-full rounded-xl bg-gray-200/30 animate-pulse mt-4" />
  );
}

export function TopUpPatterns({ patterns }: TopUpPatternsProps) {
  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)]/40 flex items-center justify-center">
          <Wallet className="w-4 h-4 text-blue-700" />
        </div>
        <h3 className="font-bold text-foreground text-sm">Top-Up Patterns</h3>
      </div>

      {!patterns ? (
        <Skeleton />
      ) : patterns.length === 0 ? (
        <p className="text-sm text-foreground/50 text-center py-8">
          No top-up data available
        </p>
      ) : (
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={patterns}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <XAxis
                dataKey="dayLabel"
                tick={{ fontSize: 11, fill: "var(--foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: "var(--foreground)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: "var(--foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                yAxisId="left"
                dataKey="count"
                fill="var(--pastel-blue)"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgAmount"
                stroke="var(--pastel-yellow)"
                strokeWidth={2.5}
                dot={{ fill: "var(--pastel-yellow)", r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
