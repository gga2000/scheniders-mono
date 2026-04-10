"use client";

import { AnimatedCounter } from "@/components/shared/animated-counter";
import type { PlatformOrderStat } from "@/types/dashboard";

interface PlatformOrderStatsProps {
  stats: PlatformOrderStat[] | undefined;
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

function SkeletonCard() {
  return (
    <div className="pastel-card p-4 animate-pulse">
      <div className="h-3 w-16 rounded bg-foreground/[0.08] mb-2" />
      <div className="h-6 w-12 rounded-lg bg-foreground/[0.1] mb-1" />
      <div className="h-4 w-10 rounded bg-foreground/[0.06]" />
    </div>
  );
}

export function PlatformOrderStats({ stats }: PlatformOrderStatsProps) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const cardStyles = [
    "bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20",
    "bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20",
    "bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20",
    "bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20",
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat, i) => (
        <div key={stat.label} className={`pastel-card p-4 ${cardStyles[i] || ""}`}>
          <p className="text-[11px] font-semibold text-foreground/50 uppercase tracking-wider mb-1">
            {stat.label}
          </p>
          <div className="flex items-baseline gap-2">
            <AnimatedCounter
              value={stat.value}
              className="text-xl font-bold text-foreground"
            />
            <DeltaBadge deltaPct={stat.deltaPct} />
          </div>
          <p className="text-[10px] text-foreground/40 mt-0.5">
            prev: {new Intl.NumberFormat("en-IQ").format(stat.previousValue)}
          </p>
        </div>
      ))}
    </div>
  );
}
