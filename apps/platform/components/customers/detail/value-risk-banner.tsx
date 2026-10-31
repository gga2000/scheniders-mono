"use client";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import {
    statusFlags, codRiskKey, customerAccent, isFinishedOrder, RISK_META, type ValueTier, type RiskLevel,
} from "@/lib/customer-reliability";
import { Clock } from "lucide-react";
import { CustomerHeroBand } from "@/components/customers/reliability-pill";

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

type OutcomeTone = "delivered" | "failed" | "cancelled" | "open";

const OUTCOME_DOT: Record<OutcomeTone, string> = {
    delivered: "bg-emerald-500",
    failed: "bg-rose-500",
    cancelled: "bg-amber-500",
    open: "bg-blue-400",
};

function outcomeTone(status: string): OutcomeTone {
    const s = status.toLowerCase();
    if (s === "delivered" || s === "completed") return "delivered";
    if (s === "cancelled" || s === "canceled") return "cancelled";
    return isFinishedOrder(s) ? "failed" : "open";
}

/**
 * Full-width VALUE + RISK headline for the customer profile page: the same
 * two-axis model as the list, the drawer and the order-creation panel, plus
 * the order numbers, the delivery rate with the base it is computed on, and
 * the last few outcomes. It is the one place on the profile these figures live.
 */
export function CustomerValueRiskBanner({ reliability, successRate, orders }: {
    reliability: CustomerReliability | null;
    /** The trust engine's delivery rate: finished orders only. */
    successRate: number;
    /** Recent orders, newest first. */
    orders: { id: string; status: string }[];
}) {
    const { t } = useLanguage();
    if (!reliability || reliability.total_orders === 0) return null;

    const value = reliability.value_tier;
    const risk = reliability.risk_level;
    const accent = customerAccent(value, risk);
    // The rate's base: orders with a final outcome. Orders still on the road
    // have neither succeeded nor failed, so with none finished there is no rate yet.
    const finished = orders.filter((o) => isFinishedOrder(o.status)).length;
    const flags = statusFlags(reliability);
    const recent = orders.slice(0, 6).reverse();

    return (
        <div className={cn("rounded-2xl border border-(--card-border) px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-3", accent.surfaceBg)}>
            {/* An unsafe customer leads with the risk, like the list card and the drawer. */}
            <CustomerHeroBand tier={value} risk={risk} className="bg-white/60 dark:bg-white/10 py-2" />

            <div className={cn("text-sm font-medium min-w-0", accent.surfaceText)}>
                {/* Caution is an instruction: amber, not the value colour. */}
                {risk === "caution" ? (
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", RISK_META.caution.chipBg, RISK_META.caution.chipText)}>
                        <Clock className="w-3.5 h-3.5" />{t(codRiskKey(risk))}
                    </span>
                ) : t(codRiskKey(risk))}
                {flags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        {flags.map((f) => (
                            <span key={f.key} className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full", f.tone)}>
                                <span className="font-mono tabular-nums">{f.count}</span>
                                {t(f.i18nKey)}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            <div className={cn("flex items-end gap-6 ml-auto", accent.surfaceText)}>
                <div>
                    <div className="font-mono text-2xl font-extrabold tabular-nums leading-none">{reliability.total_orders.toLocaleString("en-US")}</div>
                    <div className="text-xs opacity-75 mt-1">{t("customers.orders")}</div>
                </div>
                <div>
                    <div className="font-mono text-2xl font-extrabold tabular-nums leading-none">{reliability.completed_count.toLocaleString("en-US")}</div>
                    <div className="text-xs opacity-75 mt-1">{t("customers.card.delivered", "Delivered")}</div>
                </div>
                <div>
                    <div className="font-mono text-2xl font-extrabold tabular-nums leading-none">{finished > 0 ? `${Math.round(successRate)}%` : "—"}</div>
                    <div className="text-xs opacity-75 mt-1 whitespace-nowrap">{t("customers.banner.rateBase", { count: finished.toLocaleString("en-US") })}</div>
                </div>
                {recent.length > 0 && (
                    <div>
                        <div className="flex items-center gap-1 h-6" aria-hidden>
                            {recent.map((o) => <span key={o.id} className={cn("w-2.5 h-5 rounded-sm", OUTCOME_DOT[outcomeTone(o.status)])} />)}
                        </div>
                        <div className="text-xs opacity-75 mt-1 whitespace-nowrap">{t("customers.banner.lastOutcomes", { count: String(recent.length) })}</div>
                    </div>
                )}
            </div>
        </div>
    );
}
