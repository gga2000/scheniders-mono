"use client";

import { motion } from "framer-motion";
import {
    TrendingUp, Wallet, Truck, HandCoins, PiggyBank, Landmark,
} from "lucide-react";
import { FinanceValue } from "../primitives/finance-value";
import { Delta } from "../primitives/delta";
import { Sparkline } from "../primitives/sparkline";
import { cn } from "@/lib/utils";
import type { FinanceOverviewResult } from "@/hooks/use-finance-overview";

interface HeroStripProps {
    data: FinanceOverviewResult;
    onTileClick?: (tile: HeroTileId) => void;
    activeTile?: HeroTileId | null;
}

export type HeroTileId =
    | "gross_revenue"
    | "net_profit"
    | "cash_realized"
    | "cash_float"
    | "aov"
    | "delivery_rate";

type TileSpec = {
    id: HeroTileId;
    label: string;
    sublabel: string;
    value: number;
    prevValue: number;
    series: number[];
    Icon: typeof TrendingUp;
    accent: string;
    currency?: "IQD" | "USD" | "none";
    decimals?: number;
    inverseDelta?: boolean;
    suffix?: string;
};

export function HeroStrip({ data, onTileClick, activeTile }: HeroStripProps) {
    const revSeries = data.series.map((s) => s.revenue);
    const profitSeries = data.series.map((s) => s.profit);
    const ordersSeries = data.series.map((s) => s.orders);
    const deliveredSeries = data.series.map((s) => s.delivered_revenue);

    const tiles: TileSpec[] = [
        {
            id: "gross_revenue",
            label: "Gross Revenue",
            sublabel: "All non-rejected orders",
            value: data.gross_revenue,
            prevValue: data.prev_gross_revenue,
            series: revSeries,
            Icon: TrendingUp,
            accent: "emerald",
        },
        {
            id: "net_profit",
            label: "Net Profit",
            sublabel: data.delivered_revenue > 0 ? `${data.margin_pct.toFixed(1)}% margin` : "No delivered orders yet",
            value: data.net_profit,
            prevValue: data.prev_net_profit,
            series: profitSeries,
            Icon: PiggyBank,
            accent: data.net_profit >= 0 ? "emerald" : "rose",
        },
        {
            id: "cash_realized",
            label: "Cash In",
            sublabel: "Delivered & collected",
            value: data.cash_realized,
            prevValue: data.prev_cash_realized,
            series: deliveredSeries,
            Icon: Landmark,
            accent: "cyan",
        },
        {
            id: "cash_float",
            label: "Cash Float",
            sublabel: "Confirmed · In transit",
            value: data.cash_float,
            prevValue: 0,
            series: [],
            Icon: Truck,
            accent: "amber",
            inverseDelta: false,
        },
        {
            id: "aov",
            label: "Avg Order Value",
            sublabel: `${data.orders_count} orders`,
            value: data.aov,
            prevValue: data.prev_aov,
            series: ordersSeries,
            Icon: HandCoins,
            accent: "violet",
        },
        {
            id: "delivery_rate",
            label: "Delivery Rate",
            sublabel: `${data.delivered_count} delivered`,
            value: data.delivery_rate,
            prevValue: 0,
            series: [],
            Icon: Wallet,
            accent: "slate",
            currency: "none",
            decimals: 1,
            suffix: "%",
        },
    ];

    const container = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.04 } },
    };
    const item = { hidden: { y: 12, opacity: 0 }, show: { y: 0, opacity: 1 } };

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
        >
            {tiles.map((t) => {
                const delta = t.prevValue > 0 ? ((t.value - t.prevValue) / t.prevValue) * 100 : null;
                const isActive = activeTile === t.id;
                return (
                    <motion.button
                        key={t.id}
                        variants={item}
                        onClick={() => onTileClick?.(t.id)}
                        className={cn(
                            "group relative text-left rounded-2xl border p-4 transition-all overflow-hidden",
                            "bg-[var(--card-bg)] border-[var(--card-border)] hover:border-[var(--ink)]",
                            isActive && "ring-2 ring-[var(--ink)]"
                        )}
                    >
                        <div className="flex items-start justify-between mb-2">
                            <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center",
                                accentToBg(t.accent)
                            )}>
                                <t.Icon className={cn("w-4 h-4", accentToText(t.accent))} />
                            </div>
                            {delta !== null && (
                                <Delta value={delta} size="sm" inverse={t.inverseDelta} />
                            )}
                        </div>
                        <div className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                            {t.label}
                        </div>
                        <div className="mt-1 flex items-baseline gap-1">
                            <FinanceValue
                                value={t.value}
                                currency={t.currency ?? "IQD"}
                                abbreviate
                                decimals={t.decimals}
                                className="text-[22px] leading-none text-foreground"
                            />
                            {t.suffix && (
                                <span className="text-sm font-semibold text-muted tabular-nums">{t.suffix}</span>
                            )}
                        </div>
                        <div className="text-[11px] text-muted mt-1 truncate">{t.sublabel}</div>
                        {t.series.length > 0 && (
                            <div className={cn("mt-2 -mb-1", accentToText(t.accent))}>
                                <Sparkline
                                    data={t.series}
                                    width={180}
                                    height={22}
                                    stroke="currentColor"
                                    fill={accentToFill(t.accent)}
                                    showDot
                                />
                            </div>
                        )}
                    </motion.button>
                );
            })}
        </motion.div>
    );
}

function accentToBg(a: string): string {
    switch (a) {
        case "emerald": return "bg-emerald-500/10";
        case "rose": return "bg-rose-500/10";
        case "amber": return "bg-amber-500/10";
        case "violet": return "bg-violet-500/10";
        case "cyan": return "bg-cyan-500/10";
        default: return "bg-slate-500/10";
    }
}
function accentToText(a: string): string {
    switch (a) {
        case "emerald": return "text-emerald-600 dark:text-emerald-400";
        case "rose": return "text-rose-600 dark:text-rose-400";
        case "amber": return "text-amber-600 dark:text-amber-400";
        case "violet": return "text-violet-600 dark:text-violet-400";
        case "cyan": return "text-cyan-600 dark:text-cyan-400";
        default: return "text-slate-600 dark:text-slate-400";
    }
}
function accentToFill(a: string): string {
    switch (a) {
        case "emerald": return "rgba(16,185,129,0.14)";
        case "rose": return "rgba(244,63,94,0.14)";
        case "amber": return "rgba(245,158,11,0.14)";
        case "violet": return "rgba(139,92,246,0.14)";
        case "cyan": return "rgba(6,182,212,0.14)";
        default: return "rgba(100,116,139,0.12)";
    }
}
