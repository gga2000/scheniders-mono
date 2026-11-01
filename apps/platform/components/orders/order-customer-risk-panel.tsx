"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, Loader2, ShoppingBag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import {
    statusFlags, codRiskKey, type ValueTier, type RiskLevel,
} from "@/lib/customer-reliability";
import { ValuePill, RiskChip } from "@/components/customers/reliability-pill";

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
            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t("orders.cod.checking", "Checking customer history…")}
            </div>
        );
    }

    // No prior orders → genuinely a new customer; keep it quiet, not alarming.
    if (!data || data.total_orders === 0) {
        return (
            <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                <ShoppingBag className="w-3 h-3" />
                {t("orders.cod.newCustomer", "New customer · no order history yet")}
            </div>
        );
    }

    const success = data.total_orders > 0 ? Math.round((data.completed_count / data.total_orders) * 100) : 0;
    const flags = statusFlags(data);
    const danger = data.risk_level === "high" || data.risk_level === "blocked";

    return (
        <div className="mt-1 space-y-1.5" dir="ltr">
            <div className="flex items-center gap-2 flex-wrap rounded-xl border border-(--card-border) bg-(--background) px-3 py-2">
                <ValuePill tier={data.value_tier} variant="compact" />
                <RiskChip risk={data.risk_level} showClean />
                <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
                    {data.total_orders} {t("customers.orders").toLowerCase()} · {success}% {t("customers.card.delivered", "delivered")}
                </span>
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
