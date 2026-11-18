"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useCommissionConfigs } from "@/hooks/use-admin-commissions";
import {
  Settings,
  Loader2,
} from "lucide-react";
import type { AdminEmployee, CommissionType } from "@/types/leads";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";
import { LoadFailedLine } from "@/components/shared/load-failed-line";

interface TeamCommissionDashboardProps {
  employees: AdminEmployee[];
}

const fmt = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

const commissionTypeLabels: Record<CommissionType, string> = {
  per_order: "Per Order",
  percentage: "Percentage",
  tiered_bonus: "Tiered Bonus",
  custom: "Custom",
};

const commissionTypeBadge: Record<CommissionType, string> = {
  per_order: "bg-blue-500/15 text-[var(--ink-blue)]",
  percentage: "bg-purple-500/15 text-[var(--ink-violet)]",
  tiered_bonus: "bg-amber-500/15 text-[var(--ink-amber)]",
  custom: "bg-gray-500/15 text-[var(--muted)]",
};

type Period = "month" | "quarter";

export function TeamCommissionDashboard({
  employees,
}: TeamCommissionDashboardProps) {
  const {
    data: configs,
    isLoading: configsLoading,
    isError: configsFailed,
    error: configsError,
    refetch: refetchConfigs,
    isFetching: configsFetching,
  } = useCommissionConfigs();
  const [period, setPeriod] = useState<Period>("month");

  const totals = useMemo(() => {
    const totalEarned = employees.reduce(
      (sum, e) => sum + e.commission_earned,
      0
    );
    const totalPending = employees.reduce(
      (sum, e) => sum + e.commission_pending,
      0
    );
    // Every commission is earned and "pending" is the part not paid yet
    // (admin_team_counts), so earned minus pending is exactly what was paid.
    const totalPaid = totalEarned - totalPending;
    return { totalEarned, totalPending, totalPaid };
  }, [employees]);

  const sorted = useMemo(() => {
    return [...employees].sort(
      (a, b) => b.commission_earned - a.commission_earned
    );
  }, [employees]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <NumberStrip columns={3}>
        <NumberCell label="Commission earned" value={`${fmt(totals.totalEarned)} IQD`} />
        <NumberCell label="Commission waiting" value={`${fmt(totals.totalPending)} IQD`} />
        <NumberCell label="Commission paid" value={`${fmt(totals.totalPaid)} IQD`} />
      </NumberStrip>

      {/* Commission Configs */}
      <div className="pastel-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-foreground/70" />
            <h3 className="font-bold text-foreground text-sm">
              Commission Configurations
            </h3>
          </div>
        </div>

        {configsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-foreground/70" />
          </div>
        ) : configsFailed ? (
          <LoadFailedLine
            className="py-4"
            what="the commission settings"
            error={configsError}
            onRetry={() => void refetchConfigs()}
            retrying={configsFetching}
          />
        ) : !configs || configs.length === 0 ? (
          <p className="text-sm text-foreground/70 py-4">
            No commission configurations set up yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {configs.map((config) => (
              <div
                key={config.id}
                className={cn(
                  "rounded-xl border border-[var(--card-border)] p-4",
                  config.is_active
                    ? "bg-[var(--card-bg)]"
                    : "bg-foreground/[0.02] opacity-60"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    {config.name}
                  </h4>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-semibold",
                      commissionTypeBadge[config.type]
                    )}
                  >
                    {commissionTypeLabels[config.type]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {config.is_active ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-[var(--ink-green)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-medium text-foreground/70">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                      Inactive
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Employee Commission Table */}
      <div className="pastel-card overflow-hidden">
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <h3 className="font-bold text-foreground text-sm">
            Employee Commissions
          </h3>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            className="text-xs font-semibold text-foreground/70 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-[var(--primary)]"
          >
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/70">
                  Employee
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/70">
                  Merchants
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/70">
                  Conversions
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/70">
                  Earned
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/70">
                  Pending
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/70">
                  Paid
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-foreground/70">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-foreground/70 text-sm"
                  >
                    No employees found
                  </td>
                </tr>
              ) : (
                sorted.map((emp) => {
                  const initial = (emp.display_name ?? emp.email)
                    .charAt(0)
                    .toUpperCase();
                  const paid = emp.commission_earned - emp.commission_pending;
                  const isActive = emp.commission_earned > 0 || emp.leads_converted > 0;

                  return (
                    <tr
                      key={emp.id}
                      className="border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/team/${emp.id}`}
                          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                        >
                          {emp.avatar_url ? (
                            <img
                              src={emp.avatar_url}
                              alt=""
                              className="w-8 h-8 rounded-lg object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center text-foreground text-xs font-bold shrink-0">
                              {initial}
                            </div>
                          )}
                          <span className="text-sm font-semibold text-foreground truncate">
                            {emp.display_name ?? emp.email.split("@")[0]}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-foreground/70 tabular-nums">
                        {fmt(emp.stores_built)}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground/70 tabular-nums">
                        {fmt(emp.leads_converted)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground tabular-nums">
                        {fmt(emp.commission_earned)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--ink-amber)] tabular-nums">
                        {fmt(emp.commission_pending)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--ink-green)] tabular-nums">
                        {fmt(paid)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-xs font-semibold",
                            isActive
                              ? "bg-green-500/15 text-[var(--ink-green)]"
                              : "bg-gray-500/15 text-[var(--muted)]"
                          )}
                        >
                          {isActive ? "Active" : "No activity"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
