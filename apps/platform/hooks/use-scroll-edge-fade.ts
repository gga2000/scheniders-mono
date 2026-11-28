"use client";

import { useEffect, useState } from "react";

export interface ScrollEdges {
    /** Content is hidden above the visible part. */
    top: boolean;
    /** Content is hidden below the visible part. */
    bottom: boolean;
}

/** Pixels of slack, so sub-pixel layouts never read as "more to scroll". */
const SLACK_PX = 2;

export function readScrollEdges(el: Pick<HTMLElement, "scrollTop" | "clientHeight" | "scrollHeight">): ScrollEdges {
    return {
        top: el.scrollTop > SLACK_PX,
        bottom: el.scrollTop + el.clientHeight < el.scrollHeight - SLACK_PX,
    };
}

/**
 * Which ends of a vertical scroller hide content right now, so the caller can
 * fade that end instead of hard-clipping a row in half. Follows scrolling, the
 * scroller's own size, and its children's sizes (rows added or growing).
 * Pass `ref` as the scroller's callback ref.
 */
export function useScrollEdgeFade(): { ref: (node: HTMLElement | null) => void; edges: ScrollEdges } {
    const [el, setEl] = useState<HTMLElement | null>(null);
    const [edges, setEdges] = useState<ScrollEdges>({ top: false, bottom: false });

    useEffect(() => {
        if (!el) return;
        const update = () => {
            const next = readScrollEdges(el);
            setEdges((prev) => (prev.top === next.top && prev.bottom === next.bottom ? prev : next));
        };
        const resize = new ResizeObserver(update);
        const observeRows = () => {
            resize.disconnect();
            resize.observe(el);
            for (const child of Array.from(el.children)) resize.observe(child);
            update();
        };
        const rows = new MutationObserver(observeRows);
        observeRows();
        rows.observe(el, { childList: true });
        el.addEventListener("scroll", update, { passive: true });
        return () => {
            el.removeEventListener("scroll", update);
            rows.disconnect();
            resize.disconnect();
        };
    }, [el]);

    return { ref: setEl, edges };
}
