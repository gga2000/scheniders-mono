export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;

/**
 * Standardized caching presets for React Query.
 * Use these across the application instead of hardcoded math values (e.g., `5 * 60 * 1000`).
 */
export const CACHE_PRESETS = {
    /**
     * Data that changes extremely often and needs to be fresh.
     * staleTime: 0 means it refetches immediately on window focus or remount.
     */
    REALTIME: {
        staleTime: 0,
        gcTime: 5 * MINUTE
    },

    /**
     * Data that changes frequently but doesn't need second-to-second accuracy.
     * e.g., Live Orders dashboard.
     */
    FREQUENT: {
        staleTime: 2 * MINUTE,
        gcTime: 10 * MINUTE
    },

    /**
     * General application data that changes occasionally.
     * e.g., Products List, Customer Details.
     */
    STANDARD: {
        staleTime: 5 * MINUTE,
        gcTime: 15 * MINUTE
    },

    /**
     * Data that rarely changes within a user's session.
     * e.g., Archived past orders, configuration settings.
     */
    STATIC: {
        staleTime: 30 * MINUTE,
        gcTime: 2 * HOUR
    },

    /**
     * Long lists where we want to keep older pages cached for smooth back-navigation.
     * e.g., Paginated customer views.
     */
    PAGINATION: {
        staleTime: 15 * MINUTE,
        gcTime: 30 * MINUTE
    }
} as const;
