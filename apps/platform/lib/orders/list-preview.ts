import type { Order } from "@/types/order";
import type { OrderWindow } from "@/lib/order-window";
import { isParked, sortDesktopList, sortMobileList } from "@/lib/orders/list-sort";

// =============================================
// LIST PREVIEW ("head")
//
// A wide window (All Orders: ~5.2k rows, ~1 MB gzip) takes seconds to load in
// full. Its first rows do not: the list fetch reads the newest rows and every
// pinned row first (orderRepository.findHead), and the page paints those,
// READ-ONLY, until the full window commits.
//
// Nothing is ever counted over a preview. Counts stay hidden ("—") until the
// list covers the window (lib/orders/count-visibility.ts), so chip == list
// is never at stake. What the preview must guarantee is that no row it shows
// moves when the full list replaces it: the rows a page shows are a PREFIX of
// what it shows once complete. Pinned-first plus newest-first makes that hold,
// except for two rules of the page comparators, applied below:
//
//   parked   a row scheduled for a later day sinks below every live row, even
//            ones older than the head reached. A parked row in the head is
//            dropped (desktop keeps parked PINNED rows: pinned sorts first).
//   mobile   ignores the pin, so only the newest rows count, and only those
//            strictly newer (in ms) than the oldest of them: on a millisecond
//            tie the full list puts a pinned row first (useOrderFilters sorts
//            pinned first, and the mobile sort is stable), and that pinned row
//            may be one the newest rows did not reach.
//
// Proven by property test (list-preview.test.ts) over random books.
// =============================================

/** Newest rows the head reads. */
export const PREVIEW_HEAD_ROWS = 50;
/** Pinned rows the head reads at most. A head that hits it may be missing pinned rows: no preview. */
export const PREVIEW_PINNED_MAX = 100;
/** Windows up to this span load in full quickly (Today: a few hundred rows); only wider ones preview. */
export const PREVIEW_MIN_SPAN_MS = 7 * 24 * 60 * 60 * 1000;

export interface OrderListPreview {
    /** Every pinned row, then the newest PREVIEW_HEAD_ROWS rows without them. */
    rows: Order[];
    /**
     * `created_at` of the oldest of the newest rows when the window holds more
     * rows than the head read; null when the head holds the whole window.
     */
    newestCutoff: string | null;
    /** Rows the whole window holds (the head's exact count). */
    total: number;
    /** Whether `risk_data` has been attached yet. */
    withRisk: boolean;
}

export function windowWantsPreview(window: OrderWindow): boolean {
    return window === null || window.toInstant - window.fromInstant > PREVIEW_MIN_SPAN_MS;
}

/**
 * Pinned rows first (server order), then the newest rows minus those, each id
 * once. `total` is the window's row count: when it exceeds `top`, the oldest
 * of `top` is the cutoff mobile needs.
 */
export function mergePreviewHead(
    pinned: readonly Order[],
    top: readonly Order[],
    total: number,
): Pick<OrderListPreview, "rows" | "newestCutoff"> {
    const seen = new Set<string>();
    const rows: Order[] = [];
    for (const row of [...pinned, ...top]) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
    }
    const oldest = top.length > 0 ? top[top.length - 1] : null;
    return { rows, newestCutoff: oldest && total > top.length ? oldest.created_at : null };
}

/** The preview rows the desktop list may show, in its order. `rows`: the hook's filtered preview. */
export function desktopPreviewRows(rows: readonly Order[], now: number = Date.now()): Order[] {
    return sortDesktopList(rows.filter((o) => o.is_pinned || !isParked(o, now)), [], now);
}

/** The preview rows the mobile list may show, in its order. */
export function mobilePreviewRows(rows: readonly Order[], newestCutoff: string | null, now: number = Date.now()): Order[] {
    const cutoffMs = newestCutoff === null ? null : Date.parse(newestCutoff);
    return sortMobileList(
        rows.filter((o) => (cutoffMs === null || Date.parse(o.created_at) > cutoffMs) && !isParked(o, now)),
        now,
    );
}
