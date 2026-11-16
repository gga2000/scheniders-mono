"use client";

import { useEffect } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useLockTimeOrders } from "@/hooks/use-lock-time-orders";
import { useOrderStore } from "@/store/use-order-store";
import { LOCK_ORDERS_DAYS } from "@/lib/billing/lock-orders";
import type { OrderFilters } from "@/types/order";

interface LockTimeChipProps {
    filters: OrderFilters;
    setFilters: (filters: OrderFilters) => void;
}

/**
 * «طلبات وصلت وقت القفل» (handoff A1): orders of the last 30 days that came in
 * while the shop was billing-locked. Turning it on opens All across every
 * date. Hidden when there are none.
 */
export function LockTimeChip({ filters, setFilters }: LockTimeChipProps) {
    const { t } = useLanguage();
    const ids = useLockTimeOrders();
    const on = useOrderStore((s) => s.filterLockTime);
    const setOn = useOrderStore((s) => s.setFilterLockTime);

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
            aria-label={t("orders.filter.lockTime")}
            title={t("orders.filter.lockTimeTip", { days: LOCK_ORDERS_DAYS })}
            className={cn(
                "rounded-full whitespace-nowrap transition-all flex items-center gap-2 border px-4 py-2 text-sm font-medium",
                on
                    ? "bg-amber-100 text-amber-900 border-amber-300 shadow-sm dark:bg-amber-400/15 dark:text-amber-200 dark:border-amber-400/35"
                    : "bg-background text-amber-900 border-amber-300/70 hover:bg-amber-50 active:scale-95 dark:text-amber-200 dark:border-amber-400/30 dark:hover:bg-white/5",
            )}
        >
            <Lock className="w-4 h-4" aria-hidden="true" />
            <span>{t("orders.filter.lockTime")}</span>
            <span
                data-badge="lock-time"
                className={cn(
                    "px-1.5 py-0.5 rounded-full text-[11px] font-bold",
                    on ? "bg-amber-200/70 text-amber-950" : "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200",
                )}
            >
                {ids.length}
            </span>
        </button>
    );
}
