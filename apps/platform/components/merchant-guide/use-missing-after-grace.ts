import { useEffect, useState } from "react";

/** How long a missing element may take to appear before offering "Take me there". */
const FIND_GRACE_MS = 900;

/** Waits a moment for the element to appear before calling it missing. */
export function useMissingAfterGrace(selector: string, found: boolean): boolean {
    const [missing, setMissing] = useState<{ selector: string; missing: boolean }>({ selector, missing: false });
    useEffect(() => {
        if (found) return;
        const timer = setTimeout(() => setMissing({ selector, missing: true }), FIND_GRACE_MS);
        return () => clearTimeout(timer);
    }, [selector, found]);
    return !found && missing.selector === selector && missing.missing;
}
