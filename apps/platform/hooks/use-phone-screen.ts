"use client";

import { useSyncExternalStore } from "react";
import { isPhoneScreen } from "@/lib/computer-sign-in";

function subscribe(onChange: () => void): () => void {
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    return () => {
        window.removeEventListener("resize", onChange);
        window.removeEventListener("orientationchange", onChange);
    };
}

function phoneSnapshot(): boolean {
    return isPhoneScreen(window.screen.width, window.screen.height);
}

/**
 * Whether this device is a phone, by its screen (not the window): the shorter
 * side under 600 CSS px. A phone turned sideways stays a phone; an iPad, or a
 * computer with a narrow window, is not one. Null on the server and in the
 * first client render, before the screen is known.
 */
export function usePhoneScreen(): boolean | null {
    return useSyncExternalStore<boolean | null>(subscribe, phoneSnapshot, () => null);
}

function wideSnapshot(): boolean {
    return window.matchMedia("(min-width: 1024px)").matches;
}

/** Whether the window is at least Tailwind's `lg` (1024px) wide. Null on the server. */
export function useLgWindow(): boolean | null {
    return useSyncExternalStore<boolean | null>(subscribe, wideSnapshot, () => null);
}
