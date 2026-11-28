import { useEffect, useState } from "react";

/** How long a missing element may take to appear before offering "Take me there". */
const FIND_GRACE_MS = 900;

/**
 * Waits a moment for the element to appear before calling it missing. A stop
 * with nothing to find (null) is never missing. `key` is the selector, or any
 * name for what is being looked for.
 */
export function useMissingAfterGrace(key: string | null, found: boolean, graceMs: number = FIND_GRACE_MS): boolean {
    const [missing, setMissing] = useState<{ key: string | null; missing: boolean }>({ key, missing: false });
    useEffect(() => {
        if (found || key === null) return;
        const timer = setTimeout(() => setMissing({ key, missing: true }), graceMs);
        return () => clearTimeout(timer);
    }, [key, found, graceMs]);
    return key !== null && !found && missing.key === key && missing.missing;
}
