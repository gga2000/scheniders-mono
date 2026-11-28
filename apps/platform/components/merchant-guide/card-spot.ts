// Where the guide's card sits beside the lit element.
//
// The card tries below, above, right, then left of the element, inside the
// part of the screen that nothing paints over: clear of the guide's pill and
// of the desktop menu, which sits above the card (Ali, 28 Nov: on an iPad the
// card on the product's price field slid under the menu). While the same
// element moves (the page scrolls) the card keeps its side as long as it
// still fits, so it doesn't hop from above to beside to below on one scroll.

export const CARD_GAP = 18;
export const CARD_EDGE = 16;

/** Marks something that paints over the guide's card: the card keeps clear of it. */
export const KEEP_CLEAR_ATTR = "data-guide-keep-clear";

export type CardSide = "below" | "above" | "right" | "left";
const SIDES: readonly CardSide[] = ["below", "above", "right", "left"];

export interface Rect {
    top: number;
    left: number;
    width: number;
    height: number;
}

/** The part of the screen the card may use. */
export interface FreeArea {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface CardSpot {
    left: number;
    top: number;
    side: CardSide;
}

/**
 * The screen less its edges, the band at the bottom kept for the pill, and
 * the strip of each element that paints over the card (a menu on the left
 * pushes the free area's left edge past it).
 */
export function freeArea(view: { width: number; height: number }, bottomBand: number, keepClear: readonly Rect[]): FreeArea {
    let left = CARD_EDGE;
    let right = view.width - CARD_EDGE;
    for (const r of keepClear) {
        if (r.width === 0 || r.height === 0) continue;
        if (r.left + r.width / 2 < view.width / 2) left = Math.max(left, r.left + r.width + CARD_EDGE);
        else right = Math.min(right, r.left - CARD_EDGE);
    }
    return { left, top: CARD_EDGE, right, bottom: view.height - bottomBand };
}

function clamp(value: number, low: number, high: number): number {
    return Math.max(low, Math.min(Math.max(low, high), value));
}

/** The card's corner on one side of the element, before it is kept inside the free area. */
function rawSpot(side: CardSide, box: Rect, w: number, h: number): { left: number; top: number } {
    const centerLeft = box.left + box.width / 2 - w / 2;
    const middleTop = box.top + box.height / 2 - h / 2;
    switch (side) {
        case "below":
            return { left: centerLeft, top: box.top + box.height + CARD_GAP };
        case "above":
            return { left: centerLeft, top: box.top - CARD_GAP - h };
        case "right":
            return { left: box.left + box.width + CARD_GAP, top: middleTop };
        case "left":
            return { left: box.left - CARD_GAP - w, top: middleTop };
    }
}

/** True when the side has room without covering the element: the card only slides along it. */
function fits(side: CardSide, box: Rect, w: number, h: number, area: FreeArea): boolean {
    const spot = rawSpot(side, box, w, h);
    const across = side === "below" || side === "above";
    const roomAlong = across ? area.right - area.left >= w : area.bottom - area.top >= h;
    if (!roomAlong) return false;
    switch (side) {
        case "below":
            return spot.top + h <= area.bottom;
        case "above":
            return spot.top >= area.top;
        case "right":
            return spot.left + w <= area.right;
        case "left":
            return spot.left >= area.left;
    }
}

function placed(side: CardSide, box: Rect, w: number, h: number, area: FreeArea): CardSpot {
    const spot = rawSpot(side, box, w, h);
    return {
        left: clamp(spot.left, area.left, area.right - w),
        top: clamp(spot.top, area.top, area.bottom - h),
        side,
    };
}

function overlap(a: Rect, b: Rect): number {
    const x = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
    const y = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
    return x > 0 && y > 0 ? x * y : 0;
}

/**
 * The card's spot beside `box`. `keep` is the side it is on now for the same
 * element: it stays there while it fits. With no side that fits, the card
 * goes where it hides the least of the element.
 */
export function cardSpot(box: Rect, card: { width: number; height: number }, area: FreeArea, keep: CardSide | null = null): CardSpot {
    const { width: w, height: h } = card;
    if (keep && fits(keep, box, w, h, area)) return placed(keep, box, w, h, area);
    const side = SIDES.find((s) => fits(s, box, w, h, area));
    if (side) return placed(side, box, w, h, area);
    let best = placed(SIDES[0], box, w, h, area);
    let bestCover = Infinity;
    for (const s of SIDES) {
        const spot = placed(s, box, w, h, area);
        const cover = overlap({ left: spot.left, top: spot.top, width: w, height: h }, box);
        if (cover < bestCover) {
            best = spot;
            bestCover = cover;
        }
    }
    return best;
}
