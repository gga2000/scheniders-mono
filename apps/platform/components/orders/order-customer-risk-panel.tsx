"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, Clock, Crown, Loader2, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import {
    statusFlags, codRiskKey, VALUE_META, RISK_META, type StatusFlag, type ValueTier, type RiskLevel,
} from "@/lib/customer-reliability";

interface ReliabilityRow {
    total_orders: number;
    completed_count: number;
    cancelled_count: number;
    no_response_count: number;
    rejected_count: number;
    returned_count: number;
    refund_count: number;
    recent_severe_count: number;
    is_blacklisted: boolean;
    value_tier: ValueTier;
    risk_level: RiskLevel;
}

/*
 * This panel sits in the Orders page's create-order modal, and the Orders page
 * changes look only through its own design review. So it keeps the colours and
 * icons it had before the customers pages unified theirs (round 30): the
 * customers palette (sky "Good", rose "Blocked", order-status flag tones) is
 * not applied here until that review adopts it.
 */
const PILL = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap";
type IconType = React.ComponentType<{ className?: string }>;
const VALUE_LOOK: Record<ValueTier, { tone: string; Icon: IconType }> = {
    vip: { tone: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-200", Icon: Crown },
    good: { tone: "bg-lime-50 text-lime-800 dark:bg-lime-500/15 dark:text-lime-200", Icon: ShieldCheck },
    newcomer: { tone: "bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200", Icon: Sparkles },
};
const RISK_LOOK: Record<RiskLevel, { tone: string; Icon: IconType }> = {
    clean: { tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", Icon: ShieldCheck },
    caution: { tone: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300", Icon: Clock },
    high: { tone: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300", Icon: AlertTriangle },
    blocked: { tone: "bg-zinc-800 text-white dark:bg-rose-500/20 dark:text-rose-200", Icon: Ban },
};
const FLAG_LOOK: Record<StatusFlag["key"], string> = {
    rejected: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    no_response: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    returned: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
    cancelled: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    refund: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
};

function normDigits(raw: string): string {
    return (raw || "").replace(/\D/g, "").replace(/^(964|0)/, "");
}

/**
 * COD-risk pre-flight for the order-creation modal: the customer's two-axis
 * VALUE + RISK (same SQL helpers as the customers console, via get_customer_reliability),
 * the factual outcome flags, and a prominent warning before shipping cash-on-delivery
 * to a high-risk or blocked customer.
 */
export function OrderCustomerRiskPanel({ phone }: { phone: string }) {
    const { t } = useLanguage();
    const norm = normDigits(phone);
    const enabled = norm.length >= 9;

    const { data, isFetching } = useQuery({
        queryKey: ["order-customer-reliability", norm],
        enabled,
        staleTime: 60 * 1000,
        queryFn: async (): Promise<ReliabilityRow | null> => {
            const { data, error } = await supabase.rpc("get_customer_reliability", { p_phone: norm });
            if (error) { console.error("reliability lookup failed:", error); return null; }
            const rows = (data as ReliabilityRow[]) ?? [];
            return rows[0] ?? null;
        },
    });

    if (!enabled) return null;

    if (isFetching && !data) {
        return (
            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t("orders.cod.checking", "Checking customer history…")}
            </div>
        );
    }

    // No prior orders → genuinely a new customer; keep it quiet, not alarming.
    if (!data || data.total_orders === 0) {
        return (
            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                <ShoppingBag className="w-3 h-3" />
                {t("orders.cod.newCustomer", "New customer · no order history yet")}
            </div>
        );
    }

    const success = data.total_orders > 0 ? Math.round((data.completed_count / data.total_orders) * 100) : 0;
    const flags = statusFlags(data);
    const danger = data.risk_level === "high" || data.risk_level === "blocked";
    const valueLook = VALUE_LOOK[data.value_tier];
    const riskLook = RISK_LOOK[data.risk_level];

    return (
        <div className="mt-1 space-y-1.5" dir="ltr">
            <div className="flex items-center gap-2 flex-wrap rounded-xl border border-(--card-border) bg-(--background) px-3 py-2">
                <span className={cn(PILL, valueLook.tone)}><valueLook.Icon className="w-3.5 h-3.5" />{t(`customers.value.${data.value_tier}`, VALUE_META[data.value_tier].label)}</span>
                <span className={cn(PILL, riskLook.tone)}><riskLook.Icon className="w-3.5 h-3.5" />{t(`customers.risk.${data.risk_level}`, RISK_META[data.risk_level].label)}</span>
                <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
                    {data.total_orders} {t("customers.orders").toLowerCase()} · {success}% {t("customers.card.delivered", "delivered")}
                </span>
            </div>

            {flags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {flags.map((f) => (
                        <span key={f.key} className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full", FLAG_LOOK[f.key])}>
                            <span className="font-mono tabular-nums">{f.count}</span>
                            {t(f.i18nKey)}
                        </span>
                    ))}
                </div>
            )}

            {danger && (
                <div className={cn(
                    "flex items-start gap-2 rounded-xl px-3 py-2 text-[11px] font-medium border",
                    data.risk_level === "blocked"
                        ? "bg-zinc-900 text-white border-zinc-800"
                        : "bg-rose-50 text-rose-800 border-rose-200",
                )}>
                    {data.risk_level === "blocked" ? <Ban className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span>{t(codRiskKey(data.risk_level))}</span>
                </div>
            )}
        </div>
    );
}
