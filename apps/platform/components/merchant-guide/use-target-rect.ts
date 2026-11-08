"use client";

// Follows a real element on the page: where it is on screen right now. Pages
// load data, open panels and scroll, so the element can appear late or move;
// one animation-frame loop keeps the light on it, and only re-renders when
// the box actually changes.

import { useEffect, useState } from "react";

export interface TargetBox {
    top: number;
    left: number;
    width: number;
    height: number;
}

function sameBox(a: TargetBox | null, b: TargetBox | null): boolean {
    if (a === null || b === null) return a === b;
    return (
        Math.abs(a.top - b.top) < 0.5 &&
        Math.abs(a.left - b.left) < 0.5 &&
        Math.abs(a.width - b.width) < 0.5 &&
        Math.abs(a.height - b.height) < 0.5
    );
}

function visibleBox(el: Element): TargetBox | null {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function useTargetBox(selector: string | null): TargetBox | null {
    const [box, setBox] = useState<TargetBox | null>(null);

    useEffect(() => {
        if (!selector) return;
        let frame = 0;
        // undefined = nothing reported yet for this selector, so the first
        // frame always replaces the previous selector's box.
        let last: TargetBox | null | undefined = undefined;
        let scrolled = false;
        const tick = (): void => {
            const el = document.querySelector(selector);
            const next = el ? visibleBox(el) : null;
            if (el && next && !scrolled) {
                scrolled = true;
                const offscreen = next.top < 0 || next.top + next.height > window.innerHeight;
                if (offscreen) el.scrollIntoView({ block: "center", behavior: "smooth" });
            }
            if (last === undefined || !sameBox(last, next)) {
                last = next;
                setBox(next);
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [selector]);

    return selector ? box : null;
}
