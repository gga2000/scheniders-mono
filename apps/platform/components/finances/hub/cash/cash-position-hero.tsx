"use client";

import { motion } from "framer-motion";
import { Landmark, Truck, Clock, AlertTriangle, Target } from "lucide-react";
import { FinanceValue } from "../primitives/finance-value";
import { Sparkline } from "../primitives/sparkline";
import { cn } from "@/lib/utils";
import type { CashPositionResult } from "@/hooks/use-cash-position";

interface Props {
    data: CashPositionResult;
}

export function CashPositionHero({ data }: Props) {
    const floatSeries = data.cashSeries.map((s) => s.float);
    const collectedSeries = data.cashSeries.map((s) => s.collected);

    const tiles = [
        {
            id: "collected",
            label: "Collected",
            sublabel: "Delivered & paid",
            value: data.cashCollected,
            Icon: Landmark,
            accent: "emerald" as const,
            series: collectedSeries,
            priority: true,
        },
        {
            id: "transit",
            label: "In Transit",
            sublabel: `${data.inTransitCount} orders floating`,
            value: data.cashInTransit,
            Icon: Truck,
            accent: "cyan" as const,
            series: floatSeries,
        },
        {
            id: "confirmed",
            label: "Confirmed",
            sublabel: `${data.confirmedCount} not shipped yet`,
            value: data.cashConfirmed,
            Icon: Clock,
            accent: "violet" as const,
            series: [],
        },
        {
            id: "risk",
            label: "At Risk",
            sublabel: data.stuckCount > 0 ? `${data.stuckCount} orders stuck 15+ days` : "No stuck orders",
            value: data.cashAtRisk,
            Icon: AlertTriangle,
            accent: "rose" as const,
            series: [],
            warning: data.cashAtRisk > 0,
        },
        {
            id: "projection",
            label: "Projected Cash",
            sublabel: `@${data.historicalDeliveryRate.toFixed(0)}% delivery rate`,
            value: data.netProjection,
            Icon: Target,
            accent: "slate" as const,
            series: [],
            dashed: true,
        },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3"
        >
            {tiles.map((t, i) => (
                <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={cn(
                        "relative rounded-2xl border p-4 overflow-hidden",
                        "bg-[var(--card-bg)] border-[var(--card-border)]",
                        t.priority && "ring-1 ring-emerald-500/30",
                        t.warning && "ring-1 ring-rose-500/30",
                        t.dashed && "border-dashed"
                    )}
                >
                    <div className="flex items-start justify-between mb-2">
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", accentBg(t.accent))}>
                            <t.Icon className={cn("w-4 h-4", accentText(t.accent))} />
                        </div>
                    </div>
                    <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">{t.label}</div>
                    <div className="mt-1">
                        <FinanceValue
                            value={t.value}
                            currency="IQD"
                            abbreviate
                            className={cn("text-[22px] leading-none", accentText(t.accent))}
                        />
                    </div>
                    <div className="text-[11px] text-muted mt-1 truncate">{t.sublabel}</div>
                    {t.series.length > 0 && (
                        <div className={cn("mt-2 -mb-1", accentText(t.accent))}>
                            <Sparkline
                                data={t.series}
                                width={180}
                                height={22}
                                stroke="currentColor"
                                fill={accentFill(t.accent)}
                            />
                        </div>
                    )}
                </motion.div>
            ))}
        </motion.div>
    );
}

function accentBg(a: string): string {
    switch (a) {
        case "emerald": return "bg-emerald-500/10";
        case "rose": return "bg-rose-500/10";
        case "amber": return "bg-amber-500/10";
        case "violet": return "bg-violet-500/10";
        case "cyan": return "bg-cyan-500/10";
        default: return "bg-slate-500/10";
    }
}
function accentText(a: string): string {
    switch (a) {
        case "emerald": return "text-emerald-600 dark:text-emerald-400";
        case "rose": return "text-rose-600 dark:text-rose-400";
        case "amber": return "text-amber-600 dark:text-amber-400";
        case "violet": return "text-violet-600 dark:text-violet-400";
        case "cyan": return "text-cyan-600 dark:text-cyan-400";
        default: return "text-slate-600 dark:text-slate-400";
    }
}
function accentFill(a: string): string {
    switch (a) {
        case "emerald": return "rgba(16,185,129,0.14)";
        case "rose": return "rgba(244,63,94,0.14)";
        case "amber": return "rgba(245,158,11,0.14)";
        case "violet": return "rgba(139,92,246,0.14)";
        case "cyan": return "rgba(6,182,212,0.14)";
        default: return "rgba(100,116,139,0.12)";
    }
}
