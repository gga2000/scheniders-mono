"use client";

import { Wallet, AlertTriangle } from "lucide-react";
import { Sparkline } from "@/components/shared/sparkline";
import type { WalletHealthData } from "@/types/dashboard";

interface WalletHealthProps {
  health: WalletHealthData | undefined;
}

function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(Math.round(amount)) + " IQD";
}

function SkeletonContent() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-full rounded-full bg-foreground/[0.08]" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-12 rounded bg-foreground/[0.06]" />
            <div className="h-5 w-8 rounded bg-foreground/[0.08]" />
          </div>
        ))}
      </div>
      <div className="h-5 w-full rounded bg-foreground/[0.06]" />
    </div>
  );
}

export function WalletHealth({ health }: WalletHealthProps) {
  const total = health
    ? health.healthy + health.warning + health.critical
    : 0;

  const healthyPct = total > 0 ? (health!.healthy / total) * 100 : 0;
  const warningPct = total > 0 ? (health!.warning / total) * 100 : 0;
  const criticalPct = total > 0 ? (health!.critical / total) * 100 : 0;

  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--pastel-purple)]/40 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-purple-700" />
          </div>
          <h3 className="font-bold text-foreground text-sm">Wallet Health</h3>
        </div>

        {health && health.critical > 5 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
            <AlertTriangle className="w-3 h-3" />
            {health.critical} critical
          </span>
        )}
      </div>

      {!health ? (
        <SkeletonContent />
      ) : (
        <>
          {/* Stacked bar */}
          <div className="flex h-6 rounded-full overflow-hidden mb-3">
            {healthyPct > 0 && (
              <div
                className="flex items-center justify-center transition-all duration-500"
                style={{
                  width: `${healthyPct}%`,
                  backgroundColor: "#86EFAC",
                }}
                title={`Healthy: ${health.healthy} (${healthyPct.toFixed(0)}%)`}
              >
                {healthyPct >= 15 && (
                  <span className="text-[10px] font-bold text-green-900">
                    {health.healthy}
                  </span>
                )}
              </div>
            )}
            {warningPct > 0 && (
              <div
                className="flex items-center justify-center transition-all duration-500"
                style={{
                  width: `${warningPct}%`,
                  backgroundColor: "#FDE68A",
                }}
                title={`Warning: ${health.warning} (${warningPct.toFixed(0)}%)`}
              >
                {warningPct >= 15 && (
                  <span className="text-[10px] font-bold text-amber-900">
                    {health.warning}
                  </span>
                )}
              </div>
            )}
            {criticalPct > 0 && (
              <div
                className="flex items-center justify-center transition-all duration-500"
                style={{
                  width: `${criticalPct}%`,
                  backgroundColor: "#FCA5A5",
                }}
                title={`Critical: ${health.critical} (${criticalPct.toFixed(0)}%)`}
              >
                {criticalPct >= 15 && (
                  <span className="text-[10px] font-bold text-red-900">
                    {health.critical}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Legend row */}
          <div className="flex items-center gap-4 mb-4 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-300" />
              <span className="text-foreground/60">Healthy (&gt;50K)</span>
              <span className="font-bold text-foreground">{health.healthy}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-200" />
              <span className="text-foreground/60">Warning (10-50K)</span>
              <span className="font-bold text-foreground">{health.warning}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-300" />
              <span className="text-foreground/60">Critical (&lt;10K)</span>
              <span className="font-bold text-foreground">{health.critical}</span>
            </span>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-2xl bg-gradient-to-br from-green-50/80 to-green-100/40 dark:from-green-950/20 dark:to-green-900/10 border border-green-200/50 dark:border-green-800/30 p-3">
              <p className="text-[10px] text-foreground/50 uppercase tracking-wider mb-0.5">
                Avg Balance
              </p>
              <p className="text-sm font-bold text-foreground">
                {formatIQD(health.avgBalance)}
              </p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-purple-50/80 to-purple-100/40 dark:from-purple-950/20 dark:to-purple-900/10 border border-purple-200/50 dark:border-purple-800/30 p-3">
              <p className="text-[10px] text-foreground/50 uppercase tracking-wider mb-0.5">
                Median Balance
              </p>
              <p className="text-sm font-bold text-foreground">
                {formatIQD(health.medianBalance)}
              </p>
            </div>
          </div>

          {/* Top-up rate sparkline */}
          <div>
            <p className="text-[10px] text-foreground/50 uppercase tracking-wider mb-1">
              Daily Top-up Rate (7d)
            </p>
            <Sparkline
              data={health.topUpRateSparkline}
              color="var(--pastel-green)"
              height={28}
            />
          </div>
        </>
      )}
    </div>
  );
}
