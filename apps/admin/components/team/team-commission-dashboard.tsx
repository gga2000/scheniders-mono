"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useCommissionConfigs } from "@/hooks/use-admin-commissions";
import {
  DollarSign,
  Clock,
  CheckCircle2,
  Settings,
  Loader2,
} from "lucide-react";
import type { AdminEmployee, CommissionType } from "@/types/leads";

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
  per_order: "bg-blue-100 text-blue-800",
  percentage: "bg-purple-100 text-purple-800",
  tiered_bonus: "bg-amber-100 text-amber-800",
  custom: "bg-gray-100 text-gray-700",
};

type Period = "month" | "quarter";

export function TeamCommissionDashboard({
  employees,
}: TeamCommissionDashboardProps) {
  const { data: configs, isLoading: configsLoading } = useCommissionConfigs();
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
    // Paid this month = earned - pending (approximation)
    const totalPaid = Math.max(0, totalEarned - totalPending);
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="pastel-card p-4 bg-green-50/50">
          <div className="flex items-center gap-2 text-green-700 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs font-semibold">Total Earned</span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {fmt(totals.totalEarned)}{" "}
            <span className="text-xs font-normal text-foreground/50">IQD</span>
          </p>
        </div>
        <div className="pastel-card p-4 bg-amber-50/50">
          <div className="flex items-center gap-2 text-amber-700 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-semibold">Total Pending</span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {fmt(totals.totalPending)}{" "}
            <span className="text-xs font-normal text-foreground/50">IQD</span>
          </p>
        </div>
        <div className="pastel-card p-4 bg-blue-50/50">
          <div className="flex items-center gap-2 text-blue-700 mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-semibold">Total Paid</span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {fmt(totals.totalPaid)}{" "}
            <span className="text-xs font-normal text-foreground/50">IQD</span>
          </p>
        </div>
      </div>

      {/* Commission Configs */}
      <div className="pastel-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-foreground/50" />
            <h3 className="font-bold text-foreground text-sm">
              Commission Configurations
            </h3>
          </div>
        </div>

        {configsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-foreground/30" />
          </div>
        ) : !configs || configs.length === 0 ? (
          <p className="text-sm text-foreground/40 py-4">
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
                      "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                      commissionTypeBadge[config.type]
                    )}
                  >
                    {commissionTypeLabels[config.type]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {config.is_active ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-green-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-foreground/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                      Inactive
                    </span>
                  )}
                  <button className="ml-auto text-[10px] font-semibold text-foreground/50 hover:text-foreground transition-colors">
                    Edit
                  </button>
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
            className="text-xs font-semibold text-foreground/60 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-[var(--primary)]"
          >
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/50">
                  Employee
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/50">
                  Merchants
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/50">
                  Conversions
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/50">
                  Earned
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/50">
                  Pending
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/50">
                  Paid
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-foreground/50">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-foreground/40 text-sm"
                  >
                    No employees found
                  </td>
                </tr>
              ) : (
                sorted.map((emp) => {
                  const initial = (emp.display_name ?? emp.email)
                    .charAt(0)
                    .toUpperCase();
                  const paid = Math.max(
                    0,
                    emp.commission_earned - emp.commission_pending
                  );
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
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
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
                      <td className="px-4 py-3 text-right text-amber-600 tabular-nums">
                        {fmt(emp.commission_pending)}
                      </td>
                      <td className="px-4 py-3 text-right text-green-600 tabular-nums">
                        {fmt(paid)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                            isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-600"
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
