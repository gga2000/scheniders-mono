"use client";

import { motion } from "framer-motion";
import {
    DollarSign,
    TrendingUp,
    TrendingDown,
    Wallet,
    Package,
    Target,
    Layers,
    type LucideIcon,
} from "lucide-react";
import { ProfitSummary, PipelineSummary } from "@/types/expense";
import { cn, formatIQD } from "@/lib/utils";

interface OverviewCardsProps {
    profitSummary: ProfitSummary;
    pipelineSummary: PipelineSummary;
}

type Tone = "neutral" | "good" | "bad" | "warn";

const CHIP: Record<Tone, string> = {
    neutral: "bg-[var(--background)] text-muted",
    good: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    bad: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

const VALUE: Record<Tone, string> = {
    neutral: "text-foreground",
    good: "text-emerald-600 dark:text-emerald-400",
    bad: "text-rose-600 dark:text-rose-400",
    warn: "text-foreground",
};

function profitTone(n: number): Tone {
    return n >= 0 ? "good" : "bad";
}

interface KpiProps {
    icon: LucideIcon;
    label: string;
    value: string;
    sub: string;
    tone: Tone;
    delay: number;
    /** The one number the page is about: a stronger border. */
    hero?: boolean;
}

function Kpi({ icon: Icon, label, value, sub, tone, delay, hero }: KpiProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.25 }}
            className={cn(
                "p-4 rounded-2xl bg-[var(--card-bg)] border",
                hero
                    ? tone === "bad" ? "border-rose-500/40" : "border-emerald-500/40"
                    : "border-[var(--card-border)]"
            )}
        >
            <div className="flex items-center gap-2 mb-2">
                <span className={cn("w-6 h-6 shrink-0 rounded-lg flex items-center justify-center", CHIP[tone])}>
                    <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted leading-tight">{label}</span>
            </div>
            <p className={cn("text-lg font-bold tabular-nums", VALUE[tone])}>{value}</p>
            <p className="text-xs text-muted">{sub}</p>
        </motion.div>
    );
}

export function OverviewCards({ profitSummary, pipelineSummary }: OverviewCardsProps) {
    const cogsPercent = profitSummary.totalRevenue > 0
        ? (profitSummary.totalCOGS / profitSummary.totalRevenue) * 100
        : 0;
    const gross = profitSummary.grossProfit;
    const operating = profitSummary.operatingProfit;
    const net = profitSummary.netProfit;

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <Kpi
                icon={DollarSign} label="Revenue" tone="neutral" delay={0}
                value={formatIQD(profitSummary.totalRevenue)}
                sub={`${profitSummary.orderCount} delivered`}
            />
            <Kpi
                icon={Package} label="COGS" tone="neutral" delay={0.03}
                value={formatIQD(profitSummary.totalCOGS)}
                sub={`${cogsPercent.toFixed(1)}% of revenue`}
            />
            <Kpi
                icon={gross >= 0 ? TrendingUp : TrendingDown} label="Gross Profit" tone={profitTone(gross)} delay={0.06}
                value={formatIQD(gross)}
                sub={`${profitSummary.grossProfitMargin.toFixed(1)}% margin`}
            />
            <Kpi
                icon={Layers} label="Operational" tone="neutral" delay={0.09}
                value={formatIQD(profitSummary.totalOperationalCost)}
                sub="Delivery · packaging · vials"
            />
            <Kpi
                icon={operating >= 0 ? TrendingUp : TrendingDown} label="Operating Profit" tone={profitTone(operating)} delay={0.12}
                value={formatIQD(operating)}
                sub={`${profitSummary.operatingProfitMargin.toFixed(1)}% margin`}
            />
            <Kpi
                icon={Wallet} label="Total Costs" tone="neutral" delay={0.15}
                value={formatIQD(profitSummary.totalCost)}
                sub={profitSummary.marketingCost > 0 ? "Incl. marketing" : "No marketing yet"}
            />
            <Kpi
                icon={net >= 0 ? TrendingUp : TrendingDown} label="Net Profit" tone={profitTone(net)} delay={0.18} hero
                value={formatIQD(net)}
                sub={`${profitSummary.netProfitMargin.toFixed(1)}% margin`}
            />
            <Kpi
                icon={Target} label="In Transit" tone="warn" delay={0.21}
                value={String(pipelineSummary.orderCount)}
                sub={`${formatIQD(pipelineSummary.potentialRevenue)} upside`}
            />
        </div>
    );
}
