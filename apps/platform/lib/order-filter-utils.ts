"use client";

import { normalizePhoneForSearch } from "@/lib/order-utils";
import { Order, OrderFilters, FilterPreset } from "@/lib/supabase";

/**
 * Order Filtering Utilities
 * 
 * Pure functions for filtering, sorting, and managing order filter presets.
 * Extracted from use-orders.ts for better organization and testability.
 */

// =============================================
// PHONE NORMALIZATION
// =============================================

// Phone normalization lives in lib/order-utils and is kept in lockstep with the
// SQL `normalize_phone_for_search` via lib/__fixtures__/phone-normalization.json.
// This module used to carry its own copy under the same name, which normalized
// differently — it left Arabic-Indic digits and separators such as "." intact —
// so a phone typed into the search box was matched by different rules than the
// ones used for duplicate detection and the database index.
export { normalizePhoneForSearch };


/**
 * Whether one order matches a free-text search query.
 *
 * MOB-2: the mobile screen had its own search — a plain `includes()` over a
 * concatenated string — so a phone typed with spaces, or an Arabic name spelled
 * with a different alef, found nothing there while the same query worked on
 * desktop. Both now call this.
 *
 * `orders` is needed only to resolve a return order's parent by UUID so a search
 * for the parent's human-readable number also finds the return.
 */
export function orderMatchesSearch(
    order: Order,
    rawQuery: string,
    orders: readonly Order[] = [],
): boolean {
    const query = normalizeArabicText(rawQuery);
    const queryLower = rawQuery.toLowerCase().trim();

    // An all-punctuation query normalizes to nothing; matching everything then
    // would be worse than matching nothing.
    if (!query && !queryLower) return true;

    const normalizedName = order.customer_name ? normalizeArabicText(order.customer_name) : "";
    if (query && normalizedName && normalizedName.includes(query)) return true;

    const normalizedPhoneQuery = normalizePhoneForSearch(rawQuery);
    if (order.phone && normalizedPhoneQuery && normalizePhoneForSearch(order.phone).includes(normalizedPhoneQuery)) return true;
    if (order.secondary_phone && normalizedPhoneQuery && normalizePhoneForSearch(order.secondary_phone).includes(normalizedPhoneQuery)) return true;

    if (order.order_id?.toLowerCase().includes(queryLower)) return true;
    if (order.delivery_order_id?.toLowerCase().includes(queryLower)) return true;

    const normalizedCity = order.city ? normalizeArabicText(order.city) : "";
    if (query && normalizedCity && normalizedCity.includes(query)) return true;

    const normalizedAddress = order.address_details ? normalizeArabicText(order.address_details) : "";
    if (query && normalizedAddress && normalizedAddress.includes(query)) return true;

    const normalizedNotes = order.notes ? normalizeArabicText(order.notes) : "";
    if (query && normalizedNotes && normalizedNotes.includes(query)) return true;

    if (order.sequence_number && String(order.sequence_number).includes(queryLower)) return true;

    if (order.original_order_id) {
        if (order.original_order_id.toLowerCase().includes(queryLower)) return true;
        const parentOrder = orders.find(o => o.id === order.original_order_id);
        if (parentOrder?.order_id?.toLowerCase().includes(queryLower)) return true;
    }

    return false;
}

/**
 * Normalize Arabic text for fuzzy search:
 * - Remove diacritics (tashkeel)
 * - Normalize alef variants (أ إ آ) → ا
 * - Normalize teh marbuta (ة) → ه
 * - Normalize final yeh/alef maqsura (ى ى) → ي
 */
export function normalizeArabicText(text: string): string {
    if (!text) return "";
    return text
        .replace(/[\u064B-\u065F\u0670]/g, "") // strip tashkeel/diacritics
        .replace(/[\u0622\u0623\u0625]/g, "\u0627") // normalize alef variants to plain alef
        .replace(/\u0629/g, "\u0647") // teh marbuta → ha
        .replace(/\u0649/g, "\u064A") // alef maqsura → ya
        .toLowerCase()
        .trim();
}

// =============================================
// ORDER FILTERING
// =============================================

/**
 * Apply filters to an array of orders
 * This is a pure function that can be used anywhere
 */
export function applyOrderFilters(
    orders: Order[],
    filters: OrderFilters
): Order[] {
    return orders.filter((order) => {
        // Status filter
        const statusFilter = filters.status as string;
        if (statusFilter && statusFilter !== "all") {
            // Special handling for "needs_review" filter
            if (statusFilter === "needs_review") {
                const needsReview = checkIfOrderNeedsReview(order);
                if (!needsReview) return false;
            } else if (order.status !== statusFilter) {
                return false;
            }
        }

        // Date range filter
        if (filters.dateFrom) {
            const orderDate = new Date(order.created_at);
            const fromDate = new Date(filters.dateFrom);
            fromDate.setHours(0, 0, 0, 0);
            if (orderDate < fromDate) return false;
        }
        if (filters.dateTo) {
            const orderDate = new Date(order.created_at);
            const toDate = new Date(filters.dateTo);
            toDate.setHours(23, 59, 59, 999);
            if (orderDate > toDate) return false;
        }

        // City filter
        if (filters.city && order.city !== filters.city) {
            return false;
        }

        // Product filter
        if (filters.product) {
            const hasProduct = order.items?.some((item) =>
                item.name.toLowerCase().includes(filters.product!.toLowerCase())
            );
            if (!hasProduct) return false;
        }

        // Priority filter
        if (filters.priority && order.priority !== filters.priority) {
            return false;
        }

        // Payment status filter
        if (filters.paymentStatus && order.payment_status !== filters.paymentStatus) {
            return false;
        }

        // Return orders filter
        if (filters.isReturn !== undefined && order.is_return !== filters.isReturn) {
            return false;
        }

        // Search query
        if (filters.searchQuery) {
            // Shared with the mobile screen so the two cannot drift again.
            if (!orderMatchesSearch(order, filters.searchQuery, orders)) return false;
        }

        return true;
    });
}

/**
 * Check if an order needs manual review
 */
export function checkIfOrderNeedsReview(order: Order): boolean {
    // Has warning flags in notes
    if (order.notes && order.notes.includes("⚠️")) return true;

    // Empty items and not a manual order
    if (
        (!order.items || order.items.length === 0) &&
        order.customer_name !== "Manual Order"
    ) {
        return true;
    }

    // Placeholder customer name
    if (
        order.customer_name?.startsWith("Customer ") &&
        order.customer_name !== "Customer"
    ) {
        return true;
    }

    return false;
}

/**
 * Sort orders with pinned orders first, then by date descending
 */
export function sortOrders(orders: Order[]): Order[] {
    return [...orders].sort((a, b) => {
        // Pinned orders always come first
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        // Then sort by date descending (newest first)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

/**
 * Calculate status counts for a set of orders
 */
export function calculateStatusCounts(orders: Order[]): Record<string, number> {
    const counts: Record<string, number> = {
        all: orders.length,
        new: 0,
        contacted: 0,
        confirmed: 0,
        in_transit: 0,
        delivered: 0,
        completed: 0,
        rejected: 0,
        no_response: 0,
        return_pending: 0,
        suspended: 0,
    };

    orders.forEach((order) => {
        if (counts[order.status] !== undefined) {
            counts[order.status]++;
        }
    });

    return counts;
}

// =============================================
// FILTER PRESETS
// =============================================

const FILTER_PRESETS_KEY = "order_filter_presets";

/**
 * Load filter presets from localStorage
 */
export function loadFilterPresetsFromStorage(): FilterPreset[] {
    try {
        const saved = localStorage.getItem(FILTER_PRESETS_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (err) {
        console.error("Error loading filter presets:", err);
    }
    return [];
}

/**
 * Save filter presets to localStorage
 */
export function saveFilterPresetsToStorage(presets: FilterPreset[]): void {
    localStorage.setItem(FILTER_PRESETS_KEY, JSON.stringify(presets));
}

/**
 * Create a new filter preset
 */
export function createFilterPreset(
    name: string,
    filters: OrderFilters,
    page: string = "orders"
): FilterPreset {
    return {
        id: crypto.randomUUID(),
        name,
        filters,
        page,
        created_at: new Date().toISOString(),
    };
}

// =============================================
// AVAILABLE OPTIONS EXTRACTORS
// =============================================

/**
 * Get unique cities from orders
 */
export function getAvailableCities(orders: Order[]): string[] {
    return [...new Set(orders.map((o) => o.city).filter(Boolean))] as string[];
}

/**
 * Get unique products from orders
 */
export function getAvailableProducts(orders: Order[]): string[] {
    return [
        ...new Set(
            orders.flatMap((o) => o.items?.map((i) => i.name) || []).filter(Boolean)
        ),
    ] as string[];
}

// =============================================
// DATE UTILITIES
// =============================================

/**
 * Get today's date in YYYY-MM-DD format using LOCAL timezone
 * Note: toISOString() converts to UTC which causes issues for users in positive
 * UTC offset timezones (like Iraq UTC+3) after local midnight but before UTC midnight
 */
export function getLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Get default filters (today's orders)
 */
export function getDefaultFilters(): OrderFilters {
    const today = getLocalDateString();
    return {
        status: "all",
        dateFrom: today,
        dateTo: today,
    };
}
