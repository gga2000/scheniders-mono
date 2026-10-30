"use client";

import { MapPin, MessageCircle, Phone, ChevronRight, Star, Check } from "lucide-react";
import { governorateLabel } from "@scheniders/shared";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import {
    recencyStatus,
    firstDeliveryPending,
    effectiveSuccessRate,
    VALUE_META,
} from "@/lib/customer-reliability";
import { ValuePill, RiskChip } from "@/components/customers/reliability-pill";
import { CustomerStatusFlags } from "@/components/customers/customer-status-flags";
import { formatPhoneDisplay, monogram, toIraqE164 } from "@/lib/customer-format";

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
    selectedPhones,
    onToggleSelect,
}: {
    customers: PaginatedCustomer[];
    onRowClick: (phone: string) => void;
    selectedPhones?: Set<string>;
    onToggleSelect?: (phone: string) => void;
}) {
    const { t, language } = useLanguage();
    const allSelected = customers.length > 0 && customers.every((c) => selectedPhones?.has(c.phone));
    // Once something is selected, tapping a row adds or removes it, like the grid.
    const selecting = !!onToggleSelect && (selectedPhones?.size ?? 0) > 0;

    return (
        <div className="bg-(--card-bg) rounded-3xl border border-(--card-border) overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-background border-b border-(--card-border)">
                            {onToggleSelect && (
                                <th className="px-4 py-3.5 w-10">
                                    <button
                                        onClick={() => customers.forEach((c) => {
                                            const on = selectedPhones?.has(c.phone);
                                            if (allSelected ? on : !on) onToggleSelect(c.phone);
                                        })}
                                        className={cn("w-5 h-5 rounded-md border flex items-center justify-center transition-colors mx-auto",
                                            allSelected ? "bg-foreground border-foreground text-background" : "bg-(--card-bg) border-(--card-border) text-transparent hover:border-foreground/40")}
                                        aria-label={t("customers.bulk.selectAll", "Select all")}
                                    >
                                        <Check className="w-3.5 h-3.5" />
                                    </button>
                                </th>
                            )}
                            <Th>{t("customers.table.customer", "Customer")}</Th>
                            <Th>{t("customers.table.governorate")}</Th>
                            <Th>{t("customers.value.label", "Value")}</Th>
                            <Th>{t("customers.risk.label", "COD risk")}</Th>
                            <Th right>{t("customers.orders")}</Th>
                            <Th right>{t("customers.totalSpent")}</Th>
                            <Th right>{t("customers.table.success")}</Th>
                            <Th>{t("customers.lastOrder")}</Th>
                            <Th right>{" "}</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {customers.map((c) => {
                            const meta = VALUE_META[c.value_tier];
                            const pending = firstDeliveryPending(c);
                            const recency = recencyStatus(c.last_order_date, c.risk_level, t);
                            const success = effectiveSuccessRate(c);
                            const e164 = toIraqE164(c.phone);
                            const gov = c.governorate ? governorateLabel(c.governorate, language) || c.governorate : null;
                            return (
                                <tr
                                    key={c.phone}
                                    onClick={() => (selecting ? onToggleSelect?.(c.phone) : onRowClick(c.phone))}
                                    className={cn("border-b border-(--card-border) last:border-0 hover:bg-background cursor-pointer transition-colors", selectedPhones?.has(c.phone) && "bg-foreground/3")}
                                >
                                    {onToggleSelect && (
                                        <td className="px-4 py-3 w-10 cursor-default" onClick={(e) => { e.stopPropagation(); onToggleSelect(c.phone); }}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onToggleSelect(c.phone); }}
                                                className={cn("w-5 h-5 rounded-md border flex items-center justify-center transition-colors mx-auto",
                                                    selectedPhones?.has(c.phone) ? "bg-foreground border-foreground text-background" : "bg-(--card-bg) border-(--card-border) text-transparent hover:border-foreground/40")}
                                                aria-label={t("customers.bulk.select", "Select")}
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    )}
                                    {/* Customer (+ value rail) */}
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
                                            {gov || "—"}
                                        </span>
                                    </td>
                                    {/* Value */}
                                    <td className="px-4 py-3">
                                        <ValuePill tier={c.value_tier} variant="compact" />
                                    </td>
                                    {/* Risk */}
                                    <td className="px-4 py-3">
                                        <RiskChip risk={c.risk_level} showClean />
                                    </td>
                                    {/* Orders */}
                                    <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-foreground">
                                        <span className="inline-flex items-center justify-end gap-1">
                                            {c.completed_count > 3 && <Star className="w-3 h-3 text-violet-500 fill-violet-500" aria-label={t("customers.loyal")} />}
                                            {c.total_orders.toLocaleString("en-US")}
                                        </span>
                                    </td>
                                    {/* Lifetime value */}
                                    <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-foreground">{formatIQD(c.total_spent)}</td>
                                    {/* Success */}
                                    <td className={cn("px-4 py-3 text-right font-mono text-sm tabular-nums font-semibold", pending ? "text-muted-foreground" : successTone(success))}>
                                        {pending ? "—" : `${success}%`}
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
                                                className="w-10 h-10 rounded-lg bg-lime-50 text-lime-700 flex items-center justify-center hover:bg-lime-100 transition-colors"
                                                aria-label={t("customers.actions.whatsapp")}
                                            >
                                                <MessageCircle className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); window.location.href = `tel:+${e164}`; }}
                                                className="w-10 h-10 rounded-lg border border-(--card-border) text-muted-foreground flex items-center justify-center hover:bg-muted/40 transition-colors"
                                                aria-label={t("customers.actions.call")}
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
