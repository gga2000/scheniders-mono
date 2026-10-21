"use client";

import { useEffect, useState } from "react";

/**
 * How far an element's top edge sits below the top of the document, kept up
 * to date: the `scrollMargin` a window virtualizer needs to know which rows
 * are on screen. Attach `ref` to the element.
 *
 * Read once on mount it goes stale the moment anything above the list changes
 * height: the analytics panel animating open, the pipeline, the selection
 * bar, a banner. Every one of those changes the document's height, so the
 * body is observed rather than each thing that could move the list. The
 * observer also reports once as soon as it starts, which gives the first
 * reading without a synchronous measurement inside the effect.
 *
 * `ref` is a callback ref, so an element that mounts after the first render
 * (a list that starts on its empty state) is measured when it appears.
 */
export function useDocumentOffsetTop<T extends HTMLElement>(): {
    top: number;
    ref: (element: T | null) => void;
} {
    const [element, setElement] = useState<T | null>(null);
    const [top, setTop] = useState(0);

    useEffect(() => {
        if (!element) return;
        const observer = new ResizeObserver(() => {
            setTop(element.getBoundingClientRect().top + window.scrollY);
        });
        observer.observe(document.body);
        return () => observer.disconnect();
    }, [element]);

    return { top, ref: setElement };
}
