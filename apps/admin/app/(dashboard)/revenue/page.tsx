"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { LoadError } from "@/components/shared/load-error";
import { formatCount, formatIQD } from "@/lib/format";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";

interface RevenueData {
  mrrWaterfall: Array<{ month: string; revenue: number }>;
  /** Wallet charges of the same six months that are not fees (corrections, test reversals). */
  otherCharges: number;
  cohorts: Array<{ cohort: string; tenantCount: number; months: number[] }>;
  ltvDistribution: Array<{ label: string; count: number }>;
  topLTV: Array<{ id: string; name: string; revenue: number }>;
  avgLTV: number;
  revenueByPlan: Array<{ plan: string; data: number[] }>;
  monthLabels: string[];
}

const PLAN_COLORS: Record<string, string> = {
  starter: "#93c5fd",
  internal: "#cbd5e1",
  unknown: "#d1d5db",
};

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-foreground/70">{new Intl.NumberFormat("en-IQ").format(payload[0].value)} IQD</p>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <p className="text-sm text-foreground/70 py-16 text-center">{text}</p>;
}

export default function RevenuePage() {
  const { data, isLoading, isError, isFetching, refetch } = useQuery<RevenueData>({
    queryKey: ["admin", "revenue"],
    queryFn: async () => {
      const res = await fetch("/api/revenue");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  if (isError && !data) {
    return <LoadError what="the fee numbers" onRetry={() => refetch()} retrying={isFetching} />;
  }

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-foreground/70" />
      </div>
    );
  }

  const totalRevenue = data.mrrWaterfall.reduce((s, m) => s + m.revenue, 0);
  const thisMonthRevenue = data.mrrWaterfall[data.mrrWaterfall.length - 1]?.revenue ?? 0;

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-[22px] font-semibold text-foreground">Our fees</h1>
        <p className="text-[13px] text-foreground/70">
          Fees shops paid us: monthly plan, delivered orders and paid messages. Months on Baghdad time.
        </p>
      </div>

      {/* KPI Row */}
      <NumberStrip columns={3}>
        <NumberCell label="Fees, last 6 months" value={formatIQD(totalRevenue)} />
        <NumberCell label="Fees, this month so far" value={formatIQD(thisMonthRevenue)} />
        <NumberCell label="Avg fees per shop, all time" value={formatIQD(data.avgLTV)} />
      </NumberStrip>

      {data.otherCharges > 0 && (
        <p className="text-xs text-foreground/70">
          Not counted as income: {new Intl.NumberFormat("en-IQ").format(data.otherCharges)} IQD of other wallet
          charges in these six months (corrections and test reversals).
        </p>
      )}

      {/* Fees by month */}
      <div className="pastel-card p-5">
        <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-4">
          Fees by month
        </h2>
        {totalRevenue === 0 ? (
          <EmptyChart text="No fees collected in these six months." />
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.mrrWaterfall}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="month" tick={{ fontSize: 13, fill: "var(--foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 13, fill: "var(--foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" fill="#86efac" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Cohort Analysis */}
        <div className="pastel-card p-5">
          <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-4">
            Fees by signup month
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="p-2 text-left text-foreground/70 font-medium">Cohort</th>
                  <th className="p-2 text-center text-foreground/70 font-medium">#</th>
                  {[0, 1, 2, 3, 4, 5].map((m) => (
                    <th key={m} className="p-2 text-center text-foreground/70 font-medium">M{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((cohort) => {
                  const maxVal = Math.max(...cohort.months, 1);
                  return (
                    <tr key={cohort.cohort} className="border-t border-[var(--card-border)]">
                      <td className="p-2 font-medium text-foreground">{cohort.cohort}</td>
                      <td className="p-2 text-center text-foreground/70">{cohort.tenantCount}</td>
                      {cohort.months.map((rev, i) => {
                        const intensity = rev / maxVal;
                        return (
                          <td
                            key={i}
                            className="p-2 text-center"
                            style={{
                              backgroundColor: rev > 0 ? `rgba(134, 239, 172, ${0.1 + intensity * 0.6})` : undefined,
                            }}
                          >
                            {rev > 0 ? formatCount(rev) : "\u2014"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* LTV Distribution */}
        <div className="pastel-card p-5">
          <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-4">
            Shops by fees paid, all time
          </h2>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.ltvDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis type="number" tick={{ fontSize: 13, fill: "var(--foreground)" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 13, fill: "var(--foreground)" }} axisLine={false} tickLine={false} width={70} />
                <Tooltip />
                <Bar dataKey="count" fill="#c4b5fd" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top LTV merchants */}
          <div className="mt-4 pt-3 border-t border-[var(--card-border)]">
            <h3 className="text-xs font-semibold text-foreground/70 mb-2">Top shops by fees paid</h3>
            <div className="space-y-1.5">
              {data.topLTV.slice(0, 5).map((m, i) => (
                <div key={m.id} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-foreground/70 font-bold">{i + 1}</span>
                  <span className="flex-1 text-foreground font-medium truncate">{m.name}</span>
                  <span className="text-foreground/70 font-mono">{new Intl.NumberFormat("en-IQ").format(m.revenue)} IQD</span>
                </div>
              ))}
              {data.topLTV.length === 0 && (
                <p className="text-xs text-foreground/70">No shop has paid a fee yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fees by plan */}
      <div className="pastel-card p-5">
        <h2 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-4">
          Fees by plan (the plan each shop is on today)
        </h2>
        {data.revenueByPlan.length === 0 ? (
          <EmptyChart text="No fees to split by plan yet." />
        ) : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data.monthLabels.map((month, i) => {
                  const point: Record<string, unknown> = { month };
                  data.revenueByPlan.forEach((p) => {
                    point[p.plan] = p.data[i] || 0;
                  });
                  return point;
                })}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="month" tick={{ fontSize: 13, fill: "var(--foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 13, fill: "var(--foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip />
                {data.revenueByPlan.map((p) => (
                  <Area
                    key={p.plan}
                    type="monotone"
                    dataKey={p.plan}
                    stackId="1"
                    fill={PLAN_COLORS[p.plan] || "#d1d5db"}
                    stroke={PLAN_COLORS[p.plan] || "#d1d5db"}
                    fillOpacity={0.7}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="flex items-center gap-4 mt-3">
          {data.revenueByPlan.map((p) => (
            <div key={p.plan} className="flex items-center gap-1.5 text-xs text-foreground/70">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: PLAN_COLORS[p.plan] || "#d1d5db" }} />
              <span className="capitalize">{p.plan}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
