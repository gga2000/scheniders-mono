"use client";

import { useState, useEffect } from "react";

/**
 * Custom hook to detect mobile viewport
 * Uses 768px as the breakpoint (md in Tailwind)
 */
export function useIsMobile(breakpoint: number = 768): boolean {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        // Check if we're on the client
        if (typeof window === "undefined") return;

        const checkMobile = () => {
            setIsMobile(window.innerWidth < breakpoint);
        };

        // Initial check
        checkMobile();

        // Listen for resize events
        window.addEventListener("resize", checkMobile);

        return () => window.removeEventListener("resize", checkMobile);
    }, [breakpoint]);

    return isMobile;
}

/**
 * Hook to detect if device supports touch
 */
export function useIsTouch(): boolean {
    const [isTouch, setIsTouch] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;

        setIsTouch(
            "ontouchstart" in window ||
            navigator.maxTouchPoints > 0
        );
    }, []);

    return isTouch;
}

/**
 * Hook for media query matching
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const media = window.matchMedia(query);
        setMatches(media.matches);

        const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
        media.addEventListener("change", listener);

        return () => media.removeEventListener("change", listener);
    }, [query]);

    return matches;
}
