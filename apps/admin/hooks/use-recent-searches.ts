"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "admin-recent-searches";
const MAX_ITEMS = 10;

export function useRecentSearches() {
  const [searches, setSearches] = useState<string[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSearches(JSON.parse(stored));
    } catch {
      // Ignore parse errors
    }
  }, []);

  const persist = useCallback((items: string[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const addSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setSearches((prev) => {
        const filtered = prev.filter((s) => s !== trimmed);
        const next = [trimmed, ...filtered].slice(0, MAX_ITEMS);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const removeSearch = useCallback(
    (query: string) => {
      setSearches((prev) => {
        const next = prev.filter((s) => s !== query);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearAll = useCallback(() => {
    setSearches([]);
    persist([]);
  }, [persist]);

  return { searches, addSearch, removeSearch, clearAll };
}
