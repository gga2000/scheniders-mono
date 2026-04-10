"use client";

import { cn } from "@/lib/utils";
import type { Lead, Industry } from "@/types/leads";
import { TrendingUp } from "lucide-react";

interface LeadPredictionCardProps {
  lead: Lead;
  industry?: Industry | null;
}

export function LeadPredictionCard({ lead, industry }: LeadPredictionCardProps) {
  const monthlyOrders = lead.estimated_daily_orders * 30;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5"
      )}
    >
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.06] via-transparent to-blue-500/[0.06] pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)]">
              Order Prediction
            </h3>
            <p className="text-[11px] text-[var(--muted)]">
              Estimated based on engagement data
            </p>
          </div>
        </div>

        {/* Main number */}
        <div className="mb-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
              ~{lead.estimated_daily_orders}
            </span>
            <span className="text-sm font-medium text-[var(--muted)]">
              orders/day
            </span>
          </div>
          <div className="text-sm text-[var(--muted)] mt-0.5">
            ~{monthlyOrders.toLocaleString()} orders/month
          </div>
        </div>

        {/* Revenue */}
        <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.03] px-4 py-3 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-medium mb-1">
            Estimated Monthly Revenue
          </div>
          <div className="text-xl font-bold text-[var(--foreground)]">
            ~{lead.estimated_monthly_revenue.toLocaleString()}{" "}
            <span className="text-sm font-medium text-[var(--muted)]">IQD/month</span>
          </div>
        </div>

        {/* Formula breakdown */}
        <div className="text-xs text-[var(--muted)] space-y-1.5">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
            <span>
              {lead.avg_view_count.toLocaleString()} avg views &divide; 1,000 = estimated daily orders
            </span>
          </div>

          {industry && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black/[0.02] dark:bg-white/[0.02]">
              <span>
                Based on{" "}
                <span className="font-semibold text-[var(--foreground)]">
                  {industry.name}
                </span>{" "}
                average order value:{" "}
                <span className="font-semibold text-[var(--foreground)]">
                  {industry.avg_order_value_iqd.toLocaleString()} IQD
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
