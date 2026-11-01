"use client";

import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { LTVBucket } from "@/hooks/use-finance-customers";

interface Props {
    buckets: LTVBucket[];
}

export function CustomersLtvDistribution({ buckets }: Props) {
    const { t } = useLanguage();
    const total = buckets.reduce((s, b) => s + b.count, 0);
    const maxCount = Math.max(...buckets.map((b) => b.count), 1);

    if (total === 0) {
        return (
            <SectionCard
                title={t("finances.cust.ltvDist.title")}
                subtitle={t("finances.cust.ltvDist.emptySub")}
                icon={BarChart3}
                accent="violet"
            >
                <div className="py-10 text-center text-sm text-muted">
                    {t("finances.cust.ltvDist.empty")}
                </div>
            </SectionCard>
        );
    }

    return (
        <SectionCard
            title={t("finances.cust.ltvDist.title")}
            subtitle={(() => {
                const filled = buckets.filter((b) => b.count > 0).length;
                return filled === 1
                    ? t("finances.cust.ltvDist.subOne", { total })
                    : t("finances.cust.ltvDist.sub", { total, filled });
            })()}
            icon={BarChart3}
            accent="violet"
        >
            <div className="space-y-2">
                {buckets.map((b, i) => {
                    const widthPct = (b.count / maxCount) * 100;
                    const tone = bucketTone(i, buckets.length);
                    return (
                        <motion.div
                            key={b.label}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04, duration: 0.22 }}
                            className="grid grid-cols-[80px_1fr_56px_72px] items-center gap-3 text-[12px]"
                        >
                            <div className="text-[11px] text-muted font-semibold tabular-nums">{b.label}</div>
                            <div className="relative h-6 rounded-md bg-[var(--background)]/50 overflow-hidden">
                                <div
                                    className={cn("absolute inset-y-0 left-0 rounded-md", tone.bg)}
                                    style={{ width: `${widthPct}%` }}
                                />
                                <div className="absolute inset-0 flex items-center px-2 text-[11px] font-semibold tabular-nums">
                                    <span className={tone.text}>{b.count}</span>
                                </div>
                            </div>
                            <div className="text-right text-[11px] text-muted tabular-nums">{b.share_pct.toFixed(0)}%</div>
                            <div className="text-right">
                                <FinanceValue value={b.revenue} abbreviate className="text-[11px] font-medium text-foreground tabular-nums" />
                            </div>
                        </motion.div>
                    );
                })}
            </div>
            <div className="mt-3 grid grid-cols-[80px_1fr_56px_72px] gap-3 text-[10.5px] uppercase tracking-wider text-muted font-semibold">
                <div>{t("finances.cust.ltvDist.range")}</div>
                <div>{t("finances.cust.ltvDist.customers")}</div>
                <div className="text-right">{t("finances.cust.ltvDist.share")}</div>
                <div className="text-right">{t("finances.cust.ltvDist.revenue")}</div>
            </div>
        </SectionCard>
    );
}

function bucketTone(idx: number, total: number) {
    const pct = idx / Math.max(total - 1, 1);
    if (pct < 0.2) return { bg: "bg-slate-500/30", text: "text-foreground" };
    if (pct < 0.4) return { bg: "bg-cyan-500/30", text: "text-foreground" };
    if (pct < 0.7) return { bg: "bg-violet-500/40", text: "text-foreground" };
    return { bg: "bg-emerald-500/40", text: "text-foreground" };
}
