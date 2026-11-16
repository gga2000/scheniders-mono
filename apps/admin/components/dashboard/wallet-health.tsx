"use client";

import { Wallet, AlertTriangle } from "lucide-react";
import { Sparkline } from "@/components/shared/sparkline";
import type { WalletHealthData } from "@/types/dashboard";
import { formatIQD } from "@/lib/format";
import { uiHue } from "@/types/leads";

// Soft tint with its own ink: readable in light and dark.
const HEALTHY = uiHue("green");
const WARNING = uiHue("amber");
const CRITICAL = uiHue("red");

interface WalletHealthProps {
  health: WalletHealthData | undefined;
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
            <Wallet className="w-4 h-4 text-[var(--ink-violet)]" />
          </div>
          <h3 className="font-bold text-foreground text-sm">Wallet Health</h3>
        </div>

        {health && health.critical > 5 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/15 text-[var(--ink-red)] text-xs font-bold">
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
                  backgroundColor: HEALTHY.strong,
                }}
                title={`Over 50,000 IQD: ${health.healthy} (${healthyPct.toFixed(0)}%)`}
              >
                {healthyPct >= 15 && (
                  <span className="text-xs font-bold" style={{ color: HEALTHY.solid }}>
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
                  backgroundColor: WARNING.strong,
                }}
                title={`10,000 to 50,000 IQD: ${health.warning} (${warningPct.toFixed(0)}%)`}
              >
                {warningPct >= 15 && (
                  <span className="text-xs font-bold" style={{ color: WARNING.solid }}>
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
                  backgroundColor: CRITICAL.strong,
                }}
                title={`Under 10,000 IQD: ${health.critical} (${criticalPct.toFixed(0)}%)`}
              >
                {criticalPct >= 15 && (
                  <span className="text-xs font-bold" style={{ color: CRITICAL.solid }}>
                    {health.critical}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Legend row */}
          <div className="flex items-center gap-4 mb-4 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: HEALTHY.solid }} />
              <span className="text-foreground/70">Over 50,000 IQD</span>
              <span className="font-bold text-foreground">{health.healthy}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: WARNING.solid }} />
              <span className="text-foreground/70">10,000 to 50,000 IQD</span>
              <span className="font-bold text-foreground">{health.warning}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CRITICAL.solid }} />
              <span className="text-foreground/70">Under 10,000 IQD</span>
              <span className="font-bold text-foreground">{health.critical}</span>
            </span>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-3">
              <p className="text-xs text-foreground/70 uppercase tracking-wider mb-0.5">
                Avg Balance
              </p>
              <p className="text-sm font-bold text-foreground">
                {formatIQD(health.avgBalance)}
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-3">
              <p className="text-xs text-foreground/70 uppercase tracking-wider mb-0.5">
                Median Balance
              </p>
              <p className="text-sm font-bold text-foreground">
                {formatIQD(health.medianBalance)}
              </p>
            </div>
          </div>

          {/* Top-up rate sparkline */}
          <div>
            <p className="text-xs text-foreground/70 uppercase tracking-wider mb-1">
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
