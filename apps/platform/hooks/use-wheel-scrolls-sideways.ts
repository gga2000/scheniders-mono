"use client";

import { useEffect, type RefObject } from "react";

interface WheelInput {
    deltaX: number;
    deltaY: number;
    /** 0 pixels, 1 lines, 2 pages (WheelEvent.deltaMode). */
    deltaMode: number;
    shiftKey: boolean;
    ctrlKey: boolean;
}

interface RowBox {
    scrollLeft: number;
    clientWidth: number;
    scrollWidth: number;
}

const LINE_PX = 16;

/**
 * Where a plain vertical mouse wheel should move a sideways-scrolling row, or
 * null to leave the wheel to the page: when the row has nothing hidden, when
 * the wheel is already sideways (trackpad, shift+wheel), when ctrl means zoom,
 * and once the row has reached its end in that direction.
 */
export function wheelToSideways(e: WheelInput, row: RowBox): number | null {
    if (e.ctrlKey || e.shiftKey || e.deltaY === 0 || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return null;
    const max = row.scrollWidth - row.clientWidth;
    if (max <= 0) return null;
    if (e.deltaY > 0 && row.scrollLeft >= max - 1) return null;
    if (e.deltaY < 0 && row.scrollLeft <= 0) return null;
    const step = e.deltaMode === 1 ? e.deltaY * LINE_PX : e.deltaMode === 2 ? e.deltaY * row.clientWidth : e.deltaY;
    return Math.min(max, Math.max(0, row.scrollLeft + step));
}

/**
 * Lets an ordinary mouse wheel reach the hidden end of a row that scrolls
 * sideways (the Orders status chips), without changing how the row looks.
 */
export function useWheelScrollsSideways(ref: RefObject<HTMLElement | null>): void {
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            const next = wheelToSideways(e, el);
            if (next === null) return;
            const before = el.scrollLeft;
            el.scrollLeft = next;
            // Only a wheel that moved the row is the row's. Snap points can hold the row
            // short of its last pixel, so once it stops moving the page scrolls again.
            if (el.scrollLeft !== before) e.preventDefault();
        };
        // Not passive, so the page does not also scroll while the row moves.
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [ref]);
}
