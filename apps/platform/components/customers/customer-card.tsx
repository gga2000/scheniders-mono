"use client";

import { motion } from "framer-motion";
import { MapPin, MessageCircle, Phone, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import {
    reliabilityForCustomer,
    hasRatedScore,
    displayScore,
    recencyStatus,
    firstDeliveryPending,
    valuePill,
    RELIABILITY_META,
} from "@/lib/customer-reliability";
import { ReliabilityPill } from "@/components/customers/reliability-pill";
import { CustomerStatusFlags } from "@/components/customers/customer-status-flags";
import { formatCompactIQD, formatPhoneDisplay, monogram, toIraqE164 } from "@/lib/customer-format";

interface CustomerCardProps {
    customer: PaginatedCustomer;
    onClick?: () => void;
    isSelected?: boolean;
    onToggleSelect?: (() => void) | ((phone: string, isShiftKey?: boolean) => void);
    onViewDetails?: (id: string) => void;
    compact?: 0 | 1 | 2;
    isVirtualized?: boolean;
    hasDuplicates?: boolean;
    onShowDuplicates?: (phone: string) => void;
}

export function CustomerCard({ customer, onClick, isSelected }: CustomerCardProps) {
    const { t } = useLanguage();

    const reliability = reliabilityForCustomer(customer);
    const score = displayScore(customer.trust_score);
    const rated = hasRatedScore(customer.trust_tier);
    const meta = RELIABILITY_META[reliability];
    const vp = valuePill(customer.trust_tier);
    const pending = firstDeliveryPending(customer);
    const recency = recencyStatus(customer.last_order_date, reliability);
    const e164 = toIraqE164(customer.phone);

    return (
        <motion.div
            onClick={onClick}
            whileHover={{ y: -2 }}
            className={cn(
                "relative bg-(--card-bg) rounded-3xl border border-(--card-border) pl-6 pr-5 py-5 cursor-pointer overflow-hidden transition-shadow group",
                "shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.04)]",
                isSelected && "ring-2 ring-foreground",
            )}
        >
            {/* Reliability accent rail */}
            <span className={cn("absolute left-0 top-0 bottom-0 w-1.5", meta.rail)} aria-hidden />

            {/* Identity */}
            <div className="flex items-start gap-3">
                <span className={cn("w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-base shrink-0", meta.pillBg, meta.pillText)}>
                    {monogram(customer.name)}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-foreground truncate">{customer.name}</h3>
                        {vp?.label === "VIP" && <Star className="w-3.5 h-3.5 text-purple-500 fill-purple-500 shrink-0" />}
                        {customer.total_orders > 3 && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700">
                                <Star className="w-2.5 h-2.5" />{t("customers.loyal")}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[13px] text-muted-foreground">
                        <span className="font-mono tabular-nums">{formatPhoneDisplay(customer.phone)}</span>
                        {customer.governorate && (
                            <span className="inline-flex items-center gap-1 min-w-0">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">{customer.governorate}</span>
                            </span>
                        )}
                    </div>
                </div>
                {vp && (
                    <span className={cn("shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1", vp.pillBg, vp.pillText)}>
                        {vp.label === "VIP" && <Star className="w-3 h-3" />}
                        {vp.label}
                    </span>
                )}
            </div>

            {/* Hero reliability */}
            <div className="mt-4">
                <ReliabilityPill reliability={reliability} score={score} variant="hero" showScore={rated} />
            </div>

            {/* Metric line */}
            <div className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground flex-wrap">
                <span><span className="font-mono font-medium text-foreground tabular-nums">{customer.total_orders.toLocaleString("en-US")}</span> {t("customers.orders").toLowerCase()}</span>
                <span className="text-(--card-border)">·</span>
                <span className="font-mono font-medium text-foreground tabular-nums">{formatCompactIQD(customer.total_spent)} IQD</span>
                {!pending && (
                    <>
                        <span className="text-(--card-border)">·</span>
                        <span><span className="font-mono font-medium text-foreground tabular-nums">{Math.round(customer.delivery_success_rate)}%</span> {t("customers.card.delivered")}</span>
                    </>
                )}
            </div>

            {/* Order-outcome flags */}
            <CustomerStatusFlags customer={customer} className="mt-2.5" />

            {/* Recency + actions */}
            <div className="mt-3 pt-3 border-t border-(--card-border) flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground min-w-0">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", pending ? "bg-blue-400" : recency.dot)} />
                    <span className="truncate">{pending ? t("customers.card.firstDeliveryPending") : recency.label}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${e164}`, "_blank"); }}
                        className="w-9 h-9 rounded-xl bg-lime-50 text-lime-700 flex items-center justify-center hover:bg-lime-100 transition-colors"
                        aria-label="WhatsApp"
                    >
                        <MessageCircle className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); window.open(`tel:+${e164}`); }}
                        className="w-9 h-9 rounded-xl border border-(--card-border) text-muted-foreground flex items-center justify-center hover:bg-muted/40 transition-colors"
                        aria-label="Call"
                    >
                        <Phone className="w-4 h-4" />
                    </button>
                </span>
            </div>
        </motion.div>
    );
}
