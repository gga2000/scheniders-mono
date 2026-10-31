"use client";

import { AlertTriangle, CalendarDays, Check, Clock, Lock, Package } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { StockLane, StockState } from "@/lib/orders/stock-today";

/** One fill per part of the bar; the legend and the count chips reuse them. */
export const SWATCH = {
    reserved: "bg-slate-800 dark:bg-slate-200",
    waiting: "bg-[repeating-linear-gradient(135deg,#f0b04a_0_4px,transparent_4px_7px)]",
    free: "bg-emerald-500",
    over: "bg-red-500",
} as const;

/** The free part takes the lane's state colour, so "low" reads amber at a glance. */
const FREE: Record<StockState, string> = {
    oversold: SWATCH.over,
    short: "bg-amber-500",
    out: "bg-[var(--foreground-muted)]",
    low: "bg-amber-500",
    ok: SWATCH.free,
};

export const STATE_NUMBER: Record<StockState, string> = {
    oversold: "text-red-600 dark:text-red-400",
    short: "text-amber-600 dark:text-amber-400",
    out: "text-[var(--foreground-muted)]",
    low: "text-amber-600 dark:text-amber-400",
    ok: "text-emerald-600 dark:text-emerald-400",
};

/** Below this share of the bar a part only shows its number; below the second, nothing. */
const ICON_AT = 14;
const NUMBER_AT = 7;

interface StockUnitBarProps {
    lane: StockLane;
    state: StockState;
    label: string;
}

/**
 * One pile of stock as a bar the width of what is on the shelf: confirmed
 * (reserved) first, then the waiting orders, then what is free to sell. Each
 * part carries its own icon and colour, and the chips under it spell out the
 * counts so nothing depends on reading the bar's widths.
 */
export function StockUnitBar({ lane, state, label }: StockUnitBarProps) {
    const { t } = useLanguage();
    const over = lane.left < 0;
    const after = lane.left - lane.waiting;
    const waiting = Math.max(Math.min(lane.waiting, lane.left), 0);
    const free = Math.max(after, 0);
    const total = Math.max(lane.onHand, 1);
    const pct = (n: number) => (n / total) * 100;
    const inside = (n: number, icon: ReactNode) =>
        pct(n) >= ICON_AT ? <>{icon}{n}</> : pct(n) >= NUMBER_AT ? n : null;

    return (
        <div className="min-w-0 space-y-3 rounded-2xl bg-[var(--background)] p-3.5">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--foreground-muted)]">{label}</span>
                <span className={cn("font-mono text-2xl font-semibold leading-none tabular-nums", STATE_NUMBER[state])}>
                    {over ? `−${Math.abs(lane.left)}` : lane.left}
                    <small className="ms-1.5 font-sans text-[11px] font-medium text-[var(--foreground-muted)]">
                        {over ? t("orders.stockToday.over", "over") : t("orders.stockToday.freeToSell", "free to sell")}
                    </small>
                </span>
            </div>

            <div>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--foreground-muted)]">
                    <Package className="h-3.5 w-3.5" />
                    {t("orders.stockToday.inStock", "In stock")}
                    <b className="font-mono text-foreground tabular-nums">{lane.onHand}</b>
                </span>
                <div className="mt-1 h-1.5 rounded-t-[5px] border-[1.5px] border-b-0 border-[var(--foreground-muted)]/50" aria-hidden />
                <div
                    className="flex h-7 gap-0.5 overflow-hidden rounded-[9px] bg-[var(--card-border)] text-xs font-semibold tabular-nums"
                    role="img"
                    aria-label={t("orders.stockToday.barLabel", "{onHand} on hand, {reserved} reserved, {waiting} waiting", {
                        onHand: lane.onHand,
                        reserved: lane.reserved,
                        waiting: lane.waiting,
                    })}
                >
                    {over ? (
                        <span className={cn("flex w-full items-center justify-center gap-1.5 text-white", SWATCH.over)}>
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {t("orders.stockToday.overBy", "{count} oversold", { count: Math.abs(lane.left) })}
                        </span>
                    ) : (
                        <>
                            {lane.reserved > 0 && (
                                <span className={cn("flex items-center justify-center gap-1 text-white dark:text-slate-900", SWATCH.reserved)} style={{ width: `${pct(lane.reserved)}%` }}>
                                    {inside(lane.reserved, <Lock className="h-3 w-3" />)}
                                </span>
                            )}
                            {waiting > 0 && (
                                <span className={cn("flex items-center justify-center gap-1 text-foreground", SWATCH.waiting)} style={{ width: `${pct(waiting)}%` }}>
                                    {inside(waiting, <Clock className="h-3 w-3" />)}
                                </span>
                            )}
                            {free > 0 && (
                                <span className={cn("flex items-center justify-center gap-1 text-white", FREE[state])} style={{ width: `${pct(free)}%` }}>
                                    {inside(free, <Check className="h-3 w-3" strokeWidth={3} />)}
                                </span>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
                <CountChip swatch={SWATCH.reserved} label={t("orders.stockToday.confirmed", "Confirmed")} value={lane.reserved} />
                {lane.waiting > 0 && <CountChip swatch={SWATCH.waiting} label={t("orders.stockToday.waiting", "Waiting")} value={lane.waiting} />}
                {over
                    ? <CountChip swatch={SWATCH.over} label={t("orders.stockToday.over", "over")} value={Math.abs(lane.left)} />
                    : <CountChip swatch={FREE[state]} label={t("orders.stockToday.free", "Free")} value={free} />}
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-2 py-1 text-[11px] text-blue-700 dark:text-blue-300">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {t("orders.stockToday.orderedToday", "Ordered today")}
                    <b className="font-mono tabular-nums">{lane.today}</b>
                </span>
            </div>

            {lane.waiting > 0 && (
                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                    {after < 0
                        ? t("orders.stockToday.ifConfirmOver", "If {waiting} waiting confirm: {count} over", { waiting: lane.waiting, count: Math.abs(after) })
                        : t("orders.stockToday.ifConfirmLeft", "If {waiting} waiting confirm: {count} left", { waiting: lane.waiting, count: after })}
                </p>
            )}
            {lane.onHand < 0 && (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                    {t("orders.stockToday.recount", "Shelf count is below zero. Count it and fix the stock.")}
                </p>
            )}
        </div>
    );
}

function CountChip({ swatch, label, value }: { swatch: string; label: string; value: number }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-2 py-1 text-[11px] text-[var(--foreground-muted)]">
            <i className={cn("h-2.5 w-2.5 rounded-[3px]", swatch)} />
            {label}
            <b className="font-mono text-foreground tabular-nums">{value}</b>
        </span>
    );
}
