"use client";

import { motion } from "framer-motion";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { cn } from "@/lib/utils";
import type { RefundsImpact as RefundsData } from "@/hooks/use-finance-revenue";

interface Props {
    data: RefundsData;
}

export function RefundsImpact({ data }: Props) {
    const healthy = data.refund_rate_pct < 2;
    const warning = data.refund_rate_pct >= 2 && data.refund_rate_pct < 5;
    const critical = data.refund_rate_pct >= 5;

    const tone = critical
        ? "rose"
        : warning
            ? "amber"
            : "emerald";

    return (
        <SectionCard
            title="Refunds & Returns"
            subtitle={data.refund_count === 0 ? "Clean period — no refunds" : `${data.refund_count} refund${data.refund_count === 1 ? "" : "s"} this period`}
            icon={RotateCcw}
            accent={tone === "rose" ? "rose" : tone === "amber" ? "amber" : "emerald"}
        >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                <StatTile
                    label="Refund value"
                    value={
                        <FinanceValue value={data.refund_value} abbreviate className="text-xl font-bold text-foreground tabular-nums" />
                    }
                />
                <StatTile
                    label="Refund count"
                    value={
                        <span className="text-xl font-bold text-foreground tabular-nums">
                            {data.refund_count}
                        </span>
                    }
                />
                <StatTile
                    label="Refund rate"
                    highlight={tone}
                    value={
                        <span className={cn(
                            "text-xl font-bold tabular-nums",
                            critical ? "text-rose-600 dark:text-rose-400" :
                                warning ? "text-amber-600 dark:text-amber-400" :
                                    "text-emerald-600 dark:text-emerald-400"
                        )}>
                            {data.refund_rate_pct.toFixed(1)}%
                        </span>
                    }
                    sublabel={critical ? "Above 5% — investigate" : warning ? "Above 2% — keep an eye" : "Healthy (< 2%)"}
                />
            </div>

            {data.top_refunded.length > 0 && (
                <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3" />
                        Top refunded products
                    </div>
                    <div className="space-y-1.5">
                        {data.top_refunded.map((p, i) => {
                            const pct = data.refund_value > 0 ? (p.value / data.refund_value) * 100 : 0;
                            return (
                                <motion.div
                                    key={p.name}
                                    initial={{ opacity: 0, x: -6 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.04, duration: 0.22 }}
                                    className="relative rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] overflow-hidden"
                                >
                                    <div
                                        className="absolute inset-y-0 left-0 bg-rose-500/10"
                                        style={{ width: `${pct}%` }}
                                    />
                                    <div className="relative flex items-center justify-between px-3 py-2 gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[12.5px] font-medium text-foreground truncate">{p.name}</div>
                                            <div className="text-[10.5px] text-muted">{p.count} unit{p.count === 1 ? "" : "s"} returned</div>
                                        </div>
                                        <FinanceValue
                                            value={p.value}
                                            abbreviate
                                            className="text-[13px] font-semibold text-rose-600 dark:text-rose-400 tabular-nums"
                                        />
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            )}
        </SectionCard>
    );
}

interface StatTileProps {
    label: string;
    value: React.ReactNode;
    sublabel?: string;
    highlight?: "emerald" | "amber" | "rose";
}

function StatTile({ label, value, sublabel, highlight }: StatTileProps) {
    const border = highlight === "rose"
        ? "border-rose-500/30"
        : highlight === "amber"
            ? "border-amber-500/30"
            : highlight === "emerald"
                ? "border-emerald-500/30"
                : "border-[var(--card-border)]";
    return (
        <div className={cn("rounded-xl border bg-[var(--card-bg)] p-3.5", border)}>
            <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1">{label}</div>
            {value}
            {sublabel && <div className="text-[10.5px] text-muted mt-1">{sublabel}</div>}
        </div>
    );
}
