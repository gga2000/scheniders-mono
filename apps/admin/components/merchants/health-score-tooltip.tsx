"use client";

import { useState, useRef, useEffect } from "react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminTenant } from "@/types/admin";

interface HealthScoreTooltipProps {
  merchant: AdminTenant;
  score: number;
  isChurnRisk: boolean;
}

interface ScoreComponent {
  label: string;
  value: number;
  color: string;
  maxBar: number;
}

function getHealthBreakdown(merchant: AdminTenant): ScoreComponent[] {
  const components: ScoreComponent[] = [];

  // Status
  let statusScore = 0;
  if (merchant.status === "active") statusScore = 15;
  else if (merchant.status === "trial") statusScore = 5;
  else if (merchant.status === "suspended") statusScore = -20;
  components.push({
    label: "Status",
    value: statusScore,
    color: statusScore > 0 ? "bg-green-500" : statusScore < 0 ? "bg-red-500" : "bg-gray-300",
    maxBar: 20,
  });

  // Wallet
  const balance = merchant.wallet?.balance_iqd ?? 0;
  let walletScore = -10;
  if (balance > 50000) walletScore = 15;
  else if (balance > 10000) walletScore = 5;
  components.push({
    label: "Wallet",
    value: walletScore,
    color: walletScore > 0 ? "bg-green-500" : walletScore < 0 ? "bg-red-500" : "bg-gray-300",
    maxBar: 15,
  });

  // Orders
  const orders = merchant.usage?.orders_count ?? 0;
  let orderScore = 0;
  if (orders > 50) orderScore = 15;
  else if (orders > 10) orderScore = 10;
  else if (orders > 0) orderScore = 5;
  components.push({
    label: "Orders",
    value: orderScore,
    color: orderScore > 0 ? "bg-blue-500" : "bg-gray-300",
    maxBar: 15,
  });

  // Plan
  let planScore = 0;
  if (merchant.plan === "enterprise") planScore = 5;
  else if (merchant.plan === "professional") planScore = 3;
  components.push({
    label: "Plan",
    value: planScore,
    color: planScore > 0 ? "bg-purple-500" : "bg-gray-300",
    maxBar: 5,
  });

  return components;
}

function getHealthColor(score: number): string {
  if (score >= 70) return "text-green-600 bg-green-100 dark:bg-green-400/15 dark:text-green-400";
  if (score >= 40) return "text-amber-600 bg-amber-100 dark:bg-amber-400/15 dark:text-amber-400";
  return "text-red-600 bg-red-100 dark:bg-red-400/15 dark:text-red-400";
}

export function HealthScoreTooltip({ merchant, score, isChurnRisk }: HealthScoreTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const breakdown = getHealthBreakdown(merchant);

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => setOpen(true), 300);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOpen(false), 200);
  };

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-all",
          getHealthColor(score)
        )}
        title={`Health score: ${score}/100`}
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500"
          )}
        />
        <span className="tabular-nums">{score}</span>
        {isChurnRisk && <Flame className="w-2.5 h-2.5 text-red-500" />}
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 w-52 bg-[var(--card-bg)] rounded-xl shadow-xl border border-[var(--card-border)] z-50 animate-in fade-in slide-in-from-top-2 duration-150 p-3"
          onMouseEnter={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
          onMouseLeave={handleMouseLeave}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wider">
              Health Breakdown
            </span>
            <span className={cn(
              "px-2 py-0.5 rounded-full text-[11px] font-bold",
              getHealthColor(score)
            )}>
              {score}/100
            </span>
          </div>

          <div className="space-y-2">
            {breakdown.map((comp) => (
              <div key={comp.label} className="flex items-center gap-2">
                <span className="text-[10px] text-foreground/60 w-12 shrink-0">{comp.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", comp.color)}
                    style={{
                      width: `${Math.max(0, (Math.abs(comp.value) / comp.maxBar) * 100)}%`,
                    }}
                  />
                </div>
                <span className={cn(
                  "text-[10px] font-bold w-8 text-right",
                  comp.value > 0 ? "text-green-600" : comp.value < 0 ? "text-red-500" : "text-foreground/30"
                )}>
                  {comp.value > 0 ? `+${comp.value}` : comp.value}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2.5 pt-2 border-t border-[var(--card-border)] flex items-center justify-between">
            <span className="text-[10px] text-foreground/50">Base score</span>
            <span className="text-[10px] font-bold text-foreground/50">50</span>
          </div>

          {isChurnRisk && (
            <div className="mt-2 px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-400/10 text-[10px] text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
              <Flame className="w-3 h-3" />
              At risk of churning
            </div>
          )}
        </div>
      )}
    </div>
  );
}
