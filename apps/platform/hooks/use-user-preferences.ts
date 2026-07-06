"use client";

import { useCallback, useRef } from "react";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * User Preferences Hook
 * 
 * Provides user-scoped localStorage persistence for app preferences.
 * Each user's preferences are stored under a unique key based on their user ID.
 * Falls back to 'anonymous' for non-authenticated users.
 * 
 * Usage:
 * const { getPreference, setPreference, clearPreference } = useUserPreferences();
 * const filters = getPreference<OrderFilters>('orderFilters');
 * setPreference('orderFilters', newFilters);
 */

const STORAGE_PREFIX = "schneiders_prefs";

// Debounce timer refs stored outside hook to persist across renders
const debounceTimers: Record<string, NodeJS.Timeout> = {};

export function useUserPreferences() {
    const { user } = useAuth();

    // Create user-scoped storage key
    const getUserKey = useCallback((namespace: string): string => {
        const userId = user?.id ?? "anonymous";
        return `${STORAGE_PREFIX}_${userId}_${namespace}`;
    }, [user?.id]);

    /**
     * Get a preference from localStorage
     * Returns null if not found or on error
     */
    const getPreference = useCallback(<T>(namespace: string): T | null => {
        if (typeof window === "undefined") return null;

        try {
            const key = getUserKey(namespace);
            const stored = localStorage.getItem(key);
            if (!stored) return null;
            return JSON.parse(stored) as T;
        } catch (error) {
            console.warn(`[UserPreferences] Failed to load ${namespace}:`, error);
            return null;
        }
    }, [getUserKey]);

    /**
     * Set a preference in localStorage
     * Debounced to avoid excessive writes during rapid changes
     */
    const setPreference = useCallback(<T>(namespace: string, value: T, debounceMs: number = 300): void => {
        if (typeof window === "undefined") return;

        const key = getUserKey(namespace);

        // Clear existing debounce timer for this key
        if (debounceTimers[key]) {
            clearTimeout(debounceTimers[key]);
        }

        // Debounce the save
        debounceTimers[key] = setTimeout(() => {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (error) {
                console.warn(`[UserPreferences] Failed to save ${namespace}:`, error);
            }
            delete debounceTimers[key];
        }, debounceMs);
    }, [getUserKey]);

    /**
     * Clear a specific preference
     */
    const clearPreference = useCallback((namespace: string): void => {
        if (typeof window === "undefined") return;

        try {
            const key = getUserKey(namespace);
            localStorage.removeItem(key);
        } catch (error) {
            console.warn(`[UserPreferences] Failed to clear ${namespace}:`, error);
        }
    }, [getUserKey]);

    /**
     * Clear all preferences for the current user
     */
    const clearAllPreferences = useCallback((): void => {
        if (typeof window === "undefined") return;

        const userId = user?.id ?? "anonymous";
        const prefix = `${STORAGE_PREFIX}_${userId}_`;

        try {
            // Find and remove all keys with our prefix
            const keysToRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith(prefix)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch (error) {
            console.warn("[UserPreferences] Failed to clear all preferences:", error);
        }
    }, [user?.id]);

    return {
        getPreference,
        setPreference,
        clearPreference,
        clearAllPreferences,
        userId: user?.id ?? null, // Expose for dependency tracking
    };
}

// Export namespace constants for consistency
export const PREFERENCE_KEYS = {
    ORDER_FILTERS: "orderFilters",
    VIEW_MODE: "viewMode",
    WORKFLOW_MODE: "workflowMode",
    COMPACT_VIEW: "compactView",
    ANALYTICS_LEVEL: "analyticsLevel",
    SHOW_SEARCH_BAR: "showSearchBar",
    ORDER_PIPELINE: "orderPipelineLayout",
    /** Store-builder Simple ⇄ Advanced mode ("simple" | "advanced"). */
    EDITOR_MODE: "editorMode",
    /** One-time "what is Advanced mode" intro popover dismissed. */
    EDITOR_MODE_INTRO_SEEN: "editorModeIntroSeen",
} as const;
