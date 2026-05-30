"use client";

import { DollarSign, TrendingDown, AlertCircle, Users } from "lucide-react";

function fmtIQD(n: number) {
    return new Intl.NumberFormat("en-IQ").format(Math.round(n));
}

interface SalaryOverviewCardsProps {
    totalDue: number;
    employeeCount: number;
    totalPendingAdvances: number;
    totalPendingPenalties: number;
}

export function SalaryOverviewCards({
    totalDue,
    employeeCount,
    totalPendingAdvances,
    totalPendingPenalties,
}: SalaryOverviewCardsProps) {
    return (
        <div className="flex items-center gap-0 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden divide-x divide-[var(--card-border)]">
            <div className="flex items-center gap-2 px-4 py-2.5 flex-1 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                    <p className="text-xs text-muted leading-none mb-0.5">Total Payroll Due</p>
                    <p className="text-sm font-bold text-foreground tabular-nums truncate">{fmtIQD(totalDue)} IQD</p>
                </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-2.5 flex-1 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <TrendingDown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                    <p className="text-xs text-muted leading-none mb-0.5">Active Advances</p>
                    <p className="text-sm font-bold text-foreground tabular-nums truncate">{fmtIQD(totalPendingAdvances)} IQD</p>
                </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-2.5 flex-1 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                </div>
                <div className="min-w-0">
                    <p className="text-xs text-muted leading-none mb-0.5">Pending Penalties</p>
                    <p className="text-sm font-bold text-foreground tabular-nums truncate">{fmtIQD(totalPendingPenalties)} IQD</p>
                </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-2.5">
                <div className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <p className="text-xs text-muted leading-none mb-0.5">Employees</p>
                    <p className="text-sm font-bold text-foreground tabular-nums">{employeeCount}</p>
                </div>
            </div>
        </div>
    );
}
