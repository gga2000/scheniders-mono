"use client";

import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { RevenueBreakdown as RevenueBreakdownType, RevenueSlice } from "@/types/dashboard";

interface RevenueBreakdownProps {
  breakdown: RevenueBreakdownType | undefined;
}

type Tab = "byPlan" | "byCity";

function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(amount) + " IQD";
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: RevenueSlice }>;
}) => {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl p-3 text-sm">
      <p className="font-semibold text-foreground">{data.name}</p>
      <p className="text-foreground/70">{formatIQD(data.value)}</p>
    </div>
  );
};

function SkeletonContent() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex justify-center">
        <div className="w-40 h-40 rounded-full bg-foreground/[0.08]" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-4 w-full rounded bg-foreground/[0.06]" />
        ))}
      </div>
    </div>
  );
}

function PieView({ slices }: { slices: RevenueSlice[] }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);

  return (
    <div>
      <div className="relative" style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              nameKey="label"
              strokeWidth={0}
            >
              {slices.map((slice, idx) => (
                <Cell key={idx} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-xs text-foreground/50">Total</p>
            <p className="text-sm font-bold text-foreground">{formatIQD(total)}</p>
          </div>
        </div>
      </div>
      {/* Legend */}
      <div className="mt-3 space-y-1.5">
        {slices.map((slice) => (
          <div key={slice.label} className="flex items-center gap-2 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: slice.color }}
            />
            <span className="flex-1 text-foreground/70 truncate">{slice.label}</span>
            <span className="font-semibold text-foreground">{formatIQD(slice.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarView({ slices }: { slices: RevenueSlice[] }) {
  const maxVal = Math.max(...slices.map((s) => s.value), 1);

  return (
    <div className="space-y-3">
      {slices.map((slice) => {
        const pct = (slice.value / maxVal) * 100;
        return (
          <div key={slice.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-foreground/70 truncate">
                {slice.label}
              </span>
              <span className="text-xs font-bold text-foreground ml-2 whitespace-nowrap">
                {formatIQD(slice.value)}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--card-border)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: slice.color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RevenueBreakdown({ breakdown }: RevenueBreakdownProps) {
  const [tab, setTab] = useState<Tab>("byPlan");

  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--pastel-green)]/40 flex items-center justify-center">
            <svg className="w-4 h-4 text-green-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
          </div>
          <h3 className="font-bold text-foreground text-sm">Revenue Breakdown</h3>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]">
          {([
            { key: "byPlan" as Tab, label: "By Plan" },
            { key: "byCity" as Tab, label: "By City" },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                tab === t.key
                  ? "bg-[var(--card-bg)] text-foreground shadow-sm"
                  : "text-foreground/50 hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {!breakdown ? (
        <SkeletonContent />
      ) : tab === "byPlan" ? (
        <PieView slices={breakdown.byPlan} />
      ) : (
        <BarView slices={breakdown.byCity} />
      )}
    </div>
  );
}
