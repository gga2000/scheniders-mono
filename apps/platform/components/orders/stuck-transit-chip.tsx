"use client";

import { useEffect } from "react";
import { TruckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useStuckInTransit } from "@/hooks/use-stuck-in-transit";
import { useOrderStore } from "@/store/use-order-store";
import { STUCK_TRANSIT_DAYS } from "@/lib/orders/stuck-in-transit";
import type { OrderFilters } from "@/types/order";

interface StuckTransitChipProps {
    filters: OrderFilters;
    setFilters: (filters: OrderFilters) => void;
    isMobile?: boolean;
}

/**
 * "N stuck in transit": orders that left with the courier 7+ days ago and were
 * never marked delivered or rejected. Shown only while there are some (or while
 * on). Turning it on opens the In transit tab across every date, because the
 * default window is today and every stuck order is older than that.
 */
export function StuckTransitChip({ filters, setFilters, isMobile = false }: StuckTransitChipProps) {
    const { t } = useLanguage();
    const { stuckIds } = useStuckInTransit();
    const on = useOrderStore((s) => s.filterStuckTransit);
    const setOn = useOrderStore((s) => s.setFilterStuckTransit);

    // Leaving the In transit tab ends the filter; it would empty every other tab.
    useEffect(() => {
        if (on && filters.status !== "in_transit") setOn(false);
    }, [on, filters.status, setOn]);

    if (stuckIds.length === 0 && !on) return null;

    const toggle = () => {
        if (on) {
            setOn(false);
            return;
        }
        setFilters({ ...filters, status: "in_transit", dateFrom: undefined, dateTo: undefined });
        setOn(true);
    };

    return (
        <button
            type="button"
            onClick={toggle}
            aria-pressed={on}
            aria-label={t("orders.filter.stuckTransit")}
            title={t("orders.filter.stuckTransitTip", { days: STUCK_TRANSIT_DAYS })}
            className={cn(
                "rounded-full whitespace-nowrap transition-all flex items-center gap-2 border",
                isMobile ? "px-4 py-2.5 text-sm" : "px-4 py-2 text-sm font-medium",
                on
                    ? "bg-amber-100 text-amber-800 border-amber-300 shadow-sm dark:bg-amber-400/15 dark:text-amber-200 dark:border-amber-400/35"
                    : "bg-background text-amber-800 border-amber-300/70 hover:bg-amber-50 active:scale-95 dark:text-amber-200 dark:border-amber-400/30 dark:hover:bg-white/5",
            )}
        >
            <TruckIcon className="w-4 h-4" />
            <span>{!isMobile && t("orders.filter.stuckTransit")}</span>
            <span
                data-badge="stuck-transit"
                className={cn(
                    "px-1.5 py-0.5 rounded-full text-[11px] font-bold",
                    on ? "bg-amber-200/70 text-amber-900" : "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
                )}
            >
                {stuckIds.length}
            </span>
        </button>
    );
}
