"use client";

import { useCallback, useSyncExternalStore } from "react";

/*
 * The bell's "Mark all read", kept per staff member in this browser. It lived
 * in component state, so every page load counted the 20 newest steps as new
 * again and the badge never went out. One time is kept: every step at or
 * before it is read. Other tabs follow through the storage event.
 */

const PREFIX = "adminBellReadUpTo:";

/**
 * The stored time, or null. localStorage can refuse to be read (blocked
 * storage, some private windows); the bell then counts every step as new, as
 * for someone who never marked them.
 */
export function readMark(storage: Pick<Storage, "getItem">, userId: string): string | null {
  try {
    const at = storage.getItem(PREFIX + userId);
    return at !== null && !Number.isNaN(Date.parse(at)) ? at : null;
  } catch {
    return null;
  }
}

/** Keeps the later of the stored time and `at`, so a stale tab cannot move it back. */
export function writeMark(storage: Pick<Storage, "getItem" | "setItem">, userId: string, at: string): void {
  const stored = readMark(storage, userId);
  if (stored !== null && Date.parse(stored) >= Date.parse(at)) return;
  try {
    storage.setItem(PREFIX + userId, at);
  } catch {
    // Storage refused: the mark lasts until the page is left, as before.
  }
}

/** Whether a step is new to the person: after their mark, or any step when there is none. */
export function isNewStep(createdAt: string, readUpTo: string | null): boolean {
  return readUpTo === null || Date.parse(createdAt) > Date.parse(readUpTo);
}

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useBellReadMark(userId: string | null) {
  // The server has no browser storage: its page shows every step as new, then the browser reads the mark.
  const readUpTo = useSyncExternalStore(
    subscribe,
    () => (userId ? readMark(localStorage, userId) : null),
    () => null,
  );
  const markReadUpTo = useCallback(
    (at: string) => {
      if (!userId) return;
      writeMark(localStorage, userId, at);
      listeners.forEach((listener) => listener());
    },
    [userId],
  );
  return { readUpTo, markReadUpTo };
}
