"use client";

import { motion } from "framer-motion";
import { Radio } from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { ChannelPnLRow } from "@/hooks/use-finance-revenue";

interface Props {
    rows: ChannelPnLRow[];
}

export function ChannelPnL({ rows }: Props) {
    const { t } = useLanguage();
    if (rows.length === 0) {
        return (
            <SectionCard
                title={t("finances.channel.title")}
                subtitle={t("finances.channel.empty")}
                icon={Radio}
                accent="cyan"
            >
                <div className="py-10 text-center text-sm text-muted">
                    {t("finances.channel.emptyBody")}
                </div>
            </SectionCard>
        );
    }

    const maxRev = Math.max(...rows.map((r) => r.revenue), 1);

    return (
        <SectionCard
            title={t("finances.channel.title")}
            subtitle={t("finances.channel.sub")}
            icon={Radio}
            accent="cyan"
        >
            <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-[12.5px]">
                    <thead>
                        <tr className="text-[10.5px] uppercase tracking-wider text-muted font-semibold border-b border-[var(--card-border)]">
                            <th className="text-left py-2 pr-3 font-semibold">{t("finances.channel.col.channel")}</th>
                            <th className="text-right py-2 px-2 font-semibold">{t("finances.channel.col.revenue")}</th>
                            <th className="text-right py-2 px-2 font-semibold">{t("finances.channel.col.cogs")}</th>
                            <th className="text-right py-2 px-2 font-semibold">{t("finances.channel.col.profit")}</th>
                            <th className="text-right py-2 pl-2 font-semibold">{t("finances.channel.col.margin")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => {
                            const bar = (r.revenue / maxRev) * 100;
                            const marginTone = r.margin_pct < 0
                                ? "text-rose-600 dark:text-rose-400"
                                : r.margin_pct < 10
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-emerald-600 dark:text-emerald-400";
                            return (
                                <motion.tr
                                    key={r.key}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.04, duration: 0.25 }}
                                    className="border-b border-[var(--card-border)]/60 last:border-0 hover:bg-[var(--background)]/40"
                                >
                                    <td className="py-2.5 pr-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                                            <span className="text-foreground font-medium truncate">{r.label}</span>
                                            <span className="text-[10.5px] text-muted shrink-0">· {t("finances.channel.ord", { count: r.orders })}</span>
                                        </div>
                                        <div className="mt-1 h-1 rounded-full bg-[var(--card-border)] overflow-hidden max-w-[220px]">
                                            <div
                                                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                                                style={{ width: `${bar}%` }}
                                            />
                                        </div>
                                    </td>
                                    <td className="py-2 px-2 text-right tabular-nums text-foreground font-semibold">
                                        <FinanceValue value={r.revenue} abbreviate className="tabular-nums" />
                                    </td>
                                    <td className="py-2 px-2 text-right tabular-nums text-muted">
                                        <FinanceValue value={r.product_cost} abbreviate className="tabular-nums" />
                                    </td>
                                    <td className="py-2 px-2 text-right tabular-nums">
                                        <FinanceValue value={r.gross_profit} abbreviate signed className={cn("tabular-nums font-semibold", marginTone)} />
                                    </td>
                                    <td className={cn("py-2 pl-2 text-right tabular-nums font-semibold", marginTone)}>
                                        {r.product_cost > 0
                                            ? `${r.margin_pct.toFixed(1)}%`
                                            : <span className="text-muted">—</span>}
                                    </td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </SectionCard>
    );
}
