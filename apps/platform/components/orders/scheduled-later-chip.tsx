"use client";

import { useEffect } from "react";
import { CalendarClock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useScheduledLater } from "@/hooks/use-scheduled-later";
import { useOrderStore } from "@/store/use-order-store";
import { baghdadDayKey } from "@/lib/order-window";
import type { OrderFilters } from "@/types/order";

interface ScheduledLaterChipProps {
    filters: OrderFilters;
    setFilters: (filters: OrderFilters) => void;
}

/**
 * «مجدولة ليوم آخر»: confirmed orders parked for a day after today. Turning it
 * on opens the Confirmed tab over the days they are scheduled for, since the
 * default window is today and none of them fall in it. Ends when the status
 * tab changes. Hidden while there are none (and it is off).
 */
export function ScheduledLaterChip({ filters, setFilters }: ScheduledLaterChipProps) {
    const { t } = useLanguage();
    const later = useScheduledLater();
    const on = useOrderStore((s) => s.filterScheduledLater);
    const setOn = useOrderStore((s) => s.setFilterScheduledLater);

    // Another status tab ends the filter; it would empty the list.
    useEffect(() => {
        if (on && filters.status !== "confirmed") setOn(false);
    }, [on, filters.status, setOn]);

    const count = later?.ids.length ?? 0;
    // Always shown so the merchant sees it exists; at 0 it is muted and does nothing.
    const empty = count === 0 && !on;

    const turnOff = () => {
        const today = baghdadDayKey();
        setOn(false);
        setFilters({ ...filters, dateFrom: today, dateTo: today });
        useOrderStore.getState().setDatePreset("today");
    };

    const turnOn = () => {
        if (!later) return;
        setFilters({ ...filters, status: "confirmed", dateFrom: later.fromDay, dateTo: later.toDay });
        useOrderStore.getState().setDatePreset(null);
        setOn(true);
    };

    return (
        <div className="flex items-center gap-1.5 shrink-0">
            <button
                type="button"
                data-chip="scheduled-later"
                data-chip-count={count}
                onClick={on ? turnOff : turnOn}
                disabled={empty}
                aria-pressed={on}
                title={t("orders.filter.scheduledLaterTip")}
                className={cn(
                    "rounded-full whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 border px-3 py-1.5 text-xs font-medium",
                    empty
                        ? "bg-background text-muted-foreground/70 border-border/50 cursor-default"
                        : on
                        ? "bg-violet-600 text-white border-violet-600 shadow-sm dark:bg-violet-400 dark:text-black dark:border-violet-400"
                        : "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 active:scale-95 dark:bg-violet-400/15 dark:text-violet-200 dark:border-violet-400/30 dark:hover:bg-violet-400/25",
                )}
            >
                <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t("orders.filter.scheduledLater")}</span>
                <span
                    data-badge="scheduled-later"
                    className={cn(
                        "px-1.5 py-0.5 rounded-full text-[11px] font-black min-w-[18px] text-center",
                        on ? "bg-white/25 text-current" : empty ? "bg-muted-foreground/15 text-muted-foreground" : "bg-violet-200/60 text-violet-800 dark:bg-violet-400/20 dark:text-violet-100",
                    )}
                >
                    {count}
                </span>
            </button>
            {on && (
                <button
                    type="button"
                    onClick={turnOff}
                    title={t("orders.filter.scheduledLaterClear")}
                    aria-label={t("orders.filter.scheduledLaterClear")}
                    className="rounded-full shrink-0 border border-border/50 p-1.5 text-muted-foreground hover:text-rose-600 hover:border-rose-300 transition-all"
                >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}
