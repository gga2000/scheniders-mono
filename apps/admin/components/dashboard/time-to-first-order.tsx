"use client";

import { Clock } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { TimeToFirstOrderBucket } from "@/types/dashboard";

interface TimeToFirstOrderProps {
  buckets: TimeToFirstOrderBucket[] | undefined;
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TimeToFirstOrderBucket }>;
}) => {
  if (!active || !payload?.length) return null;
  const bucket = payload[0].payload;
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-foreground">{bucket.label}</p>
      <p className="text-foreground/70">
        {bucket.count} merchant{bucket.count !== 1 ? "s" : ""}
      </p>
    </div>
  );
};

function Skeleton() {
  return (
    <div className="h-[220px] w-full rounded-xl bg-gray-200/30 animate-pulse mt-4" />
  );
}

export function TimeToFirstOrder({ buckets }: TimeToFirstOrderProps) {
  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[var(--pastel-purple)]/40 flex items-center justify-center">
          <Clock className="w-4 h-4 text-purple-700" />
        </div>
        <h3 className="font-bold text-foreground text-sm">
          Time to First Order
        </h3>
      </div>

      {!buckets ? (
        <Skeleton />
      ) : buckets.length === 0 ? (
        <p className="text-sm text-foreground/50 text-center py-8">
          No data available
        </p>
      ) : (
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={buckets}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--card-border)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--foreground)" }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={-20}
                dy={6}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--foreground)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
                {buckets.map((b, idx) => (
                  <Cell
                    key={idx}
                    fill={b.isHighlight ? "var(--pastel-pink)" : "var(--pastel-blue)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
