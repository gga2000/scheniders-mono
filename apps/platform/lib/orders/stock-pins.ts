import { z } from "zod";
import type { StockTodayItem } from "@/lib/orders/stock-today";

/** Row key in `app_settings`: one shared list per store. */
export const STOCK_PINS_KEY = "stock_pins";

/** Chips beside the Stock pill; the same products lead the dialog. */
export const MAX_STOCK_PINS = 3;

/** Item keys (variant id, else product id) in the order they are shown. */
const stockPinsSchema = z.object({ keys: z.array(z.string().min(1)).max(MAX_STOCK_PINS) });

/** Null when the store never saved a list, so the default applies; an empty list is a choice. */
export function parseStockPins(value: unknown): string[] | null {
    const parsed = stockPinsSchema.safeParse(value);
    return parsed.success ? parsed.data.keys : null;
}

/**
 * The products to pin right now. A saved list wins, minus products that no
 * longer exist. A store that never chose gets the products most ordered today,
 * so the chips are useful from the first day without any setup.
 */
export function resolveStockPins(items: readonly StockTodayItem[], saved: readonly string[] | null): StockTodayItem[] {
    if (saved) {
        const byKey = new Map(items.map(i => [i.key, i]));
        return saved.flatMap(key => byKey.get(key) ?? []);
    }
    return items
        .map(item => ({ item, units: item.fresh.today + (item.openBox?.today ?? 0) }))
        .filter(({ units }) => units > 0)
        .sort((a, b) => b.units - a.units)
        .slice(0, MAX_STOCK_PINS)
        .map(({ item }) => item);
}

/** Pinned products first, in pin order; everyone else keeps the order they came in. */
export function pinnedFirst(items: readonly StockTodayItem[], pinned: readonly StockTodayItem[]): StockTodayItem[] {
    const rank = new Map(pinned.map((p, i) => [p.key, i]));
    return [...items].sort((a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity));
}

/** Unpins a pinned key, or pins a new one at the end. Unchanged when the list is full. */
export function togglePin(keys: readonly string[], key: string): string[] {
    if (keys.includes(key)) return keys.filter(k => k !== key);
    return keys.length >= MAX_STOCK_PINS ? [...keys] : [...keys, key];
}

/** Moves a pinned key one place earlier (-1) or later (1). */
export function movePin(keys: readonly string[], key: string, step: -1 | 1): string[] {
    const from = keys.indexOf(key);
    const to = from + step;
    if (from < 0 || to < 0 || to >= keys.length) return [...keys];
    const next = [...keys];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
}
