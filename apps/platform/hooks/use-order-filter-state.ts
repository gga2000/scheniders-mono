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
 * Stages:
 *   1. a default seed, which is never fetched (see `filtersSettled`);
 *   2. replacement by the saved filter once `userId` resolves, so the filter
 *      follows the merchant across devices;
 *   3. write-back on every change, once the user is known.
 */
export function useOrderFilterState() {
    const { getPreference, setPreference, userId } = useUserPreferences();
    const hasLoadedUserPrefs = useRef(false);

    // Seed with defaults, not with a cached copy. The query that loads orders
    // waits for `filtersSettled`, so the seed is never fetched and never shown;
    // what it used to be — localStorage under an "anonymous" key — was written by
    // any filter change made before auth resolved (a dashboard `?status=` link),
    // and its dates never moved again. Merchants opened the app on a window from
    // weeks earlier under an "All Orders" label.
    const [filters, setFiltersState] = useState<OrderFilters>(getDefaultFilters);

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

    // Wrapper to persist filters when they change. Nothing is persisted before
    // the user is known: the write would land under the anonymous key.
    const userIdRef = useRef(userId);
    userIdRef.current = userId;
    const setFilters = useCallback((newFilters: OrderFilters | ((prev: OrderFilters) => OrderFilters)) => {
        setFiltersState(prev => {
            const updated = typeof newFilters === 'function' ? newFilters(prev) : newFilters;
            if (userIdRef.current) {
                // Strip riskLevel from persistence
                const { riskLevel: _riskLevel, ...persistableFilters } = updated;
                setPreference(PREFERENCE_KEYS.ORDER_FILTERS, persistableFilters);
            }
            return updated;
        });
    }, [setPreference]);

    const clearFilters = useCallback(() => setFilters({ status: "all" }), [setFilters]);

    return { filters, setFilters, clearFilters, filtersSettled };
}
