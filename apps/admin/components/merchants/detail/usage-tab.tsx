"use client";

import { useMemo } from "react";
import { BarChart3, ShoppingBag, Coins, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";

const fmt = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

interface UsageTabProps {
  usage: MerchantDetail["usage"];
}

export function UsageTab({ usage }: UsageTabProps) {
  const { sorted, totals, peakOrders } = useMemo(() => {
    const sorted = [...usage].sort(
      (a, b) => b.year - a.year || b.month - a.month
    );
    const totals = usage.reduce(
      (acc, u) => ({
        orders: acc.orders + (u.orders_count ?? 0),
        charged: acc.charged + (u.orders_charged ?? 0),
        team: Math.max(acc.team, u.team_members_count ?? 0),
      }),
      { orders: 0, charged: 0, team: 0 }
    );
    const peakOrders = Math.max(1, ...usage.map((u) => u.orders_count ?? 0));
    return { sorted, totals, peakOrders };
  }, [usage]);

  const now = new Date();
  const currentYM = `${now.getFullYear()}-${now.getMonth() + 1}`;

  if (usage.length === 0) {
    return (
      <div className="pastel-card p-5 md:p-6">
        <h2 className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1.5 mb-4">
          <BarChart3 className="w-3 h-3" />
          Monthly usage
        </h2>
        <div className="flex flex-col items-center justify-center py-10 text-foreground/40">
          <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center mb-3">
            <BarChart3 className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium">No usage data yet</p>
          <p className="text-xs text-foreground/35 mt-1">
            Monthly orders, charges, and team size will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl p-5 border bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-50 dark:from-sky-400/10 dark:via-cyan-400/10 dark:to-blue-400/10 border-sky-200 dark:border-sky-400/30">
        <div
          aria-hidden
          className="absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl opacity-30 bg-sky-300"
        />
        <p className="relative text-[10px] uppercase tracking-[0.1em] font-black text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
          <BarChart3 className="w-3 h-3" />
          Lifetime usage
        </p>
        <div className="relative grid grid-cols-3 gap-3 mt-3">
          <div>
            <p className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1">
              <ShoppingBag className="w-2.5 h-2.5" />
              Orders
            </p>
            <p className="text-2xl font-black tabular-nums leading-none mt-1.5 text-sky-900 dark:text-sky-200 tracking-tight">
              {compact(totals.orders)}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1">
              <Coins className="w-2.5 h-2.5" />
              Charged
            </p>
            <p className="text-2xl font-black tabular-nums leading-none mt-1.5 text-amber-700 dark:text-amber-300 tracking-tight">
              {compact(totals.charged)}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1">
              <Users className="w-2.5 h-2.5" />
              Peak team
            </p>
            <p className="text-2xl font-black tabular-nums leading-none mt-1.5 text-violet-700 dark:text-violet-300 tracking-tight">
              {totals.team}
            </p>
          </div>
        </div>
      </div>

      <div className="pastel-card p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1.5">
            <BarChart3 className="w-3 h-3" />
            Monthly breakdown
          </h2>
          <span className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 tabular-nums">
            {sorted.length} {sorted.length === 1 ? "month" : "months"}
          </span>
        </div>

        <div className="space-y-2">
          {sorted.map((u) => {
            const monthDate = new Date(u.year, u.month - 1);
            const monthLabel = monthDate.toLocaleDateString("en-US", {
              month: "short",
              year: "numeric",
            });
            const isCurrent = `${u.year}-${u.month}` === currentYM;
            const orderRatio = (u.orders_count ?? 0) / peakOrders;
            const chargeRatio =
              u.orders_count > 0 ? u.orders_charged / u.orders_count : 0;

            return (
              <div
                key={`${u.year}-${u.month}`}
                className={cn(
                  "rounded-2xl border p-4 transition-colors",
                  isCurrent
                    ? "bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 dark:from-violet-400/10 dark:via-fuchsia-400/10 dark:to-pink-400/10 border-violet-200 dark:border-violet-400/30"
                    : "border-foreground/[0.06] bg-foreground/[0.025] hover:bg-foreground/[0.04]"
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-foreground tracking-tight">
                      {monthLabel}
                    </p>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-[9px] font-black uppercase tracking-wider shadow-sm shadow-violet-500/30 ring-1 ring-white/20">
                        Current
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 tabular-nums">
                    {Math.round(chargeRatio * 100)}% billed
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1">
                      <ShoppingBag className="w-2.5 h-2.5" />
                      Orders
                    </p>
                    <p className="text-lg font-black tabular-nums mt-1 text-foreground">
                      {fmt(u.orders_count ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1">
                      <Coins className="w-2.5 h-2.5" />
                      Charged
                    </p>
                    <p className="text-lg font-black tabular-nums mt-1 text-amber-700 dark:text-amber-300">
                      {fmt(u.orders_charged ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1">
                      <Users className="w-2.5 h-2.5" />
                      Team
                    </p>
                    <p className="text-lg font-black tabular-nums mt-1 text-violet-700 dark:text-violet-300">
                      {u.team_members_count ?? 0}
                    </p>
                  </div>
                </div>

                <div className="relative h-1 rounded-full bg-foreground/[0.06] overflow-hidden mt-3">
                  <div
                    className={cn(
                      "absolute left-0 top-0 bottom-0 rounded-full transition-all duration-500",
                      isCurrent
                        ? "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                        : "bg-gradient-to-r from-sky-400 to-cyan-500"
                    )}
                    style={{ width: `${Math.max(2, orderRatio * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
