"use client";

import { Users, Repeat, Crown, ShoppingBag, PieChart } from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { CustomersFinanceSummary } from "@/hooks/use-finance-customers";

interface Props {
    data: CustomersFinanceSummary;
}

export function CustomersSummary({ data }: Props) {
    const repeatTone = data.repeat_rate_pct >= 35 ? "emerald" : data.repeat_rate_pct >= 20 ? "amber" : "rose";
    const concentrationTone = data.revenue_concentration_top10_pct >= 50 ? "rose" : data.revenue_concentration_top10_pct >= 30 ? "amber" : "emerald";

    return (
        <SectionCard
            title="Customers — Financial lens"
            subtitle={`${data.total_customers} active customers · ${data.new_customers} new · ${data.returning_customers} returning`}
            icon={Users}
            accent="violet"
        >
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <StatTile
                    icon={Users}
                    label="Active customers"
                    value={data.total_customers.toLocaleString()}
                    sublabel={`${data.new_customers} new · ${data.returning_customers} return`}
                    tone="slate"
                />
                <StatTile
                    icon={Repeat}
                    label="Repeat rate"
                    value={`${data.repeat_rate_pct.toFixed(1)}%`}
                    sublabel={
                        repeatTone === "emerald"
                            ? "Healthy retention"
                            : repeatTone === "amber"
                                ? "Below target"
                                : "Concerning"
                    }
                    tone={repeatTone}
                />
                <StatTile
                    icon={Crown}
                    label="Avg LTV"
                    value={
                        <FinanceValue value={data.avg_ltv} abbreviate className="text-xl font-bold tabular-nums" />
                    }
                    sublabel={
                        data.median_ltv > 0 ? (
                            <>
                                median{" "}
                                <FinanceValue
                                    value={data.median_ltv}
                                    abbreviate
                                    className="tabular-nums"
                                />
                            </>
                        ) : (
                            `${data.total_customers} customers`
                        )
                    }
                    tone="violet"
                />
                <StatTile
                    icon={ShoppingBag}
                    label="Period AOV"
                    value={
                        <FinanceValue value={data.avg_aov} abbreviate className="text-xl font-bold tabular-nums" />
                    }
                    sublabel={`new revenue ${data.new_revenue_share_pct.toFixed(0)}%`}
                    tone="cyan"
                />
                <StatTile
                    icon={PieChart}
                    label="Top-10 concentration"
                    value={`${data.revenue_concentration_top10_pct.toFixed(1)}%`}
                    sublabel={
                        concentrationTone === "rose"
                            ? "Heavy reliance on few"
                            : concentrationTone === "amber"
                                ? "Watch concentration"
                                : "Well-distributed"
                    }
                    tone={concentrationTone}
                />
            </div>
        </SectionCard>
    );
}

interface StatTileProps {
    icon: LucideIcon;
    label: string;
    value: React.ReactNode;
    sublabel?: React.ReactNode;
    tone: "emerald" | "amber" | "rose" | "violet" | "cyan" | "slate";
}

const toneMap: Record<StatTileProps["tone"], { ring: string; iconBg: string; valueClr: string }> = {
    emerald: {
        ring: "border-emerald-500/30",
        iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        valueClr: "text-emerald-700 dark:text-emerald-300",
    },
    amber: {
        ring: "border-amber-500/30",
        iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        valueClr: "text-amber-700 dark:text-amber-300",
    },
    rose: {
        ring: "border-rose-500/30",
        iconBg: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
        valueClr: "text-rose-700 dark:text-rose-300",
    },
    violet: {
        ring: "border-violet-500/30",
        iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
        valueClr: "text-foreground",
    },
    cyan: {
        ring: "border-cyan-500/30",
        iconBg: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
        valueClr: "text-foreground",
    },
    slate: {
        ring: "border-[var(--card-border)]",
        iconBg: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
        valueClr: "text-foreground",
    },
};

function StatTile({ icon: Icon, label, value, sublabel, tone }: StatTileProps) {
    const m = toneMap[tone];
    return (
        <div className={cn("rounded-xl border bg-[var(--card-bg)] p-3.5", m.ring)}>
            <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", m.iconBg)}>
                    <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="text-[10.5px] uppercase tracking-wider text-muted font-semibold">{label}</div>
            </div>
            <div className={cn("text-xl font-bold tabular-nums", m.valueClr)}>{value}</div>
            {sublabel && <div className="text-[10.5px] text-muted mt-1">{sublabel}</div>}
        </div>
    );
}
