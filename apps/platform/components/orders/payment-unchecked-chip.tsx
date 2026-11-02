"use client";

import { useEffect } from "react";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { usePaymentUnchecked } from "@/hooks/use-payment-unchecked";
import { useOrderStore } from "@/store/use-order-store";
import { PAYMENT_CHECK_DAYS } from "@/lib/orders/payment-check";
import type { OrderFilters } from "@/types/order";

interface PaymentUncheckedChipProps {
    filters: OrderFilters;
    setFilters: (filters: OrderFilters) => void;
    isMobile?: boolean;
}

/**
 * "N payment not checked": delivered or completed orders of the last 30 days
 * that nobody has ticked. Turning it on opens All across every date, because
 * the queue spans delivered and completed and the default window is today.
 */
export function PaymentUncheckedChip({ filters, setFilters, isMobile = false }: PaymentUncheckedChipProps) {
    const { t } = useLanguage();
    const uncheckedIds = usePaymentUnchecked();
    const on = useOrderStore((s) => s.filterPaymentUnchecked);
    const setOn = useOrderStore((s) => s.setFilterPaymentUnchecked);

    // Picking a status tab ends the filter; the queue is its own view.
    useEffect(() => {
        if (on && (filters.status ?? "all") !== "all") setOn(false);
    }, [on, filters.status, setOn]);

    if (uncheckedIds.length === 0 && !on) return null;

    const toggle = () => {
        if (on) {
            setOn(false);
            return;
        }
        setFilters({ ...filters, status: "all", dateFrom: undefined, dateTo: undefined });
        setOn(true);
    };

    return (
        <button
            type="button"
            onClick={toggle}
            aria-pressed={on}
            aria-label={t("orders.filter.paymentUnchecked")}
            title={t("orders.filter.paymentUncheckedTip", { days: PAYMENT_CHECK_DAYS })}
            className={cn(
                "rounded-full whitespace-nowrap transition-all flex items-center gap-2 border",
                isMobile ? "px-4 py-2.5 text-sm" : "px-4 py-2 text-sm font-medium",
                on
                    ? "bg-cyan-100 text-cyan-900 border-cyan-300 shadow-sm dark:bg-cyan-400/15 dark:text-cyan-200 dark:border-cyan-400/35"
                    : "bg-background text-cyan-900 border-cyan-300/70 hover:bg-cyan-50 active:scale-95 dark:text-cyan-200 dark:border-cyan-400/30 dark:hover:bg-white/5",
            )}
        >
            <Wallet className="w-4 h-4" aria-hidden="true" />
            <span>{!isMobile && t("orders.filter.paymentUnchecked")}</span>
            <span
                data-badge="payment-unchecked"
                className={cn(
                    "px-1.5 py-0.5 rounded-full text-[11px] font-bold",
                    on ? "bg-cyan-200/70 text-cyan-950" : "bg-cyan-100 text-cyan-900 dark:bg-cyan-400/15 dark:text-cyan-200",
                )}
            >
                {uncheckedIds.length}
            </span>
        </button>
    );
}
