"use client";

import { cn } from "@/lib/utils";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";
import { usageMonthNow } from "@/lib/usage-month";
import { formatCount } from "@/lib/format";

interface UsageTabProps {
  usage: MerchantDetail["usage"];
  planLimits: MerchantDetail["planLimits"];
}

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * The orders that count toward the plan, this month against what the plan
 * allows, then month by month. The database counts each order once in
 * `orders_count` and starts the count again at each renewal. `orders_charged`
 * always holds the same number and `team_members_count` is set once at sign-up, so
 * neither is shown: the Team tab counts the team.
 */
export function UsageTab({ usage, planLimits }: UsageTabProps) {
  const sorted = [...usage].sort((a, b) => b.year - a.year || b.month - a.month);
  const now = usageMonthNow();
  const current = sorted.find((row) => row.year === now.year && row.month === now.month);
  const used = current?.orders_count ?? 0;
  const allowed = planLimits && planLimits.max_orders_per_month > 0 ? planLimits.max_orders_per_month : null;
  const share = allowed ? Math.min(1, used / allowed) : 0;

  return (
    <div className="space-y-4">
      <section className="pastel-card p-5" aria-label="Orders this month">
        <p className="text-[13px] text-foreground/70">Orders counted this month</p>
        <p className="mt-1 text-[22px] font-semibold tabular-nums text-foreground">
          {formatCount(used)}
          {allowed !== null && (
            <span className="text-[15px] font-normal text-foreground/70"> of {formatCount(allowed)} the plan allows</span>
          )}
        </p>
        {allowed !== null && (
          <div className="mt-3 h-1.5 rounded-full bg-foreground/[0.08]" aria-hidden>
            <div
              className={cn(
                "h-1.5 rounded-full",
                share >= 1 ? "bg-rose-600" : share >= 0.8 ? "bg-amber-500" : "bg-foreground/50",
              )}
              style={{ width: `${Math.max(share > 0 ? 2 : 0, share * 100)}%` }}
            />
          </div>
        )}
        <p className="mt-2 text-[13px] text-foreground/70">The count starts again at each renewal.</p>
      </section>

      <section className="pastel-card p-5" aria-label="Month by month">
        <h2 className="mb-2 text-[13px] font-semibold text-foreground/70">Month by month</h2>
        {sorted.length === 0 ? (
          <p className="py-4 text-[13px] text-foreground/70">No orders counted yet.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-[13px] text-foreground/70">
                <th className="py-2 font-medium">Month</th>
                <th className="py-2 text-right font-medium">Orders counted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {sorted.map((row) => (
                <tr key={`${row.year}-${row.month}`} className="text-[15px] tabular-nums text-foreground">
                  <td className="py-2.5">
                    {MONTH.format(Date.UTC(row.year, row.month - 1, 1))}
                    {row === current && <span className="text-[13px] text-foreground/70"> · now</span>}
                  </td>
                  <td className="py-2.5 text-right">{formatCount(row.orders_count ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
