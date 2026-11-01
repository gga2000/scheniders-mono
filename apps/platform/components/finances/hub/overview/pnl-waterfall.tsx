"use client";

import { useLanguage } from "@/hooks/use-language";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GitFork, Percent, Hash } from "lucide-react";
import { FinanceValue } from "../primitives/finance-value";
import { SectionCard } from "../primitives/section-card";
import { cn } from "@/lib/utils";
import type { FinanceOverviewResult } from "@/hooks/use-finance-overview";

interface Step {
    id: string;
    label: string;
    value: number;
    kind: "base" | "deduction" | "result" | "addition";
}

interface PnLWaterfallProps {
    data: FinanceOverviewResult;
}

export function PnLWaterfall({ data }: PnLWaterfallProps) {
    const { t } = useLanguage();
    const [mode, setMode] = useState<"abs" | "pct">("abs");

    const steps: Step[] = useMemo(() => {
        // Walk from delivered revenue to net profit so the bottom line matches
        // HeroStrip and use-finance-overview (which compute profit on realized cash only).
        const delivered = data.delivered_revenue;
        const gross_profit = delivered - data.product_cost;
        const net_profit = gross_profit - data.refund_value - data.expenses;
        const undelivered = Math.max(0, data.gross_revenue - delivered);

        return [
            { id: "gross", label: t("finances.pnl.gross"), value: data.gross_revenue, kind: "base" },
            { id: "undelivered", label: t("finances.pnl.inTransit"), value: -undelivered, kind: "deduction" },
            { id: "delivered_rev", label: t("finances.pnl.delivered"), value: delivered, kind: "result" },
            { id: "cogs", label: t("finances.pnl.cogs"), value: -data.product_cost, kind: "deduction" },
            { id: "gross_profit", label: t("finances.pnl.grossProfit"), value: gross_profit, kind: "result" },
            { id: "refunds", label: t("finances.pnl.refunds"), value: -data.refund_value, kind: "deduction" },
            { id: "expenses", label: t("finances.pnl.expenses"), value: -data.expenses, kind: "deduction" },
            { id: "net_profit", label: t("finances.pnl.netProfit"), value: net_profit, kind: "result" },
        ];
    }, [data, t]);

    const maxAbs = Math.max(...steps.map((s) => Math.abs(s.value)), 1);
    const baseRef = steps[0].value || 1;

    return (
        <SectionCard
            title={t("finances.pnl.title")}
            subtitle={t("finances.pnl.subtitle")}
            icon={GitFork}
            accent="emerald"
            action={
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-[var(--card-border)] bg-[var(--background)]">
                    <button
                        onClick={() => setMode("abs")}
                        className={cn(
                            "px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1",
                            mode === "abs" ? "bg-[var(--card-bg)] text-foreground shadow-sm" : "text-muted hover:text-foreground"
                        )}
                    >
                        <Hash className="w-3 h-3" />
                        IQD
                    </button>
                    <button
                        onClick={() => setMode("pct")}
                        className={cn(
                            "px-2 py-1 rounded text-[11px] font-medium transition-colors flex items-center gap-1",
                            mode === "pct" ? "bg-[var(--card-bg)] text-foreground shadow-sm" : "text-muted hover:text-foreground"
                        )}
                    >
                        <Percent className="w-3 h-3" />
                        %
                    </button>
                </div>
            }
        >
            {data.missing_cost_units > 0 && (
                <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
                    {t("finances.pnl.missingCost", { count: data.missing_cost_units })}
                </p>
            )}
            <div className="space-y-2">
                {steps.map((s, i) => {
                    const barPct = (Math.abs(s.value) / maxAbs) * 100;
                    const toneClass = toneFor(s);
                    const toneBar = toneBarFor(s);
                    const pctOfGross = baseRef > 0 ? (s.value / baseRef) * 100 : 0;
                    return (
                        <motion.div
                            key={s.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:flex"
                        >
                            <div className={cn("sm:w-44 sm:shrink-0 text-[13px] font-medium", toneClass)}>
                                {s.label}
                            </div>
                            <div className="relative h-6 rounded-md bg-[var(--background)] overflow-hidden col-span-2 row-start-2 sm:flex-1">
                                <div
                                    className={cn("absolute inset-y-0 left-0 rounded-md transition-all", toneBar)}
                                    style={{ width: `${barPct}%` }}
                                />
                            </div>
                            <div className={cn("sm:w-28 text-right tabular-nums text-[13px] font-semibold", toneClass)}>
                                {mode === "abs" ? (
                                    <FinanceValue value={s.value} currency="IQD" abbreviate signed={s.kind === "deduction" || s.kind === "addition"} />
                                ) : (
                                    <span>{pctOfGross >= 0 ? "" : "-"}{Math.abs(pctOfGross).toFixed(1)}%</span>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            <div className="mt-5 pt-4 border-t border-[var(--card-border)] grid grid-cols-3 gap-3 text-center">
                <Stat label={t("finances.pnl.netMargin")} value={`${data.margin_pct.toFixed(1)}%`} good={data.margin_pct >= 10} />
                <Stat label={t("finances.pnl.cogsRatio")} value={data.delivered_revenue > 0 ? `${((data.product_cost / data.delivered_revenue) * 100).toFixed(0)}%` : "—"} />
                <Stat label={t("finances.pnl.refundRatio")} value={data.delivered_revenue > 0 ? `${((data.refund_value / data.delivered_revenue) * 100).toFixed(1)}%` : "—"} />
            </div>
        </SectionCard>
    );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
    return (
        <div>
            <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</div>
            <div
                className={cn(
                    "text-lg font-bold tabular-nums mt-0.5",
                    good === undefined ? "text-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                )}
            >
                {value}
            </div>
        </div>
    );
}

function toneFor(s: Step): string {
    if (s.kind === "deduction") return "text-rose-600 dark:text-rose-400";
    if (s.kind === "addition") return "text-emerald-600 dark:text-emerald-400";
    if (s.id === "net_profit") return s.value >= 0 ? "text-emerald-700 dark:text-emerald-300 font-bold" : "text-rose-700 dark:text-rose-300 font-bold";
    if (s.kind === "result") return "text-foreground font-semibold";
    return "text-foreground";
}
function toneBarFor(s: Step): string {
    if (s.kind === "deduction") return "bg-rose-500/35 dark:bg-rose-500/45";
    if (s.kind === "addition") return "bg-emerald-500/35 dark:bg-emerald-500/45";
    if (s.id === "net_profit") return s.value >= 0
        ? "bg-emerald-500/45 dark:bg-emerald-500/55"
        : "bg-rose-500/45 dark:bg-rose-500/55";
    if (s.kind === "result") return "bg-emerald-500/30 dark:bg-emerald-500/40";
    return "bg-emerald-500/35 dark:bg-emerald-500/45";
}
