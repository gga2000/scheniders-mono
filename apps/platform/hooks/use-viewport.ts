"use client";

import { useState, useEffect } from "react";

interface ViewportState {
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
    width: number;
}

/**
 * Custom hook to detect viewport size with SSR safety.
 * Breakpoints default to Tailwind's sm (640), md (768), lg (1024).
 */
export function useViewport(
    mobileBreakpoint: number = 768,
    tabletBreakpoint: number = 1024
): ViewportState {
    // Initialize with SSR-safe defaults (assume desktop to avoid mobile view on desktop initially)
    const [viewport, setViewport] = useState<ViewportState>({
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        width: 1024,
    });

    useEffect(() => {
        // Only run on client
        if (typeof window === "undefined") return;

        const handleResize = () => {
            const width = window.innerWidth;
            setViewport({
                isMobile: width < mobileBreakpoint,
                isTablet: width >= mobileBreakpoint && width < tabletBreakpoint,
                isDesktop: width >= tabletBreakpoint,
                width,
            });
        };

        // Initial check
        handleResize();

        // Debounce the resize event slightly for performance
        let timeoutId: NodeJS.Timeout;
        const debouncedResize = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(handleResize, 100);
        };

        window.addEventListener("resize", debouncedResize);

        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener("resize", debouncedResize);
        };
    }, [mobileBreakpoint, tabletBreakpoint]);

    return viewport;
}
