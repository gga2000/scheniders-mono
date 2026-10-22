"use client";

import { useSyncExternalStore } from "react";
import { diag } from "@/lib/diag";

// The desktop sidebar's collapsed preference, kept in localStorage.
//
// It used to be read in a useState initializer, so the server (no
// localStorage: collapsed) and the browser's first render (the saved value)
// disagreed. React does not patch attributes after a hydration mismatch, so a
// merchant who keeps the sidebar open got rows still styled as collapsed
// (icon and label stacked, tooltips on) under an expanded sidebar.
//
// useSyncExternalStore renders the server value during hydration and the saved
// value right after, and keeps tabs in sync through the storage event.

const STORAGE_KEY = "sidebarCollapsed";
/** What the server renders, and what a device with no saved preference gets. */
const DEFAULT_COLLAPSED = true;

const listeners = new Set<() => void>();
/** Set when storage cannot be written (blocked, quota): the preference then lives for the page's lifetime. */
let memoryValue: boolean | null = null;

function read(): boolean {
    if (memoryValue !== null) return memoryValue;
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved === null ? DEFAULT_COLLAPSED : saved !== "false";
    } catch (err) {
        diag.warn("[Sidebar] localStorage unreadable — using the default", err);
        return DEFAULT_COLLAPSED;
    }
}

function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    const onStorage = (e: StorageEvent) => {
        if (e.key === STORAGE_KEY) onChange();
    };
    window.addEventListener("storage", onStorage);
    return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onStorage);
    };
}

export function setSidebarCollapsed(collapsed: boolean): void {
    try {
        localStorage.setItem(STORAGE_KEY, String(collapsed));
        memoryValue = null;
    } catch (err) {
        diag.warn("[Sidebar] localStorage unwritable — keeping the preference for this page only", err);
        memoryValue = collapsed;
    }
    for (const listener of listeners) listener();
}

export function useSidebarCollapsed(): boolean {
    return useSyncExternalStore(subscribe, read, () => DEFAULT_COLLAPSED);
}

const noopSubscribe = () => () => {};

/**
 * False while React hydrates server HTML, true from the render after it (and
 * on every client-side mount). A component keyed on it is mounted afresh once
 * hydration's values are replaced by the browser's — with `initial={false}`
 * motion components, that applies the saved state instantly instead of
 * animating to it on every page load.
 */
export function useHydrated(): boolean {
    return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
