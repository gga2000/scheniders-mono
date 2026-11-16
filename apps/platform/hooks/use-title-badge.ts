// apps/platform/hooks/use-title-badge.ts
//
// F3. Puts the unread count in the browser tab title, which is where most
// people are when something happens — working in another tab, with this one
// out of sight. The bell's badge only helps someone already looking at it.

import { useEffect } from "react";
import { setTabTitlePart } from "@/lib/tab-title";

/** Shows the bell's unread count in the tab title while it is above zero. */
export function useTitleBadge(count: number): void {
    useEffect(() => {
        setTabTitlePart("notifications", count);
        return () => setTabTitlePart("notifications", 0);
    }, [count]);
}
