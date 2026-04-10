"use client";

import {
  ShoppingBag,
  DollarSign,
  Building2,
  Activity,
  TrendingUp,
  CreditCard,
} from "lucide-react";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { Sparkline } from "@/components/shared/sparkline";
import type { DashboardV2Stats, KpiData } from "@/types/dashboard";

interface KpiGridV2Props {
  kpis: DashboardV2Stats["kpis"] | undefined;
}

interface KpiCardConfig {
  key: keyof DashboardV2Stats["kpis"];
  icon: React.ElementType;
  cardClass: string;
  iconColor: string;
  textColor: string;
  deltaColor: string;
  sparkColor: string;
}

const cards: KpiCardConfig[] = [
  {
    key: "totalOrders",
    icon: ShoppingBag,
    cardClass: "pastel-card-blue",
    iconColor: "text-blue-700",
    textColor: "text-blue-950",
    deltaColor: "text-blue-800/70",
    sparkColor: "var(--pastel-blue, #A6C8FF)",
  },
  {
    key: "totalRevenue",
    icon: DollarSign,
    cardClass: "pastel-card-green",
    iconColor: "text-green-700",
    textColor: "text-green-950",
    deltaColor: "text-green-800/70",
    sparkColor: "var(--pastel-green, #C0EBA6)",
  },
  {
    key: "totalMerchants",
    icon: Building2,
    cardClass: "pastel-card-yellow",
    iconColor: "text-amber-700",
    textColor: "text-amber-950",
    deltaColor: "text-amber-800/70",
    sparkColor: "var(--pastel-yellow, #FBE38E)",
  },
  {
    key: "activeRate",
    icon: Activity,
    cardClass: "pastel-card-mint",
    iconColor: "text-teal-700",
    textColor: "text-teal-950",
    deltaColor: "text-teal-800/70",
    sparkColor: "var(--pastel-mint, #A6E8D4)",
  },
  {
    key: "avgOrderValue",
    icon: TrendingUp,
    cardClass: "pastel-card-purple",
    iconColor: "text-purple-700",
    textColor: "text-purple-950",
    deltaColor: "text-purple-800/70",
    sparkColor: "var(--pastel-purple, #C8B6FF)",
  },
  {
    key: "mrr",
    icon: CreditCard,
    cardClass: "pastel-card-pink",
    iconColor: "text-rose-700",
    textColor: "text-rose-950",
    deltaColor: "text-rose-800/70",
    sparkColor: "var(--pastel-pink, #F4C7CF)",
  },
];

function formatKpiValue(kpi: KpiData): string {
  const formatted = new Intl.NumberFormat("en-IQ").format(Math.round(kpi.value));
  return `${kpi.prefix ?? ""}${formatted}${kpi.suffix ?? ""}`;
}

function SkeletonCard() {
  return (
    <div className="pastel-card p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-foreground/[0.08]" />
        <div className="h-3 w-16 rounded bg-foreground/[0.06]" />
      </div>
      <div className="h-7 w-20 rounded-lg bg-foreground/[0.1] mb-2" />
      <div className="h-5 w-full rounded bg-foreground/[0.06]" />
    </div>
  );
}

function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return null;
  const isPositive = deltaPct >= 0;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
        isPositive
          ? "bg-green-100 text-green-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      {isPositive ? "+" : ""}
      {deltaPct.toFixed(1)}%
    </span>
  );
}

export function KpiGridV2({ kpis }: KpiGridV2Props) {
  if (!kpis) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((cfg) => {
        const kpi = kpis[cfg.key];
        const Icon = cfg.icon;
        return (
          <div
            key={cfg.key}
            className={`pastel-card ${cfg.cardClass} p-4 group relative overflow-hidden`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-white/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
                <Icon className={`h-4 w-4 ${cfg.iconColor}`} />
              </div>
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${cfg.deltaColor}`}>
                {kpi.label}
              </span>
            </div>

            <div className="flex items-baseline gap-2 mb-1">
              <AnimatedCounter
                value={kpi.value}
                prefix={kpi.prefix}
                suffix={kpi.suffix}
                className={`text-xl font-bold ${cfg.textColor} tracking-tight`}
              />
              <DeltaBadge deltaPct={kpi.deltaPct} />
            </div>

            <Sparkline
              data={kpi.sparkline}
              color={cfg.sparkColor}
              height={20}
            />
          </div>
        );
      })}
    </div>
  );
}
