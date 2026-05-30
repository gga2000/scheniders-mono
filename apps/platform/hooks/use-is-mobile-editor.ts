"use client";

import { useEffect, useState } from "react";

/**
 * Returns `true` when the viewport is narrower than the desktop-editor
 * threshold (1024px). Used by `EditorShell` to swap the 3-pane desktop
 * layout for a phone-first single-pane shell with bottom-sheet drawers.
 *
 * SSR-safe: returns `false` until the first effect tick on the client,
 * so the desktop tree is rendered during hydration and we avoid a
 * layout-shift flash for desktop merchants.
 *
 * Reactive via `matchMedia('(max-width: 1023px)')`.
 */
export function useIsMobileEditor(breakpointPx: number = 1024): boolean {
    const [isMobile, setIsMobile] = useState<boolean>(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const onResize = (): void => setIsMobile(window.innerWidth < breakpointPx);
        // Initial sync — covers environments where matchMedia is missing
        // (some test harnesses) as well as the normal browser path.
        onResize();
        let mql: MediaQueryList | null = null;
        let listener: ((e: MediaQueryListEvent) => void) | null = null;
        if (typeof window.matchMedia === "function") {
            const query = `(max-width: ${breakpointPx - 1}px)`;
            mql = window.matchMedia(query);
            listener = (e: MediaQueryListEvent): void => setIsMobile(e.matches);
            setIsMobile(mql.matches);
            if (typeof mql.addEventListener === "function") {
                mql.addEventListener("change", listener);
            } else if (typeof (mql as unknown as { addListener?: (l: (e: MediaQueryListEvent) => void) => void }).addListener === "function") {
                (mql as unknown as { addListener: (l: (e: MediaQueryListEvent) => void) => void }).addListener(listener);
            }
        }
        window.addEventListener("resize", onResize);
        return () => {
            if (mql && listener) {
                if (typeof mql.removeEventListener === "function") {
                    mql.removeEventListener("change", listener);
                } else if (typeof (mql as unknown as { removeListener?: (l: (e: MediaQueryListEvent) => void) => void }).removeListener === "function") {
                    (mql as unknown as { removeListener: (l: (e: MediaQueryListEvent) => void) => void }).removeListener(listener);
                }
            }
            window.removeEventListener("resize", onResize);
        };
    }, [breakpointPx]);

    return isMobile;
}
