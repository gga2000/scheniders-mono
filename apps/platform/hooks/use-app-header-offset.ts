"use client";

import { useEffect, useState } from "react";

/**
 * How much of the viewport's top the shell's sticky `.app-header` covers right
 * now: its height while it is shown, 0 while its headroom has slid it away
 * (`data-hidden="true"`). A page's own sticky band sticks at this offset, so it
 * sits under the header instead of half over it. Reads the shell's markup and
 * changes nothing in it; with no header (an immersive page) the offset is 0.
 */
export function useAppHeaderOffset(): number {
    const [offset, setOffset] = useState(0);

    useEffect(() => {
        const header = document.querySelector<HTMLElement>(".app-header");
        if (!header) return;
        // offsetHeight is the layout height, which the header's slide (a transform) does not change.
        const update = () => setOffset(header.dataset.hidden === "true" ? 0 : header.offsetHeight);
        update();
        const resize = new ResizeObserver(update);
        resize.observe(header);
        const attributes = new MutationObserver(update);
        attributes.observe(header, { attributes: true, attributeFilter: ["data-hidden"] });
        return () => {
            resize.disconnect();
            attributes.disconnect();
        };
    }, []);

    return offset;
}

/** Moves a band stuck at the offset in step with the header's own slide (globals.css `.app-header`). */
export const APP_HEADER_SLIDE = "transition-[top] duration-[280ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none";
