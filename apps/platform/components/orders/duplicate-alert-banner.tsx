"use client";

import { AlertTriangle, Copy, Ban } from "lucide-react";
import type { Order } from "@/types/order";
import type { DuplicateWindowAlert } from "@/lib/duplicate-window";
import { cn, formatIQD } from "@/lib/utils";
import { formatPhoneForDisplay } from "@/lib/order-utils";
import { useStatusLabel } from "@/hooks/use-status-label";
import { useLanguage } from "@/components/providers/language-provider";

/**
 * The loud half of 48h duplicate detection. The card already tinted the phone
 * number when a duplicate existed, but that read identically to "returning
 * customer" and never said *what* the duplicate was. This states the gap, the
 * twin, and — the part that costs money — the twin's status.
 */

type Translate = ReturnType<typeof useLanguage>["t"];

export function gapLabel(alert: DuplicateWindowAlert, t: Translate): string {
    if (alert.sameDay) {
        if (alert.gapMinutes < 60) {
            return t("orders.duplicate.sameDayMinutes", "Same day · {minutes} min apart",
                { minutes: alert.gapMinutes });
        }
        return t("orders.duplicate.sameDayHours", "Same day · {hours}h apart",
            { hours: Math.round(alert.gapMinutes / 60) });
    }
    const hours = Math.round(alert.gapMinutes / 60);
    if (hours < 24) return t("orders.duplicate.hoursApart", "{hours}h apart", { hours });
    return t("orders.duplicate.daysHoursApart", "{days}d {hours}h apart",
        { days: Math.floor(hours / 24), hours: hours % 24 });
}

interface DuplicateAlertBannerProps {
    alert: DuplicateWindowAlert;
    order: Order;
    onCompare?: (order: Order) => void;
    onCancel?: (order: Order) => void;
    /** Ultra-compact card variants get a single chip instead of the full banner. */
    compact?: boolean;
}

export function DuplicateAlertBanner({
    alert,
    order,
    onCompare,
    onCancel,
    compact = false,
}: DuplicateAlertBannerProps) {
    const { t } = useLanguage();
    const statusLabel = useStatusLabel();
    const critical = alert.severity === "critical";
    const twin = alert.primary;
    const extraTwins = alert.twins.length - 1;

    if (compact) {
        return (
            <span
                className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                    critical
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
                )}
                title={`${gapLabel(alert, t)} · #${twin.order_id}`}
            >
                <Copy className="h-3 w-3" />
                {t("orders.duplicate.chip", "Duplicate")}
            </span>
        );
    }

    return (
        <div
            data-duplicate-severity={alert.severity}
            className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[16px] border px-3.5 py-2 mb-1.5 text-[12px]",
                critical
                    ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
                    : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
            )}
        >
            <AlertTriangle
                className={cn(
                    "h-4 w-4 flex-shrink-0",
                    critical ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400",
                )}
            />

            <span className="font-extrabold">
                {critical
                    ? t("orders.duplicate.titleCritical", "Duplicate order, confirmed twice")
                    : t("orders.duplicate.titleWarning", "Duplicate order within 48 hours")}
            </span>

            <span className="opacity-80">{gapLabel(alert, t)}</span>

            <span className="flex items-center gap-1.5">
                <span className="opacity-70">{t("orders.duplicate.twin", "Twin")}</span>
                <span
                    className={cn(
                        "rounded px-1.5 py-0.5 font-mono font-bold",
                        critical
                            ? "bg-rose-100 dark:bg-rose-500/20"
                            : "bg-amber-100 dark:bg-amber-500/20",
                    )}
                    dir="ltr"
                >
                    #{twin.order_id}
                </span>
                <span
                    className={cn(
                        "rounded px-1.5 py-0.5 font-semibold",
                        critical
                            ? "bg-rose-600 text-white dark:bg-rose-500"
                            : "bg-amber-500 text-white",
                    )}
                >
                    {statusLabel(twin.status, twin.is_return)}
                </span>
                <span className="font-semibold" dir="ltr">{formatIQD(twin.price)}</span>
            </span>

            {!alert.matchedOnPrimary && (
                // The two orders do not share a primary number, so without this the
                // agent sees two different phones and assumes a false positive.
                <span className="flex items-center gap-1 opacity-80">
                    <span className="opacity-70">{t("orders.duplicate.viaNumber", "via")}</span>
                    <span className="font-mono font-semibold" dir="ltr">
                        {formatPhoneForDisplay(alert.sharedNumber)}
                    </span>
                </span>
            )}

            {extraTwins > 0 && (
                <span className="opacity-70">{t("orders.duplicate.moreTwins", "+{count} more", { count: extraTwins })}</span>
            )}

            <div className="ms-auto flex items-center gap-1.5">
                {onCompare && (
                    <button
                        type="button"
                        onClick={e => {
                            e.stopPropagation();
                            onCompare(order);
                        }}
                        className={cn(
                            "rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors",
                            critical
                                ? "bg-rose-600 text-white hover:bg-rose-700"
                                : "bg-amber-500 text-white hover:bg-amber-600",
                        )}
                    >
                        {t("orders.duplicate.compare", "Compare")}
                    </button>
                )}
                {onCancel && (
                    <button
                        type="button"
                        onClick={e => {
                            e.stopPropagation();
                            onCancel(order);
                        }}
                        className={cn(
                            "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors",
                            critical
                                ? "border-rose-300 text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/20"
                                : "border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/20",
                        )}
                    >
                        <Ban className="h-3 w-3" />
                        {t("orders.duplicate.cancel", "Cancel")}
                    </button>
                )}
            </div>
        </div>
    );
}
