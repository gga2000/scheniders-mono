"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import {
    statusFlags, codRiskKey, customerAccent, type ValueTier, type RiskLevel,
} from "@/lib/customer-reliability";
import { CustomerHeroBand, RiskChip } from "@/components/customers/reliability-pill";

export interface CustomerReliability {
    total_orders: number;
    total_spent: number;
    completed_count: number;
    cancelled_count: number;
    no_response_count: number;
    rejected_count: number;
    returned_count: number;
    refund_count: number;
    value_tier: ValueTier;
    risk_level: RiskLevel;
}

/**
 * Full-width VALUE + RISK headline for the customer profile page — the same
 * two-axis model as the list, the dialog and the order-creation panel, so the
 * full profile no longer disagrees with everywhere else. Fed by get_customer_reliability.
 */
export function CustomerValueRiskBanner({ reliability, successRate }: {
    reliability: CustomerReliability | null;
    /** The trust engine's delivery rate (finished orders only), the same figure the delivery card shows. */
    successRate: number;
}) {
    const { t } = useLanguage();
    if (!reliability || reliability.total_orders === 0) return null;

    const value = reliability.value_tier;
    const risk = reliability.risk_level;
    const accent = customerAccent(value, risk);
    // Orders still on the road have neither succeeded nor failed: with none
    // finished there is no rate yet, not a 0%.
    const finished = reliability.completed_count + reliability.cancelled_count + reliability.no_response_count
        + reliability.rejected_count + reliability.returned_count;
    const flags = statusFlags(reliability);

    return (
        <div className={cn("rounded-3xl border border-(--card-border) p-5 flex flex-col lg:flex-row lg:items-center gap-4", accent.surfaceBg)}>
            <div className="flex items-center gap-3 flex-wrap">
                {/* An unsafe customer leads with the risk, like the list card and the drawer. */}
                <CustomerHeroBand tier={value} risk={risk} className="bg-white/60 dark:bg-white/10" />
                {risk !== "blocked" && risk !== "high" && <RiskChip risk={risk} showClean />}
            </div>

            <div className={cn("text-sm font-medium lg:max-w-[280px]", accent.surfaceText)}>
                {t(codRiskKey(risk))}
            </div>

            <div className="flex items-center gap-5 lg:ml-auto">
                {[
                    { v: reliability.total_orders.toLocaleString("en-US"), k: t("customers.orders") },
                    { v: reliability.completed_count.toLocaleString("en-US"), k: t("customers.card.delivered", "Delivered") },
                    { v: finished > 0 ? `${Math.round(successRate)}%` : "—", k: t("customers.table.success", "Success") },
                ].map((s) => (
                    <div key={s.k} className={cn("text-center", accent.surfaceText)}>
                        <div className="font-mono text-2xl font-extrabold tabular-nums leading-none">{s.v}</div>
                        <div className="text-[11px] opacity-70 mt-1">{s.k}</div>
                    </div>
                ))}
            </div>

            {flags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {flags.map((f) => (
                        <span key={f.key} className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full", f.tone)}>
                            <span className="font-mono tabular-nums">{f.count}</span>
                            {t(f.i18nKey)}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
