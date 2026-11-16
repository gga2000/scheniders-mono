"use client";

import { useEffect } from "react";
import { MessageCircleWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useWhatsAppUnsentOrders } from "@/hooks/use-whatsapp-unsent-orders";
import { useOrderStore } from "@/store/use-order-store";
import { WHATSAPP_UNSENT_DAYS } from "@/lib/orders/whatsapp-unsent";
import type { OrderFilters } from "@/types/order";

interface WhatsAppUnsentChipProps {
    filters: OrderFilters;
    setFilters: (filters: OrderFilters) => void;
}

/**
 * «واتساب ما انرسل» (Fermi B2): orders of the last 30 days still waiting for
 * the customer whose automatic WhatsApp did not go out, so each can be
 * confirmed by hand. Turning it on opens All across every date. Hidden when
 * there are none.
 */
export function WhatsAppUnsentChip({ filters, setFilters }: WhatsAppUnsentChipProps) {
    const { t } = useLanguage();
    const ids = useWhatsAppUnsentOrders();
    const on = useOrderStore((s) => s.filterWhatsAppUnsent);
    const setOn = useOrderStore((s) => s.setFilterWhatsAppUnsent);

    // Picking a status tab ends the filter; the list is its own view.
    useEffect(() => {
        if (on && (filters.status ?? "all") !== "all") setOn(false);
    }, [on, filters.status, setOn]);

    if (ids.length === 0 && !on) return null;

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
            aria-label={t("orders.filter.whatsappUnsent")}
            title={t("orders.filter.whatsappUnsentTip", { days: WHATSAPP_UNSENT_DAYS })}
            className={cn(
                "rounded-full whitespace-nowrap transition-all flex items-center gap-2 border px-4 py-2 text-sm font-medium",
                on
                    ? "bg-red-100 text-red-900 border-red-300 shadow-sm dark:bg-red-400/15 dark:text-red-200 dark:border-red-400/35"
                    : "bg-background text-red-900 border-red-300/70 hover:bg-red-50 active:scale-95 dark:text-red-200 dark:border-red-400/30 dark:hover:bg-white/5",
            )}
        >
            <MessageCircleWarning className="w-4 h-4" aria-hidden="true" />
            <span>{t("orders.filter.whatsappUnsent")}</span>
            <span
                data-badge="whatsapp-unsent"
                className={cn(
                    "px-1.5 py-0.5 rounded-full text-[11px] font-bold",
                    on ? "bg-red-200/70 text-red-950" : "bg-red-100 text-red-900 dark:bg-red-400/15 dark:text-red-200",
                )}
            >
                {ids.length}
            </span>
        </button>
    );
}
