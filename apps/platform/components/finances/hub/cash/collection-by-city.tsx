"use client";

import { motion } from "framer-motion";
import { MapPin } from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { cn } from "@/lib/utils";
import { governorateLabel } from "@/lib/governorate-normalize";
import type { GovernorateCollection } from "@/hooks/use-cash-position";

interface Props {
    rows: GovernorateCollection[];
}

export function CollectionByCity({ rows }: Props) {
    const top = rows.slice(0, 10);
    const hasAtRisk = rows.some((r) => r.at_risk_value > 0);

    if (rows.length === 0) {
        return (
            <SectionCard
                title="Collection by City"
                subtitle="No city data yet"
                icon={MapPin}
                accent="violet"
            >
                <div className="py-8 text-center text-sm text-muted">
                    Need delivered or in-transit orders with city codes to populate this view.
                </div>
            </SectionCard>
        );
    }

    return (
        <SectionCard
            title="Collection by City"
            subtitle={`Delivery success rate across ${rows.length} cities`}
            icon={MapPin}
            accent="violet"
        >
            <div className="space-y-2">
                {top.map((r, i) => {
                    const rateTone =
                        r.rate >= 85 ? "text-emerald-600 dark:text-emerald-400" :
                            r.rate >= 70 ? "text-amber-600 dark:text-amber-400" :
                                "text-rose-600 dark:text-rose-400";
                    const barTone =
                        r.rate >= 85 ? "bg-emerald-500/60" :
                            r.rate >= 70 ? "bg-amber-500/60" :
                                "bg-rose-500/60";
                    return (
                        <motion.div
                            key={r.code}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="group"
                        >
                            <div className="flex items-center justify-between gap-3 mb-1">
                                <span className="text-[13px] font-medium text-foreground truncate" title={r.code}>
                                    {governorateLabel(r.code)}
                                </span>
                                <div className="flex items-center gap-3 shrink-0 tabular-nums">
                                    <span className={cn("text-[12px] font-semibold", rateTone)}>
                                        {r.rate.toFixed(0)}%
                                    </span>
                                    <FinanceValue
                                        value={r.delivered_value}
                                        currency="IQD"
                                        abbreviate
                                        className="text-[12px] text-muted"
                                    />
                                </div>
                            </div>
                            <div className="relative h-1.5 rounded-full bg-[var(--background)] overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, r.rate)}%` }}
                                    transition={{ duration: 0.5, delay: i * 0.03 + 0.1, ease: "easeOut" }}
                                    className={cn("absolute inset-y-0 left-0 rounded-full", barTone)}
                                />
                            </div>
                            <div className="mt-0.5 flex items-center gap-3 text-[10px] text-muted">
                                <span>{r.delivered}/{r.attempted} delivered</span>
                                {r.at_risk_value > 0 && (
                                    <span className="text-rose-500">
                                        · {formatAbbrev(r.at_risk_value)} at risk
                                    </span>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
            {hasAtRisk && (
                <div className="mt-4 pt-3 border-t border-[var(--card-border)] text-[11px] text-muted">
                    Cities with at-risk IQD have orders stuck 15+ days. Check those routes with your delivery partner.
                </div>
            )}
        </SectionCard>
    );
}

function formatAbbrev(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return `${n}`;
}
