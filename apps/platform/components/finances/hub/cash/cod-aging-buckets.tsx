"use client";

import { motion } from "framer-motion";
import { Clock3 } from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { cn } from "@/lib/utils";
import type { AgingBucket } from "@/hooks/use-cash-position";

interface Props {
    buckets: AgingBucket[];
    oldestStuckDays: number;
}

export function CODAgingBuckets({ buckets, oldestStuckDays }: Props) {
    const totalCount = buckets.reduce((s, b) => s + b.count, 0);
    const totalValue = buckets.reduce((s, b) => s + b.value, 0);

    const subtitle = totalCount > 0
        ? `${totalCount} orders floating · oldest ${oldestStuckDays}d`
        : "Nothing in transit right now";

    return (
        <SectionCard
            title="COD Aging"
            subtitle={subtitle}
            icon={Clock3}
            accent="amber"
        >
            {totalCount === 0 ? (
                <div className="py-8 text-center text-sm text-muted">
                    No orders in transit — either everything delivered or nothing shipped yet.
                </div>
            ) : (
                <div className="space-y-2.5">
                    {buckets.map((b, i) => {
                        const pctCount = totalCount > 0 ? (b.count / totalCount) * 100 : 0;
                        const pctValue = totalValue > 0 ? (b.value / totalValue) * 100 : 0;
                        return (
                            <motion.div
                                key={b.id}
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.04 }}
                            >
                                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                                    <div className="flex items-baseline gap-2 min-w-0">
                                        <span className={cn("text-[13px] font-semibold", toneText(b.tone))}>
                                            {b.label}
                                        </span>
                                        <span className="text-[11px] text-muted tabular-nums">{b.range}</span>
                                    </div>
                                    <div className="flex items-baseline gap-3 shrink-0 tabular-nums">
                                        <span className="text-[12px] text-muted">
                                            {b.count} {b.count === 1 ? "order" : "orders"}
                                        </span>
                                        <FinanceValue
                                            value={b.value}
                                            currency="IQD"
                                            abbreviate
                                            className={cn("text-[13px]", toneText(b.tone))}
                                        />
                                    </div>
                                </div>
                                <div className="relative h-2.5 rounded-full bg-[var(--background)] overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${pctCount}%` }}
                                        transition={{ duration: 0.5, delay: i * 0.04 + 0.1, ease: "easeOut" }}
                                        className={cn("absolute inset-y-0 left-0 rounded-full", toneBar(b.tone))}
                                    />
                                </div>
                                <div className="flex items-center justify-between mt-1 text-[10px] text-muted">
                                    <span>{pctCount.toFixed(0)}% of orders</span>
                                    <span>{pctValue.toFixed(0)}% of floating IQD</span>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {totalCount > 0 && (
                <div className="mt-5 pt-4 border-t border-[var(--card-border)] grid grid-cols-3 gap-2 text-center">
                    <MiniStat label="Avg hold" value={calcAvgHold(buckets)} />
                    <MiniStat label="Stuck IQD" value={formatAbbrev(buckets.find((b) => b.id === "stuck")?.value || 0)} warning={buckets.find((b) => b.id === "stuck")?.count ? true : false} />
                    <MiniStat label="Stale IQD" value={formatAbbrev(buckets.find((b) => b.id === "stale")?.value || 0)} />
                </div>
            )}
        </SectionCard>
    );
}

function MiniStat({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
    return (
        <div>
            <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">{label}</div>
            <div className={cn("text-sm font-bold tabular-nums mt-0.5", warning ? "text-rose-600 dark:text-rose-400" : "text-foreground")}>
                {value}
            </div>
        </div>
    );
}

function calcAvgHold(buckets: AgingBucket[]): string {
    const total = buckets.reduce((s, b) => s + b.count, 0);
    if (total === 0) return "—";
    const midpoints: Record<string, number> = { fresh: 1.5, aging: 5.5, stale: 11, stuck: 20 };
    const weighted = buckets.reduce((s, b) => s + b.count * (midpoints[b.id] || 0), 0);
    return `${(weighted / total).toFixed(1)}d`;
}

function formatAbbrev(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return `${n}`;
}

function toneText(t: AgingBucket["tone"]): string {
    switch (t) {
        case "emerald": return "text-emerald-600 dark:text-emerald-400";
        case "amber": return "text-amber-600 dark:text-amber-400";
        case "orange": return "text-orange-600 dark:text-orange-400";
        case "rose": return "text-rose-600 dark:text-rose-400";
    }
}

function toneBar(t: AgingBucket["tone"]): string {
    switch (t) {
        case "emerald": return "bg-emerald-500/60";
        case "amber": return "bg-amber-500/60";
        case "orange": return "bg-orange-500/60";
        case "rose": return "bg-rose-500/60";
    }
}
