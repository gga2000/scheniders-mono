// apps/platform/hooks/use-title-badge.ts
//
// F3. Puts the unread count in the browser tab title, which is where most
// people are when something happens — working in another tab, with this one
// out of sight. The bell's badge only helps someone already looking at it.

import { useEffect, useRef } from "react";

/**
 * Prefixes the document title with `(n)` while there is anything unread, and
 * restores the page's own title when the count drops to zero or the component
 * unmounts. Other code is free to change `document.title` meanwhile: the
 * untouched title is re-read on every change rather than captured once.
 */
export function useTitleBadge(count: number): void {
    // The title as the app wants it, without our prefix.
    const baseTitle = useRef<string>("");

    useEffect(() => {
        if (typeof document === "undefined") return;

        const stripped = document.title.replace(/^\(\d+\+?\)\s*/, "");
        baseTitle.current = stripped;

        document.title = count > 0
            ? `(${count > 99 ? "99+" : count}) ${stripped}`
            : stripped;

        return () => {
            // Leave the tab as we found it.
            if (typeof document !== "undefined") {
                document.title = document.title.replace(/^\(\d+\+?\)\s*/, "");
            }
        };
    }, [count]);
}
