"use client";

import { useSyncExternalStore } from "react";

/**
 * While the orders page reads its first list, side reads (notifications, chat,
 * the guide, settings, stock today) wait, so the list's round trip is not stuck
 * in a crowd. Measured on prod: ~20 requests started in the same second and the
 * first page took ~880 ms; with the side reads held it took ~590 ms and the
 * first cards painted ~0.3 s sooner (project files: platform-audit/lanes/r5-speed-orders.md).
 *
 * Only the orders page raises the hold, so every other page is unchanged. It
 * drops at the first painted list, when the page unmounts, or after
 * HOLD_MAX_MS, so a side read waits at most that long.
 */
export const HOLD_MAX_MS = 3000;

let held = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: boolean) {
    if (held === next) return;
    held = next;
    for (const listener of listeners) listener();
}

/** Raise the hold; the returned function drops it. */
export function raiseFirstLoadHold(): () => void {
    clearTimeout(timer);
    set(true);
    timer = setTimeout(() => set(false), HOLD_MAX_MS);
    return dropFirstLoadHold;
}

export function dropFirstLoadHold(): void {
    clearTimeout(timer);
    timer = undefined;
    set(false);
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** True while side reads should wait. Add `&& !held` to a side query's `enabled`. */
export function useSideReadsHeld(): boolean {
    return useSyncExternalStore(subscribe, () => held, () => false);
}
