"use client";

import { useState, useRef, useEffect } from "react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminTenant } from "@/types/admin";
import { healthChipClass, healthDotClass } from "@/lib/merchant-health";

interface HealthScoreTooltipProps {
  /** A list row or the shop record: only the parts of the score are read. */
  merchant: Pick<AdminTenant, "staff_health_parts">;
  score: number;
  isChurnRisk: boolean;
}

interface ScoreComponent {
  label: string;
  value: number;
  color: string;
  maxBar: number;
}

/** The three bars: what the database says each part adds to, or takes from, 50. */
function getHealthBreakdown(merchant: Pick<AdminTenant, "staff_health_parts">): ScoreComponent[] {
  const { status, wallet, orders } = merchant.staff_health_parts;
  const tone = (value: number) => (value > 0 ? "bg-green-500" : value < 0 ? "bg-red-500" : "bg-gray-300");

  return [
    { label: "Status", value: status, color: tone(status), maxBar: 20 },
    { label: "Wallet", value: wallet, color: tone(wallet), maxBar: 15 },
    { label: "Orders", value: orders, color: orders > 0 ? "bg-blue-500" : "bg-gray-300", maxBar: 15 },
  ];
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
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold cursor-pointer transition-all",
          healthChipClass(score)
        )}
        title={`Health score: ${score}/100`}
      >
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            healthDotClass(score)
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
            <span className="text-xs font-semibold text-foreground/70">
              Health Breakdown
            </span>
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-bold",
              healthChipClass(score)
            )}>
              {score}/100
            </span>
          </div>

          <div className="space-y-2">
            {breakdown.map((comp) => (
              <div key={comp.label} className="flex items-center gap-2">
                <span className="text-xs text-foreground/70 w-12 shrink-0">{comp.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", comp.color)}
                    style={{
                      width: `${Math.max(0, (Math.abs(comp.value) / comp.maxBar) * 100)}%`,
                    }}
                  />
                </div>
                <span className={cn(
                  "text-xs font-bold w-8 text-right",
                  comp.value > 0 ? "text-green-600" : comp.value < 0 ? "text-red-500" : "text-foreground/70"
                )}>
                  {comp.value > 0 ? `+${comp.value}` : comp.value}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2.5 pt-2 border-t border-[var(--card-border)] flex items-center justify-between">
            <span className="text-xs text-foreground/70">Base score</span>
            <span className="text-xs font-bold text-foreground/70">50</span>
          </div>

          {isChurnRisk && (
            <div className="mt-2 px-2 py-1.5 rounded-lg bg-red-50 dark:bg-red-400/10 text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
              <Flame className="w-3 h-3" />
              At risk of churning
            </div>
          )}
        </div>
      )}
    </div>
  );
}
