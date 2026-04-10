"use client";

import { BarChart3 } from "lucide-react";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";

const fmt = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

interface UsageTabProps {
  usage: MerchantDetail["usage"];
}

export function UsageTab({ usage }: UsageTabProps) {
  return (
    <div className="pastel-card overflow-hidden">
      <div className="p-5 md:p-6 border-b border-[var(--card-border)]">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Monthly Usage
        </h2>
      </div>
      {usage.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
          <BarChart3 className="w-8 h-8 mb-2" />
          <p className="text-sm">No usage data yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="p-3 text-left text-xs font-semibold text-foreground/60 uppercase tracking-wider">Period</th>
                <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">Orders</th>
                <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">Orders Charged</th>
                <th className="p-3 text-right text-xs font-semibold text-foreground/60 uppercase tracking-wider">Team Members</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={`${u.year}-${u.month}`} className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02] transition-colors">
                  <td className="p-3 font-medium">
                    {new Date(u.year, u.month - 1).toLocaleDateString("en-US", { year: "numeric", month: "long" })}
                  </td>
                  <td className="p-3 text-right">{fmt(u.orders_count)}</td>
                  <td className="p-3 text-right">{fmt(u.orders_charged)}</td>
                  <td className="p-3 text-right">{u.team_members_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
