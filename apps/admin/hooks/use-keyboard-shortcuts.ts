"use client";

import { useEffect, useCallback, useRef } from "react";

interface ShortcutConfig {
  key: string;
  meta?: boolean;  // Cmd on Mac, Ctrl on Windows
  shift?: boolean;
  handler: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      // Exception: Escape should always work
      if (e.key !== "Escape") return;
    }

    for (const shortcut of shortcutsRef.current) {
      if (shortcut.enabled === false) continue;

      const metaMatch = shortcut.meta
        ? e.metaKey || e.ctrlKey
        : !e.metaKey && !e.ctrlKey;
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

      if (metaMatch && shiftMatch && keyMatch) {
        e.preventDefault();
        e.stopPropagation();
        shortcut.handler();
        return;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
