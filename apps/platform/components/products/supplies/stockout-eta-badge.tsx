"use client";

import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { SupplyTone } from "@/lib/utils/supply-reorder";

interface StockoutEtaBadgeProps {
    /** Days until stock hits 0, null = no velocity. */
    daysUntilStockout: number | null;
    /** Supplier lead time in days (defaults to 7). */
    leadTimeDays?: number;
    size?: "sm" | "md";
    /** The supply's shared status: nothing shows once an order covers it. */
    status?: SupplyTone;
    className?: string;
}

/**
 * Renders an ETA chip when stockout is predicted to land inside (or close to)
 * the current supplier lead time. If the buffer is comfortable, renders nothing
 * — stay out of the way until the risk is real.
 */
export function StockoutEtaBadge({
    daysUntilStockout,
    leadTimeDays = 7,
    size = "sm",
    status,
    className,
}: StockoutEtaBadgeProps) {
    const { t } = useLanguage();
    if (daysUntilStockout === null) return null;
    if (status === "ok") return null;

    const isCritical = status ? status !== "low" : daysUntilStockout <= leadTimeDays;
    const isWarning = status ? true : daysUntilStockout <= leadTimeDays * 2;

    if (!isCritical && !isWarning) return null;

    const big = size === "md";
    const tone = isCritical
        ? "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30"
        : "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30";
    const Icon = isCritical ? AlertTriangle : Clock;

    // Amber only for sitting at the reorder point, with stock for a while yet:
    // say that, not a far-off day count that reads as a warning.
    const reorderOnly = status === "low" && daysUntilStockout > leadTimeDays * 2;
    const label =
        daysUntilStockout <= 0
            ? t("supplies.eta.outNow")
            : reorderOnly
            ? t("supplies.eta.belowReorder")
            : t("supplies.eta.runsOut", { days: t("supplies.sp.leadDays", { count: daysUntilStockout }) });

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full ring-1 font-medium",
                big ? "px-2 py-0.5 text-xs" : "px-1.5 py-0.5 text-[10px]",
                tone,
                className
            )}
            title={t("supplies.eta.title", { lead: t("supplies.sp.leadDays", { count: leadTimeDays }), days: t("supplies.sp.leadDays", { count: daysUntilStockout }) })}
        >
            <Icon className={big ? "w-3.5 h-3.5" : "w-3 h-3"} />
            {label}
        </span>
    );
}

/**
 * Helper for card/list callers: convert stock + velocity into an exact ETA.
 * Mirrors the reorder-dashboard math so both views agree.
 */
export function stockoutEtaFrom({
    stock,
    reserved = 0,
    timesSold30d,
}: {
    stock: number;
    reserved?: number;
    timesSold30d: number;
}): number | null {
    if (stock <= 0) return 0;
    if (timesSold30d <= 0) return null;
    const available = Math.max(0, stock - reserved);
    const rate = timesSold30d / 30;
    if (rate <= 0) return null;
    return Math.round(available / rate);
}
