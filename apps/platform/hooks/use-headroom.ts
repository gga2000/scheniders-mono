"use client";

import { useEffect, useRef, useState } from "react";

export interface UseHeadroomOptions {
    /** px scrolled before hiding is allowed. Default 64. */
    threshold?: number;
    /** min |delta| to act on — kills jitter. Default 4. */
    deadzone?: number;
    /** when true, never hide (e.g. a header dropdown is open). Default false. */
    locked?: boolean;
    /** disable entirely (e.g. mobile). Default false. */
    disabled?: boolean;
}

/**
 * Direction-aware "headroom": hides the header on scroll-down past `threshold`,
 * reveals it on any scroll-up, and always shows it near the top. Reads scrollY
 * inside requestAnimationFrame (no layout thrash), updates at most once per frame,
 * and only flips a boolean — the actual movement is a CSS transform on the header,
 * so there is no per-frame re-render of the header subtree and no reflow.
 */
export function useHeadroom(options: UseHeadroomOptions = {}): { hidden: boolean } {
    const { threshold = 64, deadzone = 4, locked = false, disabled = false } = options;
    const [hidden, setHidden] = useState(false);
    const lastY = useRef(0);
    const ticking = useRef(false);
    const lockedRef = useRef(locked);
    lockedRef.current = locked;

    useEffect(() => {
        if (disabled || typeof window === "undefined") return;
        lastY.current = window.scrollY;

        const update = () => {
            ticking.current = false;
            if (lockedRef.current) return;
            const y = window.scrollY;
            const dy = y - lastY.current;
            if (Math.abs(dy) < deadzone) return;
            lastY.current = y;
            if (y < 8) { setHidden(false); return; }
            if (dy > 0 && y > threshold) setHidden(true);
            else if (dy < 0) setHidden(false);
        };

        const onScroll = () => {
            if (ticking.current) return;
            ticking.current = true;
            requestAnimationFrame(update);
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [threshold, deadzone, disabled]);

    return { hidden: locked ? false : hidden };
}
