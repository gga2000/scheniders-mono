"use client";

import { TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import type { DashboardV2Stats } from "@/types/dashboard";

interface MerchantLTVProps {
  data: DashboardV2Stats["merchantLTV"] | undefined;
}

function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(amount) + " IQD";
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { bucket: string; count: number } }>;
}) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-foreground">{d.bucket}</p>
      <p className="text-foreground/70">
        {d.count} merchant{d.count !== 1 ? "s" : ""}
      </p>
    </div>
  );
};

function Skeleton() {
  return (
    <div className="space-y-4 mt-4">
      <div className="h-8 w-40 rounded-lg bg-gray-200/40 animate-pulse" />
      <div className="h-[180px] w-full rounded-xl bg-gray-200/30 animate-pulse" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 rounded-lg bg-gray-200/30 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function MerchantLTV({ data }: MerchantLTVProps) {
  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[var(--pastel-green)]/40 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-green-700" />
        </div>
        <h3 className="font-bold text-foreground text-sm">
          Merchant Lifetime Value
        </h3>
      </div>

      {!data ? (
        <Skeleton />
      ) : (
        <>
          {/* Avg LTV */}
          <div className="mb-4">
            <p className="text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-1">
              Average LTV
            </p>
            <AnimatedCounter
              value={data.avgLTV}
              suffix=" IQD"
              className="text-2xl font-bold text-foreground"
            />
          </div>

          {/* Distribution chart */}
          {data.distribution.length > 0 && (
            <div style={{ width: "100%", height: 180 }} className="mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.distribution}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--card-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 9, fill: "var(--foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="count"
                    fill="var(--pastel-blue)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={36}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top 5 merchants */}
          {data.topMerchants.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground/50 uppercase tracking-wider mb-2">
                Top 5 by LTV
              </p>
              <div className="space-y-1.5">
                {data.topMerchants.slice(0, 5).map((m, idx) => (
                  <div
                    key={m.tenantId}
                    className="flex items-center gap-3 py-1.5 px-2 rounded-lg bg-[var(--background)]/50"
                  >
                    <span className="text-xs font-bold text-foreground/40 w-5 text-center">
                      #{idx + 1}
                    </span>
                    <span className="text-sm font-medium text-foreground flex-1 truncate">
                      {m.businessName}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {formatIQD(m.totalRevenue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
