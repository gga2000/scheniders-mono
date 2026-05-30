"use client";

import { Gauge } from "lucide-react";
import type { MerchantDetail, PlanLimits } from "@/hooks/use-merchant-detail";
import { cn } from "@/lib/utils";

interface PlanUtilizationBarsProps {
  planLimits: PlanLimits | null;
  usage: MerchantDetail["usage"];
  team: MerchantDetail["team"];
  plan: string;
}

function pickCurrentMonth(usage: MerchantDetail["usage"]) {
  if (!usage.length) return null;
  const sorted = [...usage].sort((a, b) => b.year - a.year || b.month - a.month);
  return sorted[0] ?? null;
}

function clampPct(value: number, limit: number): number {
  if (limit < 0) return 0; // unlimited
  if (limit === 0) return 100;
  return Math.max(0, Math.min(100, (value / limit) * 100));
}

function toneFor(pct: number, unlimited: boolean): {
  bar: string;
  text: string;
} {
  if (unlimited) {
    return { bar: "bg-gradient-to-r from-violet-400 to-fuchsia-500", text: "text-violet-700 dark:text-violet-300" };
  }
  if (pct >= 90) {
    return { bar: "bg-gradient-to-r from-rose-500 to-red-600", text: "text-rose-700 dark:text-rose-300" };
  }
  if (pct >= 70) {
    return { bar: "bg-gradient-to-r from-amber-400 to-orange-500", text: "text-amber-700 dark:text-amber-300" };
  }
  return { bar: "bg-gradient-to-r from-emerald-400 to-teal-500", text: "text-emerald-700 dark:text-emerald-300" };
}

interface BarProps {
  label: string;
  value: number;
  limit: number;
  unit?: string;
}

function Bar({ label, value, limit, unit }: BarProps) {
  const unlimited = limit < 0;
  const pct = clampPct(value, limit);
  const tone = toneFor(pct, unlimited);
  const display = unlimited ? "Unlimited" : `${value.toLocaleString("en-IQ")} / ${limit.toLocaleString("en-IQ")}`;
  const subtext = unlimited
    ? `${value.toLocaleString("en-IQ")}${unit ? ` ${unit}` : ""}`
    : `${pct.toFixed(0)}% used`;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold text-foreground/70">{label}</span>
        <span className={cn("text-[11px] font-bold tabular-nums", tone.text)}>{display}</span>
      </div>
      <div className="h-1.5 rounded-full bg-foreground/[0.08] overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", tone.bar)}
          style={{ width: `${unlimited ? 30 : pct}%` }}
        />
      </div>
      <p className="text-[10px] font-medium text-foreground/45 mt-0.5">{subtext}</p>
    </div>
  );
}

export function PlanUtilizationBars({
  planLimits,
  usage,
  team,
  plan,
}: PlanUtilizationBarsProps) {
  const current = pickCurrentMonth(usage);
  const ordersThisMonth = current?.orders_count ?? 0;
  const teamSize = team.length;

  if (!planLimits) {
    return (
      <div className="pastel-card p-4">
        <h3 className="text-[10px] font-black uppercase tracking-wider text-foreground/50 mb-2 flex items-center gap-1.5">
          <Gauge className="w-3 h-3" />
          Plan utilization
        </h3>
        <p className="text-xs text-foreground/45">No quotas defined for the {plan} plan.</p>
      </div>
    );
  }

  return (
    <div className="pastel-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-black uppercase tracking-wider text-foreground/50 flex items-center gap-1.5">
          <Gauge className="w-3 h-3" />
          Plan utilization
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground/55">
          {plan}
        </span>
      </div>
      <div className="space-y-3">
        <Bar
          label="Orders this month"
          value={ordersThisMonth}
          limit={planLimits.max_orders_per_month}
          unit="orders"
        />
        <Bar
          label="Team members"
          value={teamSize}
          limit={planLimits.max_team_members}
          unit="members"
        />
      </div>
    </div>
  );
}
