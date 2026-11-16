"use client";

import { useEffect, useState, type RefObject } from "react";

export interface EdgeOverflow {
    /** Content is scrolled past on the left. */
    left: boolean;
    /** Content runs past the right edge. */
    right: boolean;
}

/** The mask that fades a scrolling row only on the sides that hide content. */
export function edgeFadeClass({ left, right }: EdgeOverflow): string | false {
    if (left && right) return "[mask-image:linear-gradient(to_right,transparent,black_32px,black_calc(100%-32px),transparent)]";
    if (left) return "[mask-image:linear-gradient(to_right,transparent,black_32px)]";
    if (right) return "[mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]";
    return false;
}

/**
 * Which sides of a horizontally scrolling row hide content, kept current on
 * scroll and resize, so the row can fade and offer a scroll button only there.
 */
export function useEdgeOverflow(ref: RefObject<HTMLElement | null>): EdgeOverflow {
    const [edges, setEdges] = useState<EdgeOverflow>({ left: false, right: false });
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const update = () => {
            const left = el.scrollLeft > 4;
            const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
            setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
        };
        update();
        el.addEventListener("scroll", update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        // Chips appear and change width as counts arrive.
        for (const child of el.children) ro.observe(child);
        return () => {
            el.removeEventListener("scroll", update);
            ro.disconnect();
        };
    }, [ref]);
    return edges;
}
