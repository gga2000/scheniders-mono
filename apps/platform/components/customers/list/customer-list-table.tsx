"use client";

import { useEffect } from "react";
import { MessageCircle, Phone, Check, User } from "lucide-react";
import { governorateLabel } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import {
    recencyStatus,
    firstDeliveryPending,
    FIRST_DELIVERY_DOT,
    effectiveSuccessRate,
    statusFlags,
    customerAccent,
} from "@/lib/customer-reliability";
import { ValuePill, RiskChip, WHATSAPP_TONE } from "@/components/customers/reliability-pill";
import { formatPhoneDisplay, monogram, spentLabel, toIraqE164 } from "@/lib/customer-format";
import { useBorderBoxHeight } from "@/hooks/use-border-box-height";

function successTone(rate: number): string {
    if (rate >= 80) return "text-lime-700 dark:text-lime-300";
    if (rate >= 50) return "text-amber-600 dark:text-amber-300";
    return "text-rose-600 dark:text-rose-300";
}

/** Header cells stick right under the sticky toolbar (`top`, its measured height), so column names stay while scrolling. */
function Th({ children, right, top }: { children?: React.ReactNode; right?: boolean; top: number }) {
    return (
        <th style={{ top }} className={cn(
            "sticky z-10 bg-background px-3 h-11 text-xs font-semibold text-muted-foreground whitespace-nowrap border-b border-(--card-border)",
            right ? "text-right" : "text-left",
        )}>
            {children}
        </th>
    );
}

/**
 * Dense, scannable list view: one 56px row per customer, sized to fit a
 * 1280px desktop without sideways scrolling.
 */
export function CustomerListTable({
    customers,
    onRowClick,
    selectedPhones,
    onToggleSelect,
    stickyTop,
}: {
    customers: PaginatedCustomer[];
    onRowClick: (phone: string) => void;
    selectedPhones?: Set<string>;
    onToggleSelect?: (phone: string) => void;
    /** The sticky toolbar's measured height: the header sticks right under it. */
    stickyTop: number;
}) {
    const { t, language } = useLanguage();
    // The toolbar and the header are one sticky block. A row brought into view (a focused
    // checkbox, scrollIntoView) stops under the whole block, never half behind the header.
    const { height: headHeight, ref: headRef } = useBorderBoxHeight<HTMLTableSectionElement>();
    const stackHeight = stickyTop + headHeight;
    useEffect(() => {
        const root = document.documentElement;
        root.style.scrollPaddingTop = `${stackHeight}px`;
        return () => { root.style.scrollPaddingTop = ""; };
    }, [stackHeight]);
    const allSelected = customers.length > 0 && customers.every((c) => selectedPhones?.has(c.phone));
    // Once something is selected, tapping a row adds or removes it, like the grid.
    const selecting = !!onToggleSelect && (selectedPhones?.size ?? 0) > 0;

    return (
        // overflow-clip rounds the header's corners at rest without making a scroll container,
        // so the header still sticks to the page. Once stuck it is square, with no corner gaps
        // for the rows under it to show through.
        <div className="bg-(--card-bg) rounded-2xl border border-(--card-border) overflow-clip shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
            <table className="w-full table-fixed border-separate border-spacing-0">
                <colgroup>
                    {onToggleSelect && <col className="w-11" />}
                    <col />
                    <col className="w-28" />
                    <col className="w-28" />
                    <col className="w-40" />
                    <col className="w-28" />
                    <col className="w-32" />
                    <col className="w-40" />
                    <col className="w-24" />
                </colgroup>
                <thead ref={headRef}>
                    <tr>
                        {onToggleSelect && (
                            <Th top={stickyTop}>
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
                            </Th>
                        )}
                        <Th top={stickyTop}>{t("customers.table.customer", "Customer")}</Th>
                        <Th top={stickyTop}>{t("customers.table.governorate")}</Th>
                        <Th top={stickyTop}>{t("customers.value.label", "Value")}</Th>
                        <Th top={stickyTop}>{t("customers.risk.label", "COD risk")}</Th>
                        <Th top={stickyTop} right>{t("customers.table.ordersRate", "Orders · rate")}</Th>
                        {/* What the figure leaves out (delivery, undelivered orders) is on hover, so the header stays short. */}
                        <Th top={stickyTop} right><span title={t("customers.spentOnItemsHint")}>{t("customers.spentOnItems")}</span></Th>
                        <Th top={stickyTop}>{t("customers.lastOrder")}</Th>
                        <Th top={stickyTop}><span className="sr-only">{t("customers.actions.whatsapp")}</span></Th>
                    </tr>
                </thead>
                <tbody>
                    {customers.map((c, i) => {
                        const accent = customerAccent(c.value_tier, c.risk_level);
                        const unsafe = c.risk_level === "blocked" || c.risk_level === "high";
                        const pending = firstDeliveryPending(c);
                        const recency = recencyStatus(c.last_order_date, t, language);
                        const success = effectiveSuccessRate(c);
                        const e164 = toIraqE164(c.phone);
                        const gov = c.governorate ? governorateLabel(c.governorate, language) || c.governorate : null;
                        const flags = statusFlags(c).map((f) => `${f.count} ${t(f.i18nKey)}`);
                        const isSelected = selectedPhones?.has(c.phone);
                        const last = i === customers.length - 1;
                        const td = cn("px-3 py-2 border-(--card-border)", !last && "border-b");
                        return (
                            <tr
                                key={c.phone}
                                onClick={() => (selecting ? onToggleSelect?.(c.phone) : onRowClick(c.phone))}
                                className={cn(
                                    "group cursor-pointer transition-colors hover:bg-background",
                                    isSelected ? "bg-foreground/4" : unsafe && "bg-rose-50/50 dark:bg-rose-500/5",
                                )}
                            >
                                {onToggleSelect && (
                                    <td className={cn(td, "cursor-default")} onClick={(e) => { e.stopPropagation(); onToggleSelect(c.phone); }}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onToggleSelect(c.phone); }}
                                            className={cn("w-5 h-5 rounded-md border flex items-center justify-center transition-colors mx-auto",
                                                isSelected ? "bg-foreground border-foreground text-background" : "bg-(--card-bg) border-(--card-border) text-transparent hover:border-foreground/40")}
                                            aria-label={t("customers.bulk.select", "Select")}
                                            aria-pressed={!!isSelected}
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                )}
                                {/* Customer */}
                                <td className={td}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center font-bold text-[13px] shrink-0", accent.surfaceBg, accent.surfaceText)}>
                                            {c.has_name ? monogram(c.name) : <User className="w-4 h-4" />}
                                        </span>
                                        <div className="min-w-0">
                                            <div dir="auto" className="font-semibold text-sm text-foreground truncate text-left">{c.name}</div>
                                            {/* A customer with no name is already shown by number. */}
                                            {c.has_name && <div className="font-mono text-xs text-muted-foreground tabular-nums whitespace-nowrap">{formatPhoneDisplay(c.phone)}</div>}
                                        </div>
                                    </div>
                                </td>
                                {/* Governorate */}
                                <td className={cn(td, "text-[13px] text-muted-foreground")}>
                                    <span dir="auto" className="block truncate text-left">{gov || "—"}</span>
                                </td>
                                {/* Value: an unsafe customer leads with the risk, so no value pill */}
                                <td className={td}>
                                    {unsafe ? <span className="text-muted-foreground">—</span> : <ValuePill tier={c.value_tier} variant="compact" />}
                                </td>
                                {/* Risk, with the order outcomes behind it */}
                                <td className={td}>
                                    <RiskChip risk={c.risk_level} showClean />
                                    {/* Wraps onto a second line rather than clipping a flag. Each flag after the
                                        first carries its "·" in a 0.75rem lead; the row is pulled back by that lead
                                        and clipped, so a flag that starts a line never shows a dangling separator.
                                        dir="auto": Arabic flags read count-first and run right to left; the clip box
                                        hugs the list (w-fit), so it stays under the risk chip on the left. */}
                                    {flags.length > 0 && (
                                        <div className="mt-0.5 w-fit max-w-full overflow-hidden">
                                            <ul dir="auto" className="-ms-3 flex flex-wrap text-xs text-muted-foreground leading-snug">
                                                {flags.map((f) => (
                                                    <li key={f} className="whitespace-nowrap before:content-['·'] before:inline-block before:w-3 before:text-center">{f}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </td>
                                {/* Orders · delivery rate */}
                                <td className={cn(td, "text-right text-sm tabular-nums whitespace-nowrap")}>
                                    <span className="font-mono text-foreground">{c.total_orders.toLocaleString("en-US")}</span>
                                    <span className="text-muted-foreground"> · </span>
                                    <span className={cn("font-mono font-semibold", pending ? "text-muted-foreground" : successTone(success))}>
                                        {pending ? "—" : `${success}%`}
                                    </span>
                                </td>
                                {/* Lifetime value */}
                                <td className={cn(td, "text-right font-mono text-sm tabular-nums text-foreground whitespace-nowrap")}>
                                    {spentLabel(c.total_spent, pending)}
                                </td>
                                {/* Last order: one line, the full recency in the tooltip */}
                                <td className={td}>
                                    {/* The dot is recency only (active, cooling, dormant); risk has its own column. */}
                                    <span className="flex items-center gap-2 text-[13px] text-muted-foreground min-w-0" title={pending ? t("customers.card.firstDeliveryPending") : recency.label}>
                                        <span className={cn("w-2 h-2 rounded-full shrink-0", pending ? FIRST_DELIVERY_DOT : recency.dot)} aria-hidden />
                                        <span dir="auto" className="truncate">
                                            {pending ? t("customers.card.firstDelivery") : <><span className="sr-only">{recency.stateLabel}: </span>{recency.ago}</>}
                                        </span>
                                    </span>
                                </td>
                                {/* Actions */}
                                <td className={td}>
                                    <div className="flex items-center gap-1.5 justify-end">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${e164}`, "_blank"); }}
                                            className={cn("w-9 h-9 rounded-lg flex items-center justify-center transition-colors", WHATSAPP_TONE)}
                                            aria-label={t("customers.actions.whatsapp")}
                                        >
                                            <MessageCircle className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); window.location.href = `tel:+${e164}`; }}
                                            className="w-9 h-9 rounded-lg border border-(--card-border) text-muted-foreground flex items-center justify-center hover:bg-muted/40 transition-colors"
                                            aria-label={t("customers.actions.call")}
                                        >
                                            <Phone className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
