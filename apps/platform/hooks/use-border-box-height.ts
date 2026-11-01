"use client";

import { useEffect, useState } from "react";

/**
 * An element's rendered height, border and padding included, kept up to date:
 * what a sticky element stacked under it needs as its `top`, so the two meet
 * with no gap whatever the first one's padding, border or font size.
 *
 * Observes the border box, so a padding or border change is seen too (the
 * default content box would miss it). The observer reports once as soon as it
 * starts, which gives the first reading without a synchronous measurement.
 *
 * `ref` is a callback ref, so an element that mounts after the first render is
 * measured when it appears. Starts at 0 until the first observation.
 */
export function useBorderBoxHeight<T extends HTMLElement>(): {
    height: number;
    ref: (element: T | null) => void;
} {
    const [element, setElement] = useState<T | null>(null);
    const [height, setHeight] = useState(0);

    useEffect(() => {
        if (!element) return;
        const observer = new ResizeObserver(() => {
            setHeight(element.getBoundingClientRect().height);
        });
        observer.observe(element, { box: "border-box" });
        return () => observer.disconnect();
    }, [element]);

    return { height, ref: setElement };
}
