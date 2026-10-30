"use client";

import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { ProductThumb } from "@/components/products/product-thumb";
import {
    laneState,
    OPEN_BOX_LOW_AT,
    STOCK_STATE_LABEL,
    type StockLane,
    type StockState,
    type StockTodayItem,
} from "@/lib/orders/stock-today";

const TONE: Record<StockState, { box: string; num: string }> = {
    oversold: {
        box: "bg-red-50 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/30",
        num: "text-red-600 dark:text-red-400",
    },
    short: {
        box: "bg-amber-50 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30",
        num: "text-amber-700 dark:text-amber-400",
    },
    out: {
        box: "bg-[var(--background)] ring-[var(--card-border)]",
        num: "text-[var(--foreground-muted)]",
    },
    low: {
        box: "bg-amber-50 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30",
        num: "text-amber-700 dark:text-amber-400",
    },
    ok: {
        box: "bg-emerald-50 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/25",
        num: "text-emerald-700 dark:text-emerald-400",
    },
};

/**
 * The at-a-glance board: one card per product with the number free to sell,
 * new and open box side by side, coloured by how worried to be. The numbers
 * behind it (reserved, waiting, today) live in the detailed view.
 */
export function StockTodayGlance({ items }: { items: readonly StockTodayItem[] }) {
    return (
        <ul className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 gap-2.5 pt-3">
            {items.map(item => <GlanceCard key={item.key} item={item} />)}
        </ul>
    );
}

function GlanceCard({ item }: { item: StockTodayItem }) {
    const { t } = useLanguage();
    const today = item.fresh.today + (item.openBox?.today ?? 0);
    return (
        <li className="flex flex-col gap-2.5 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative w-9 h-9 shrink-0 overflow-hidden rounded-[10px] bg-[var(--background)] flex items-center justify-center">
                    {item.imageUrl
                        ? <ProductThumb src={item.imageUrl} alt="" sizes="36px" />
                        : <Package className="w-4 h-4 text-[var(--foreground-muted)]" />}
                </div>
                <div className="min-w-0">
                    <p className="truncate text-left text-sm font-semibold leading-tight" dir="auto" title={item.name}>
                        {item.name}
                    </p>
                    {item.variantName && (
                        <p className="truncate text-left text-[11px] text-[var(--foreground-muted)]" dir="auto">{item.variantName}</p>
                    )}
                </div>
            </div>
            <div className={cn("grid gap-2", item.openBox && "grid-cols-2")}>
                <LeftCount lane={item.fresh} state={laneState(item.fresh, item.lowAt)} label={t("orders.stockToday.new", "New")} />
                {item.openBox && (
                    <LeftCount lane={item.openBox} state={laneState(item.openBox, OPEN_BOX_LOW_AT)} label={t("orders.stockToday.openBox", "Open box")} />
                )}
            </div>
            {today > 0 && (
                <p className="text-[11px] text-[var(--foreground-muted)]">
                    {t("orders.stockToday.glance.today", "{count} ordered today", { count: today })}
                </p>
            )}
        </li>
    );
}

function LeftCount({ lane, state, label }: { lane: StockLane; state: StockState; label: string }) {
    const { t } = useLanguage();
    const [key, fallback] = STOCK_STATE_LABEL[state];
    const tone = TONE[state];
    return (
        <div className={cn("rounded-xl px-3 py-2 ring-1 ring-inset", tone.box)}>
            <span className="block text-[11px] font-medium text-[var(--foreground-muted)]">{label}</span>
            <span className={cn("block text-[28px] font-bold leading-tight tabular-nums", tone.num)} dir="ltr">
                {lane.left < 0 ? `−${Math.abs(lane.left)}` : lane.left}
            </span>
            <span className={cn("block truncate text-[11px] font-semibold", tone.num)}>{t(key, fallback)}</span>
        </div>
    );
}
