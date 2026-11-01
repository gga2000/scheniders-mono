"use client";

import { useCallback, useSyncExternalStore } from "react";

// Same-tab writes don't fire `storage`, so toggles notify their readers here.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onChange);
    };
}

/**
 * A per-device on/off preference kept in localStorage under `key`.
 *
 * Off on the server and during hydration (so the markup matches), then the
 * stored value once mounted.
 */
export function usePersistedToggle(key: string): [boolean, () => void] {
    const value = useSyncExternalStore(
        subscribe,
        () => localStorage.getItem(key) === "true",
        () => false,
    );
    const toggle = useCallback(() => {
        localStorage.setItem(key, String(localStorage.getItem(key) !== "true"));
        listeners.forEach((l) => l());
    }, [key]);
    return [value, toggle];
}
