"use client";

import { useState } from "react";
import { Eye, EyeOff, PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useStockPins } from "@/hooks/use-stock-pins";
import { useStockTodayQuery } from "@/hooks/use-stock-today-query";
import { STATE_NUMBER } from "@/components/orders/stock-unit-bar";
import { laneState, OPEN_BOX_LOW_AT, type StockTodayItem } from "@/lib/orders/stock-today";

const HIDDEN_KEY = "stock-pins-hidden";

/** Hidden is a per-person choice, so it lives in this browser, not in the store's settings. */
function readHidden(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(HIDDEN_KEY) === "1";
    } catch {
        return false;
    }
}

function saveHidden(hidden: boolean) {
    try {
        window.localStorage.setItem(HIDDEN_KEY, hidden ? "1" : "0");
    } catch {
        // Not remembered when storage is blocked; the chips still hide for now.
    }
}

const TOGGLE = "grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/20 bg-white/40 text-[var(--foreground-muted)] ring-1 ring-black/5 backdrop-blur-md transition-colors hover:text-foreground orders-toolbar-pill";

/**
 * The store's pinned products beside the Stock button: short name and what is
 * left to sell, new stock first and open box after it. A tap opens Stock today.
 * Up to three; the eye hides them for this person.
 */
export function StockPinChips({ onOpen }: { onOpen: () => void }) {
    const { t } = useLanguage();
    const [hidden, setHidden] = useState(readHidden);
    const { data } = useStockTodayQuery(!hidden);
    const { pinned } = useStockPins(data ?? []);

    const toggle = () => {
        setHidden(prev => {
            saveHidden(!prev);
            return !prev;
        });
    };

    if (!hidden && pinned.length === 0) return null;

    return (
        <div className="flex min-w-0 items-center gap-2">
            {!hidden && pinned.map(item => <Chip key={item.key} item={item} onOpen={onOpen} />)}
            <button
                type="button"
                onClick={toggle}
                aria-pressed={hidden}
                title={hidden ? t("orders.stockToday.pin.show", "Show pinned stock") : t("orders.stockToday.pin.hide", "Hide pinned stock")}
                aria-label={hidden ? t("orders.stockToday.pin.show", "Show pinned stock") : t("orders.stockToday.pin.hide", "Hide pinned stock")}
                className={TOGGLE}
            >
                {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
        </div>
    );
}

function Chip({ item, onOpen }: { item: StockTodayItem; onOpen: () => void }) {
    const { t } = useLanguage();
    const fresh = laneState(item.fresh, item.lowAt);
    const box = item.openBox;
    const boxState = box ? laneState(box, OPEN_BOX_LOW_AT) : null;
    const left = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));
    return (
        <button
            type="button"
            onClick={onOpen}
            title={item.name}
            aria-label={`${item.shortName}: ${t("orders.stockToday.new", "New")} ${left(item.fresh.left)}${box ? `, ${t("orders.stockToday.openBox", "Open box")} ${left(box.left)}` : ""}`}
            className="flex min-w-0 items-center gap-2.5 rounded-full border border-white/20 bg-white/40 py-2 pl-4 pr-4 ring-1 ring-black/5 backdrop-blur-md shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md orders-toolbar-pill"
        >
            <span className="max-w-[7.5rem] truncate text-sm font-bold text-foreground" dir="auto">{item.shortName}</span>
            <span className={cn("font-mono text-lg font-bold leading-none tabular-nums", STATE_NUMBER[fresh])} dir="ltr">
                {left(item.fresh.left)}
            </span>
            {box && boxState && (
                <span
                    className={cn("flex items-center gap-1 border-s border-black/10 ps-2.5 font-mono text-sm font-semibold leading-none tabular-nums dark:border-white/15", STATE_NUMBER[boxState])}
                    title={t("orders.stockToday.openBox", "Open box")}
                    dir="ltr"
                >
                    <PackageOpen className="h-3.5 w-3.5" />
                    {left(box.left)}
                </span>
            )}
        </button>
    );
}
