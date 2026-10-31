"use client";

import { ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";
import { FinanceValue } from "../primitives/finance-value";
import { SectionCard } from "../primitives/section-card";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { FinanceOverviewResult } from "@/hooks/use-finance-overview";

interface TopMoversProps {
    data: FinanceOverviewResult;
}

export function TopMovers({ data }: TopMoversProps) {
    const { t } = useLanguage();
    const { top_gainer_product, top_loser_product, top_gainer_channel, top_loser_channel } = data;

    const items = [
        {
            id: "gain_prod",
            kind: "gain" as const,
            label: t("finances.overview.movers.prodGain"),
            entity: top_gainer_product?.name || "—",
            delta: top_gainer_product?.delta || 0,
            context: top_gainer_product ? t("finances.overview.movers.prodUp", { name: top_gainer_product.name }) : t("finances.overview.movers.none"),
        },
        {
            id: "lose_prod",
            kind: "lose" as const,
            label: t("finances.overview.movers.prodDrop"),
            entity: top_loser_product?.name || "—",
            delta: top_loser_product?.delta || 0,
            context: top_loser_product ? t("finances.overview.movers.prodDown", { name: top_loser_product.name }) : t("finances.overview.movers.none"),
        },
        {
            id: "gain_ch",
            kind: "gain" as const,
            label: t("finances.overview.movers.chGain"),
            entity: top_gainer_channel?.name || "—",
            delta: top_gainer_channel?.delta || 0,
            context: top_gainer_channel ? t("finances.overview.movers.chUp", { name: top_gainer_channel.name }) : t("finances.overview.movers.none"),
        },
        {
            id: "lose_ch",
            kind: "lose" as const,
            label: t("finances.overview.movers.chDrop"),
            entity: top_loser_channel?.name || "—",
            delta: top_loser_channel?.delta || 0,
            context: top_loser_channel ? t("finances.overview.movers.chDown", { name: top_loser_channel.name }) : t("finances.overview.movers.none"),
        },
    ];

    return (
        <SectionCard
            title={t("finances.overview.movers.title")}
            subtitle={t("finances.overview.movers.sub")}
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
                            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-1">
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
