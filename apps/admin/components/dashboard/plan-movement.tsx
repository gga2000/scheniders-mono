"use client";

import { ArrowUpDown, ArrowRight } from "lucide-react";
import type { PlanMovement } from "@/types/dashboard";

interface PlanMovementProps {
  movements: PlanMovement[] | undefined;
}

const TYPE_STYLES: Record<
  PlanMovement["type"],
  { bg: string; text: string; label: string }
> = {
  upgrade: { bg: "bg-green-100", text: "text-green-800", label: "Upgrades" },
  downgrade: { bg: "bg-red-100", text: "text-red-800", label: "Downgrades" },
  cancellation: { bg: "bg-gray-100", text: "text-gray-700", label: "Cancellations" },
  new: { bg: "bg-blue-100", text: "text-blue-800", label: "New Signups" },
};

function Skeleton() {
  return (
    <div className="space-y-3 mt-4">
      <div className="grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-gray-200/40 animate-pulse" />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-10 rounded-lg bg-gray-200/30 animate-pulse" />
      ))}
    </div>
  );
}

function formatPlan(plan: string): string {
  if (plan === "new") return "New";
  if (plan === "cancelled") return "Cancelled";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

export function PlanMovementWidget({ movements }: PlanMovementProps) {
  // Aggregate counts by type
  const summary = { upgrade: 0, downgrade: 0, cancellation: 0, new: 0 };
  if (movements) {
    for (const m of movements) {
      summary[m.type] += m.count;
    }
  }

  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[var(--pastel-pink)]/40 flex items-center justify-center">
          <ArrowUpDown className="w-4 h-4 text-rose-700" />
        </div>
        <h3 className="font-bold text-foreground text-sm">
          Plan Movements (30d)
        </h3>
      </div>

      {!movements ? (
        <Skeleton />
      ) : movements.length === 0 ? (
        <p className="text-sm text-foreground/50 text-center py-8">
          No plan movements in the last 30 days
        </p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {(
              ["upgrade", "downgrade", "cancellation", "new"] as const
            ).map((type) => {
              const style = TYPE_STYLES[type];
              return (
                <div
                  key={type}
                  className={`rounded-xl px-3 py-2.5 ${style.bg} text-center`}
                >
                  <p className={`text-xl font-bold ${style.text}`}>
                    {summary[type]}
                  </p>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}/70`}>
                    {style.label}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Movement list */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {movements.map((m, idx) => {
              const style = TYPE_STYLES[m.type];
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--background)]/50 border border-[var(--card-border)]/50"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-foreground/80">
                      {formatPlan(m.fromPlan)}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-foreground/40" />
                    <span className="font-medium text-foreground/80">
                      {formatPlan(m.toPlan)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {m.count}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}
                    >
                      {m.type}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
