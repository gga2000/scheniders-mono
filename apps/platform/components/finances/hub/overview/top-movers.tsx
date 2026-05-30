"use client";

import { ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";
import { FinanceValue } from "../primitives/finance-value";
import { SectionCard } from "../primitives/section-card";
import { cn } from "@/lib/utils";
import type { FinanceOverviewResult } from "@/hooks/use-finance-overview";

interface TopMoversProps {
    data: FinanceOverviewResult;
}

export function TopMovers({ data }: TopMoversProps) {
    const { top_gainer_product, top_loser_product, top_gainer_channel, top_loser_channel } = data;

    const items = [
        {
            id: "gain_prod",
            kind: "gain" as const,
            label: "Biggest product gain",
            entity: top_gainer_product?.name || "—",
            delta: top_gainer_product?.delta || 0,
            context: top_gainer_product ? `${top_gainer_product.name} revenue is up` : "No change",
        },
        {
            id: "lose_prod",
            kind: "lose" as const,
            label: "Biggest product drop",
            entity: top_loser_product?.name || "—",
            delta: top_loser_product?.delta || 0,
            context: top_loser_product ? `${top_loser_product.name} revenue is down` : "No change",
        },
        {
            id: "gain_ch",
            kind: "gain" as const,
            label: "Biggest channel gain",
            entity: top_gainer_channel?.name || "—",
            delta: top_gainer_channel?.delta || 0,
            context: top_gainer_channel ? `${top_gainer_channel.name} is carrying growth` : "No change",
        },
        {
            id: "lose_ch",
            kind: "lose" as const,
            label: "Biggest channel drop",
            entity: top_loser_channel?.name || "—",
            delta: top_loser_channel?.delta || 0,
            context: top_loser_channel ? `${top_loser_channel.name} is slowing` : "No change",
        },
    ];

    return (
        <SectionCard
            title="Top Movers"
            subtitle="vs. previous period"
            icon={Sparkles}
            accent="amber"
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map((it) => {
                    const isGain = it.delta > 0;
                    const isLoss = it.delta < 0;
                    const show = isGain || isLoss;
                    return (
                        <div
                            key={it.id}
                            className={cn(
                                "rounded-xl p-3 border bg-[var(--background)] border-[var(--card-border)]"
                            )}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] uppercase tracking-wider text-muted font-semibold">{it.label}</span>
                                {show && (
                                    <span
                                        className={cn(
                                            "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums rounded-full px-1.5 py-0.5",
                                            it.kind === "gain"
                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                        )}
                                    >
                                        {isGain ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                        <FinanceValue value={it.delta} currency="IQD" abbreviate signed />
                                    </span>
                                )}
                            </div>
                            <div className="text-[14px] font-semibold text-foreground truncate">{it.entity}</div>
                            <div className="text-[11px] text-muted mt-0.5">{it.context}</div>
                        </div>
                    );
                })}
            </div>
        </SectionCard>
    );
}
