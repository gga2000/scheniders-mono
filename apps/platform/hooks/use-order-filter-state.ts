"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUserPreferences, PREFERENCE_KEYS } from "@/hooks/use-user-preferences";
import { useOrderStore } from "@/store/use-order-store";
import { getDefaultFilters } from "@/lib/order-filter-utils";
import type { OrderFilters } from "@/lib/supabase";

/**
 * Ownership of the orders filter STATE, split out from `useOrderFilters`.
 *
 * Why this exists: `useOrderFilters` is fed by the loaded `orders` array, so
 * anything that needs the active filter *before* fetching — namely PERF-1's
 * windowed fetch, which must know the date range to fetch it — was circular.
 * Splitting state from derivation lets `useOrders` resolve the filter first,
 * fetch the matching window, and only then derive lists from what came back.
 *
 * It is also the ARCH-6 audit finding on its own: the filter was seeded from
 * localStorage, replaced from server preferences, and written back, all inside
 * the hook that also derived every list from it.
 *
 * The three stages are preserved exactly, because they are load-bearing:
 *   1. synchronous localStorage seed, so the first paint has the merchant's
 *      last filter rather than a default;
 *   2. asynchronous replacement once `userId` resolves, so the filter follows
 *      them across devices;
 *   3. write-back on every change.
 */
export function useOrderFilterState() {
    const { getPreference, setPreference, userId } = useUserPreferences();
    const hasLoadedUserPrefs = useRef(false);

    const [filters, setFiltersState] = useState<OrderFilters>(() => {
        if (typeof window !== "undefined") {
            try {
                const stored = localStorage.getItem(`schneiders_prefs_anonymous_orderFilters`);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    // Strip riskLevel — it should not persist across sessions
                    delete parsed.riskLevel;
                    return parsed;
                }
            } catch {
                // Fall through to default
            }
        }
        return getDefaultFilters();
    });

    /**
     * True until the server-side preference has had its chance to replace the
     * localStorage seed. A windowed fetch should not treat the seeded filter as
     * final while a different saved filter may still arrive.
     */
    const [filtersSettled, setFiltersSettled] = useState(false);

    const setActiveDateRange = useOrderStore(s => s.setActiveDateRange);

    // Sync local date filters to global store for shared context (e.g. Activity Feed)
    useEffect(() => {
        setActiveDateRange({
            startDate: filters.dateFrom || null,
            endDate: filters.dateTo || null,
        });
    }, [filters.dateFrom, filters.dateTo, setActiveDateRange]);

    // Reload filters when user auth resolves (goes from null to actual userId)
    useEffect(() => {
        if (userId && !hasLoadedUserPrefs.current) {
            const saved = getPreference<OrderFilters>(PREFERENCE_KEYS.ORDER_FILTERS);
            if (saved) {
                delete saved.riskLevel;
                setFiltersState(saved);
            }
            hasLoadedUserPrefs.current = true;
            setFiltersSettled(true);
        } else if (!userId) {
            hasLoadedUserPrefs.current = false;
        }
    }, [userId, getPreference]);

    // Wrapper to persist filters when they change
    const setFilters = useCallback((newFilters: OrderFilters | ((prev: OrderFilters) => OrderFilters)) => {
        setFiltersState(prev => {
            const updated = typeof newFilters === 'function' ? newFilters(prev) : newFilters;
            // Strip riskLevel from persistence
            const { riskLevel: _riskLevel, ...persistableFilters } = updated;
            setPreference(PREFERENCE_KEYS.ORDER_FILTERS, persistableFilters);
            return updated;
        });
    }, [setPreference]);

    const clearFilters = useCallback(() => setFilters({ status: "all" }), [setFilters]);

    return { filters, setFilters, clearFilters, filtersSettled };
}
