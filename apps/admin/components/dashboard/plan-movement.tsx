"use client";

import { ArrowUpDown, ArrowRight } from "lucide-react";
import type { PlanMovement } from "@/types/dashboard";

interface PlanMovementProps {
  movements: PlanMovement[] | undefined;
}

/**
 * `pill` names the move on its line; `label` heads its count and `title` says
 * it in full on hover. A count's tile is about 73 px wide on Home, so its label
 * is one short word: "Cancellations" in capitals needed 118 px and ran into
 * the next tile. "Lost", not "Ended": Trials says "ended" of a trial that ran
 * out, a different count; "Cancelled" (63 px) does not fit.
 */
const TYPE_STYLES: Record<
  PlanMovement["type"],
  { bg: string; text: string; label: string; title: string; pill: string }
> = {
  upgrade: { bg: "bg-green-500/15", text: "text-[var(--ink-green)]", label: "Up", title: "Upgrades", pill: "upgrade" },
  downgrade: { bg: "bg-red-500/15", text: "text-[var(--ink-red)]", label: "Down", title: "Downgrades", pill: "downgrade" },
  cancellation: { bg: "bg-gray-500/15", text: "text-[var(--muted)]", label: "Lost", title: "Cancelled by staff", pill: "cancellation" },
  new: { bg: "bg-blue-500/15", text: "text-[var(--ink-blue)]", label: "New", title: "New signups", pill: "new" },
  // Set for the next payment, not made yet: listed, not counted above.
  waiting: { bg: "bg-amber-500/15", text: "text-[var(--ink-amber)]", label: "Waiting", title: "Waiting", pill: "at next payment" },
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
  // Moves made in the last 30 days, by type; a waiting change is not one yet.
  const summary = { upgrade: 0, downgrade: 0, cancellation: 0, new: 0 };
  for (const m of movements ?? []) {
    if (m.type !== "waiting") summary[m.type] += m.count;
  }

  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[var(--pastel-pink)]/40 flex items-center justify-center">
          <ArrowUpDown className="w-4 h-4 text-[var(--ink-red)]" />
        </div>
        <h3 className="font-bold text-foreground text-sm">
          Plan Movements (30d)
        </h3>
      </div>

      {!movements ? (
        <Skeleton />
      ) : movements.length === 0 ? (
        <p className="text-sm text-foreground/70 text-center py-8">
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
                  title={style.title}
                  className={`rounded-xl px-3 py-2.5 ${style.bg} text-center`}
                >
                  <p className={`text-xl font-bold ${style.text}`}>
                    {summary[type]}
                  </p>
                  <p className={`text-xs font-semibold ${style.text}`}>
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
                    <ArrowRight className="h-3.5 w-3.5 text-foreground/70" />
                    <span className="font-medium text-foreground/80">
                      {formatPlan(m.toPlan)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {m.count}
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}
                    >
                      {style.pill}
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
