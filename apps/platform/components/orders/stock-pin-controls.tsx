"use client";

import { ChevronDown, ChevronUp, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { MAX_STOCK_PINS } from "@/lib/orders/stock-pins";

export interface StockPinState {
    /** Pinned item keys in order. */
    keys: readonly string[];
    /** Only store admins can change the list; everyone else just sees it. */
    canEdit: boolean;
    isFull: boolean;
    toggle: (key: string) => void;
    move: (key: string, step: -1 | 1) => void;
}

const BUTTON = "grid h-7 w-7 place-items-center rounded-lg transition-colors";

/**
 * Pin, unpin and reorder for one product. Pinned products show as chips beside
 * the Stock button and lead this dialog; a team member who cannot edit sees the
 * pin as a mark, not a button.
 */
export function StockPinControls({ itemKey, pins }: { itemKey: string; pins: StockPinState }) {
    const { t } = useLanguage();
    const index = pins.keys.indexOf(itemKey);
    const pinned = index >= 0;

    if (!pins.canEdit) {
        return pinned ? (
            <span className="grid h-7 w-7 place-items-center text-[var(--foreground-muted)]" title={t("orders.stockToday.pin.pinned", "Pinned")}>
                <Pin className="h-3.5 w-3.5 fill-current" />
            </span>
        ) : null;
    }

    const full = !pinned && pins.isFull;
    return (
        <span className="inline-flex items-center gap-0.5">
            {pinned && pins.keys.length > 1 && (
                <span className="inline-flex flex-col">
                    <button
                        type="button"
                        onClick={() => pins.move(itemKey, -1)}
                        disabled={index === 0}
                        aria-label={t("orders.stockToday.pin.earlier", "Move earlier")}
                        className="grid h-3.5 w-7 place-items-center rounded text-[var(--foreground-muted)] hover:text-foreground disabled:opacity-25"
                    >
                        <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => pins.move(itemKey, 1)}
                        disabled={index === pins.keys.length - 1}
                        aria-label={t("orders.stockToday.pin.later", "Move later")}
                        className="grid h-3.5 w-7 place-items-center rounded text-[var(--foreground-muted)] hover:text-foreground disabled:opacity-25"
                    >
                        <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                </span>
            )}
            <button
                type="button"
                onClick={() => pins.toggle(itemKey)}
                disabled={full}
                aria-pressed={pinned}
                title={full
                    ? t("orders.stockToday.pin.full", "{count} pinned. Unpin one first.", { count: MAX_STOCK_PINS })
                    : pinned ? t("orders.stockToday.pin.unpin", "Unpin") : t("orders.stockToday.pin.pin", "Pin to the top")}
                aria-label={pinned ? t("orders.stockToday.pin.unpin", "Unpin") : t("orders.stockToday.pin.pin", "Pin to the top")}
                className={cn(
                    BUTTON,
                    pinned
                        ? "bg-foreground text-background"
                        : "text-[var(--foreground-muted)] hover:bg-[var(--background)] hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                )}
            >
                <Pin className={cn("h-3.5 w-3.5", pinned && "fill-current")} />
            </button>
        </span>
    );
}
