"use client";

import { MapPin, MessageCircle, Phone, ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import {
    reliabilityForCustomer,
    hasRatedScore,
    displayScore,
    recencyStatus,
    firstDeliveryPending,
    RELIABILITY_META,
} from "@/lib/customer-reliability";
import { ReliabilityPill } from "@/components/customers/reliability-pill";
import { CustomerStatusFlags } from "@/components/customers/customer-status-flags";
import { formatCompactIQD, formatPhoneDisplay, monogram, toIraqE164 } from "@/lib/customer-format";

function successTone(rate: number): string {
    if (rate >= 80) return "text-lime-700";
    if (rate >= 50) return "text-amber-600";
    return "text-rose-600";
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
    return (
        <th className={cn("px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap", right ? "text-right" : "text-left")}>
            {children}
        </th>
    );
}

/** Dense, scannable list view — the toggle counterpart to the card grid. */
export function CustomerListTable({
    customers,
    onRowClick,
}: {
    customers: PaginatedCustomer[];
    onRowClick: (phone: string) => void;
}) {
    const { t } = useLanguage();

    return (
        <div className="bg-(--card-bg) rounded-3xl border border-(--card-border) overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-background border-b border-(--card-border)">
                            <Th>{t("customers.table.customer", "Customer")}</Th>
                            <Th>{t("customers.table.governorate")}</Th>
                            <Th>{t("customers.reliability.label")}</Th>
                            <Th right>{t("customers.orders")}</Th>
                            <Th right>{t("customers.totalSpent")}</Th>
                            <Th right>{t("customers.table.success")}</Th>
                            <Th>{t("customers.lastOrder")}</Th>
                            <Th right>{" "}</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {customers.map((c) => {
                            const reliability = reliabilityForCustomer(c);
                            const meta = RELIABILITY_META[reliability];
                            const pending = firstDeliveryPending(c);
                            const recency = recencyStatus(c.last_order_date, reliability);
                            const e164 = toIraqE164(c.phone);
                            return (
                                <tr
                                    key={c.phone}
                                    onClick={() => onRowClick(c.phone)}
                                    className="border-b border-(--card-border) last:border-0 hover:bg-background cursor-pointer transition-colors"
                                >
                                    {/* Customer (+ reliability rail) */}
                                    <td className="relative px-4 py-3">
                                        <span className={cn("absolute left-0 inset-y-0 w-1", meta.rail)} aria-hidden />
                                        <div className="flex items-center gap-3">
                                            <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center font-bold text-[13px] shrink-0", meta.pillBg, meta.pillText)}>
                                                {monogram(c.name)}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="font-semibold text-sm text-foreground truncate">{c.name}</div>
                                                <div className="font-mono text-xs text-muted-foreground tabular-nums">{formatPhoneDisplay(c.phone)}</div>
                                                <CustomerStatusFlags customer={c} max={3} className="mt-1" />
                                            </div>
                                        </div>
                                    </td>
                                    {/* Governorate */}
                                    <td className="px-4 py-3 text-[13px] text-muted-foreground whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1.5">
                                            <MapPin className="w-3.5 h-3.5 text-muted-foreground/70" />
                                            {c.governorate || "—"}
                                        </span>
                                    </td>
                                    {/* Reliability */}
                                    <td className="px-4 py-3">
                                        <ReliabilityPill reliability={reliability} score={displayScore(c.trust_score)} variant="compact" showScore={hasRatedScore(c.trust_tier)} />
                                    </td>
                                    {/* Orders */}
                                    <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-foreground">
                                        <span className="inline-flex items-center justify-end gap-1">
                                            {c.total_orders > 3 && <Star className="w-3 h-3 text-violet-500 fill-violet-500" aria-label={t("customers.loyal")} />}
                                            {c.total_orders.toLocaleString("en-US")}
                                        </span>
                                    </td>
                                    {/* Lifetime value */}
                                    <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-foreground">{formatCompactIQD(c.total_spent)}</td>
                                    {/* Success */}
                                    <td className={cn("px-4 py-3 text-right font-mono text-sm tabular-nums font-semibold", pending ? "text-muted-foreground" : successTone(c.delivery_success_rate))}>
                                        {pending ? "—" : `${Math.round(c.delivery_success_rate)}%`}
                                    </td>
                                    {/* Last order */}
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
                                            <span className={cn("w-2 h-2 rounded-full shrink-0", pending ? "bg-blue-400" : recency.dot)} />
                                            <span>{pending ? t("customers.card.firstDeliveryPending") : recency.label}</span>
                                        </span>
                                    </td>
                                    {/* Actions */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5 justify-end">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${e164}`, "_blank"); }}
                                                className="w-8 h-8 rounded-lg bg-lime-50 text-lime-700 flex items-center justify-center hover:bg-lime-100 transition-colors"
                                                aria-label="WhatsApp"
                                            >
                                                <MessageCircle className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); window.open(`tel:+${e164}`); }}
                                                className="w-8 h-8 rounded-lg border border-(--card-border) text-muted-foreground flex items-center justify-center hover:bg-muted/40 transition-colors"
                                                aria-label="Call"
                                            >
                                                <Phone className="w-4 h-4" />
                                            </button>
                                            <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
