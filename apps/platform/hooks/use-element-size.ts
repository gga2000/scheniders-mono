"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Live content-box size of an element, in whole pixels. Charts that draw their own
 * SVG need real pixel dimensions (a viewBox would scale stroke widths and text).
 * Sizes round DOWN, so content drawn at the measured size never overflows the box.
 * A chart whose box is sized by its parent (flex/grid) should also take its SVG
 * out of flow (absolute), or the SVG's own height feeds back into the box.
 * Starts at 0×0 until the first observation, so callers render nothing until
 * they can render correctly.
 */
export function useElementSize<T extends HTMLElement>() {
    const ref = useRef<T | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            const width = Math.floor(entry.contentRect.width);
            const height = Math.floor(entry.contentRect.height);
            setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return [ref, size] as const;
}
