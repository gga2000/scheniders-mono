/**
 * Application constants
 * 
 * Centralized location for magic numbers and configuration values.
 * Previously these were scattered throughout the codebase.
 */

// ==============================================
// TIMING CONSTANTS
// ==============================================

/** Realtime refetch delay after receiving a subscription event (ms) */
export const REALTIME_REFETCH_DELAY_MS = 120000; // 2 minutes

/** Polling interval for fallback order fetching (ms) */
export const ORDER_POLLING_INTERVAL_MS = 120000; // 2 minutes

/** Activity logger session cache duration (ms) */
export const SESSION_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// ==============================================
// MATCHING THRESHOLDS
// ==============================================

/** Minimum character ratio for product name matching (0-1) */
export const PRODUCT_MATCH_RATIO_THRESHOLD = 0.8;

/** Minimum product name length for fuzzy matching */
export const PRODUCT_MIN_CHARS_FOR_MATCH = 4;

// ==============================================
// UI CONSTANTS
// ==============================================

/** Default number of orders to show per page */
export const DEFAULT_PAGE_SIZE = 50;

/** Maximum number of items to show in analytics charts */
export const MAX_CHART_ITEMS = 10;

// ==============================================
// ORDER SOURCE CODES
// ==============================================

/** Order source code prefixes for order ID generation */
export const ORDER_SOURCE_CODES = {
    lightfunnels: "L",
    website: "W",
    manual: "M",
    other: "O",
} as const;

export type OrderSourceCode = typeof ORDER_SOURCE_CODES[keyof typeof ORDER_SOURCE_CODES];

// ==============================================
// STATUS COLORS (CSS class suffixes)
// ==============================================

export const STATUS_COLORS = {
    new: "yellow",
    contacted: "blue",
    confirmed: "green",
    cancelled: "gray",
    in_transit: "indigo",
    delivered: "emerald",
    rejected: "red",
    completed: "teal",
    no_response: "orange",
    return_pending: "pink",
    refund_delivered: "emerald",
    refund_failed: "red",
    pending_checkout: "purple",
    suspended: "orange",
} as const;
