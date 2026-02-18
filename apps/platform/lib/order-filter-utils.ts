"use client";

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

/**
 * Normalize phone number for search comparison
 * Removes common Iraqi country codes and leading zeros
 */
export function normalizePhoneForSearch(phone: string): string {
    if (!phone) return "";
    // Remove spaces, dashes, and common prefixes
    return phone
        .replace(/[\s\-\(\)]/g, "")
        .replace(/^(\+964|964|00964|0)/, "");
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
            const query = filters.searchQuery.toLowerCase();
            const matchesName = (order.customer_name || "").toLowerCase().includes(query);
            const matchesPhone = normalizePhoneForSearch(order.phone).includes(
                normalizePhoneForSearch(filters.searchQuery)
            );
            const matchesOrderId = order.order_id?.toLowerCase().includes(query);
            const matchesDeliveryId = order.delivery_order_id?.toLowerCase().includes(query);
            // Also search in original_order_id so return orders show up when searching for the parent
            const matchesOriginalOrderId = order.original_order_id?.toLowerCase().includes(query);

            if (!matchesName && !matchesPhone && !matchesOrderId && !matchesDeliveryId && !matchesOriginalOrderId) {
                return false;
            }
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
