import { useEffect, useState } from "react";

/** How long a missing element may take to appear before offering "Take me there". */
const FIND_GRACE_MS = 900;

/** Waits a moment for the element to appear before calling it missing. A stop with nothing to find (null) is never missing. */
export function useMissingAfterGrace(selector: string | null, found: boolean): boolean {
    const [missing, setMissing] = useState<{ selector: string | null; missing: boolean }>({ selector, missing: false });
    useEffect(() => {
        if (found || selector === null) return;
        const timer = setTimeout(() => setMissing({ selector, missing: true }), FIND_GRACE_MS);
        return () => clearTimeout(timer);
    }, [selector, found]);
    return selector !== null && !found && missing.selector === selector && missing.missing;
}
