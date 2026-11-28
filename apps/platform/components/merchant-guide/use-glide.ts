"use client";

// The light and the card glide when they move to another element, and only
// then. While the same element moves (the page scrolls, a panel slides) they
// follow it frame by frame: a glide there left the light trailing up to the
// whole scroll behind its field, which read as a jittery dim on tablets,
// where pages scroll the most (Ali, 28 Nov).

import { useEffect, useState } from "react";

/** How long a glide takes; the transitions in globals.css match it. */
export const GUIDE_GLIDE_MS = 500;

/** True for one glide after `of` (what the light is on, or null for nothing) changes. */
export function useGlide(of: string | null): boolean {
    const [shown, setShown] = useState(of);
    const [gliding, setGliding] = useState(false);
    if (of !== shown) {
        setShown(of);
        setGliding(true);
    }
    useEffect(() => {
        if (!gliding) return;
        const timer = setTimeout(() => setGliding(false), GUIDE_GLIDE_MS);
        return () => clearTimeout(timer);
    }, [gliding, shown]);
    return gliding;
}
