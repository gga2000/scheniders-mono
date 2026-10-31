"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertOctagon, ExternalLink, Phone, MapPin } from "lucide-react";
import { SectionCard } from "../primitives/section-card";
import { FinanceValue } from "../primitives/finance-value";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import type { StuckOrder } from "@/hooks/use-cash-position";

interface Props {
    orders: StuckOrder[];
}

export function StuckInTransit({ orders }: Props) {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? orders : orders.slice(0, 5);

    const totalValue = orders.reduce((s, o) => s + o.price, 0);

    return (
        <SectionCard
            title={t("finances.cash.stuckTitle")}
            subtitle={
                orders.length === 0
                    ? t("finances.cash.stuckClean")
                    : t("finances.cash.stuckSub", { count: orders.length, value: formatAbbrev(totalValue) })
            }
            icon={AlertOctagon}
            accent={orders.length > 0 ? "rose" : "emerald"}
            action={
                orders.length > 5 ? (
                    <button
                        onClick={() => setExpanded((x) => !x)}
                        className="text-[11px] font-medium text-muted hover:text-foreground transition-colors"
                    >
                        {expanded ? t("finances.cash.showLess") : t("finances.cash.showAll", { count: orders.length })}
                    </button>
                ) : undefined
            }
        >
            {orders.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted">
                    {t("finances.cash.stuckEmpty")}
                </div>
            ) : (
                <div className="space-y-1.5">
                    {visible.map((o, i) => (
                        <motion.div
                            key={o.id}
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(i * 0.02, 0.3) }}
                            className="group flex items-center gap-3 px-2 sm:px-3 py-2.5 rounded-xl hover:bg-[var(--background)] transition-colors"
                        >
                            <AgePill days={o.days_in_transit} unit={t("finances.cash.daysUnit")} />

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-foreground text-[13px] truncate">
                                        {o.customer_name}
                                    </span>
                                    {o.sequence_number !== undefined && (
                                        <span className="text-[10px] font-mono text-muted shrink-0">#{o.sequence_number}</span>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-muted">
                                    <span className="flex items-center gap-1">
                                        <Phone className="w-3 h-3 shrink-0" />
                                        {o.phone}
                                    </span>
                                    {o.city && (
                                        <span className="flex items-center gap-1">
                                            <MapPin className="w-3 h-3 shrink-0" />
                                            {o.city}
                                        </span>
                                    )}
                                    {o.delivery_company && (
                                        <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 rounded bg-[var(--card-border)]">
                                            {o.delivery_company}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="text-right shrink-0">
                                <FinanceValue
                                    value={o.price}
                                    currency="IQD"
                                    abbreviate
                                    className="text-[13px] text-foreground"
                                />
                            </div>

                            <Link
                                href={`/orders?orderId=${o.id}`}
                                className="shrink-0 w-7 h-7 rounded-lg border border-[var(--card-border)] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:border-[var(--ink)] transition-all"
                                aria-label={t("finances.cash.openOrder", { id: o.order_id })}
                            >
                                <ExternalLink className="w-3 h-3" />
                            </Link>
                        </motion.div>
                    ))}
                </div>
            )}
        </SectionCard>
    );
}

function AgePill({ days, unit }: { days: number; unit: string }) {
    const tone = days >= 15
        ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
        : "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30";
    return (
        <div className={cn("shrink-0 w-14 text-center px-2 py-1 rounded-lg border text-[11px] font-bold tabular-nums", tone)}>
            {days} {unit}
        </div>
    );
}

function formatAbbrev(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return `${n}`;
}
