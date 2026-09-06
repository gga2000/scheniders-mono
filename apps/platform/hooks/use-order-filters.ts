"use client";

import { useState, useMemo, useCallback, useDeferredValue, useRef, useLayoutEffect } from "react";
import type { Order, OrderFilters, FilterPreset } from "@/lib/supabase";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import {
    loadFilterPresetsFromStorage,
    saveFilterPresetsToStorage,
    createFilterPreset,
} from "@/lib/order-filter-utils";

// Normalize Arabic text for fuzzy search:
// - Remove diacritics (tashkeel)
// - Normalize alef variants (أ إ آ) → ا
// - Normalize teh marbuta (ة) → ه
// - Normalize final yeh/alef maqsura (ى ى) → ي
function normalizeArabicText(text: string): string {
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
// ORDER FILTERS HOOK
// Manages filter state, presets, persistence,
// and derived filtered/sorted order lists.
// =============================================

interface UseOrderFiltersOptions {
    /** Filter state is owned by useOrderFilterState so the fetch can read it first. */
    filters: OrderFilters;
    setFilters: (f: OrderFilters | ((prev: OrderFilters) => OrderFilters)) => void;
    clearFilters: () => void;
    orders: Order[];
    archivedOrders: Order[];
}

export function useOrderFilters({ orders, archivedOrders, filters, setFilters, clearFilters }: UseOrderFiltersOptions) {

    const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => {
        if (typeof window !== "undefined") {
            return loadFilterPresetsFromStorage();
        }
        return [];
    });

    const deferredOrders = useDeferredValue(orders);
    const deferredArchivedOrders = useDeferredValue(archivedOrders);
    const deferredFilters = useDeferredValue(filters);

    // =============================================
    // FILTER APPLICATION
    // =============================================

    const applyFilters = useCallback(
        (ordersToFilter: Order[], activeFilters: OrderFilters = filters): Order[] => {
            return ordersToFilter.filter((order) => {
                // Status filter
                const statusFilter = activeFilters.status as string;
                if (statusFilter && statusFilter !== "all") {
                    if (statusFilter === "needs_review") {
                        if (order.notes && order.notes.includes('⚠️')) {
                            // This order needs review
                        } else if ((!order.items || order.items.length === 0) && order.customer_name !== 'Manual Order') {
                            // Empty items and not a manual order
                        } else if (order.customer_name?.startsWith('Customer ') && order.customer_name !== 'Customer') {
                            // Placeholder customer name
                        } else {
                            return false;
                        }
                    } else if (statusFilter === "refunds") {
                        // All return transactions (RTN), at any point in their lifecycle.
                        if (!order.is_return) return false;
                    } else if (statusFilter === "refunded") {
                        if ((order.refund_status || "none") !== "refunded") return false;
                    } else if (statusFilter === "refund_pending") {
                        if ((order.refund_status || "none") !== "pending") return false;
                    } else if (statusFilter === "replacements") {
                        if (!(order.is_replacement || order.order_id?.startsWith("RPL-"))) return false;
                    } else if (statusFilter === "completed") {
                        // Completed tab shows genuine sales only; refunds and replacements
                        // live in their own tabs.
                        const rs = order.refund_status || "none";
                        const isReplacement = order.is_replacement || (order.order_id?.startsWith("RPL-") ?? false);
                        if (order.status !== "completed" || rs === "refunded" || rs === "pending" || isReplacement) return false;
                    } else if (statusFilter === "confirmed") {
                        // Include both confirmed orders AND return_pending orders (refund/replacement orders)
                        if (order.status !== "confirmed" && order.status !== "return_pending") {
                            return false;
                        }
                    } else if (order.status !== statusFilter) {
                        return false;
                    }
                }

                // Order-type sub-filter (refund / replacement) — narrows the
                // Confirmed & All tabs to return or replacement orders.
                const orderTypeFilter = (activeFilters as { orderType?: 'refund' | 'replacement' }).orderType;
                if (orderTypeFilter === "refund") {
                    if (!order.is_return) return false;
                } else if (orderTypeFilter === "replacement") {
                    const isReplacement = order.is_replacement || (order.order_id?.startsWith("RPL-") ?? false);
                    if (!isReplacement) return false;
                }

                // Date range filter
                if (activeFilters.dateFrom) {
                    const orderDate = new Date(order.created_at);
                    const fromDate = new Date(activeFilters.dateFrom);
                    fromDate.setHours(0, 0, 0, 0);
                    if (orderDate < fromDate) return false;
                }
                if (activeFilters.dateTo) {
                    const orderDate = new Date(order.created_at);
                    const toDate = new Date(activeFilters.dateTo);
                    toDate.setHours(23, 59, 59, 999);
                    if (orderDate > toDate) return false;
                }

                // City filter
                if (activeFilters.city && order.city !== activeFilters.city) {
                    return false;
                }

                // Product filter
                if (activeFilters.product) {
                    const hasProduct = order.items?.some((item) =>
                        item.name.toLowerCase().includes(activeFilters.product!.toLowerCase())
                    );
                    if (!hasProduct) return false;
                }

                // Priority filter
                if (activeFilters.priority && order.priority !== activeFilters.priority) {
                    return false;
                }

                // Payment status filter
                if (activeFilters.paymentStatus && order.payment_status !== activeFilters.paymentStatus) {
                    return false;
                }

                // Return orders filter
                if (activeFilters.isReturn !== undefined && order.is_return !== activeFilters.isReturn) {
                    return false;
                }

                // Search query
                if (activeFilters.searchQuery) {
                    const rawQuery = activeFilters.searchQuery;
                    const query = normalizeArabicText(rawQuery);
                    const queryLower = rawQuery.toLowerCase().trim();

                    // If normalization results in empty string, don't match everything
                    if (!query && !queryLower) return true;

                    // Name: normalize Arabic for fuzzy matching
                    const normalizedName = order.customer_name ? normalizeArabicText(order.customer_name) : "";
                    const matchesName = query && normalizedName ? normalizedName.includes(query) : false;

                    const normalizedPhoneQuery = normalizePhoneForSearch(rawQuery);
                    const matchesPhone = order.phone && normalizedPhoneQuery ? normalizePhoneForSearch(order.phone).includes(normalizedPhoneQuery) : false;
                    const matchesSecondaryPhone = order.secondary_phone && normalizedPhoneQuery ? normalizePhoneForSearch(order.secondary_phone).includes(normalizedPhoneQuery) : false;

                    const matchesOrderId = order.order_id?.toLowerCase().includes(queryLower) ?? false;
                    const matchesDeliveryId = order.delivery_order_id?.toLowerCase().includes(queryLower) ?? false;

                    const normalizedCity = order.city ? normalizeArabicText(order.city) : "";
                    const matchesCity = query && normalizedCity ? normalizedCity.includes(query) : false;

                    const normalizedAddress = order.address_details ? normalizeArabicText(order.address_details) : "";
                    const matchesAddress = query && normalizedAddress ? normalizedAddress.includes(query) : false;

                    const normalizedNotes = order.notes ? normalizeArabicText(order.notes) : "";
                    const matchesNotes = query && normalizedNotes ? normalizedNotes.includes(query) : false;

                    const matchesSequence = order.sequence_number ? String(order.sequence_number).includes(queryLower) : false;

                    let matchesOriginalOrderId = false;
                    if (order.original_order_id) {
                        if (order.original_order_id.toLowerCase().includes(queryLower)) {
                            matchesOriginalOrderId = true;
                        } else {
                            const parentOrder = ordersToFilter.find(o => o.id === order.original_order_id);
                            if (parentOrder && parentOrder.order_id?.toLowerCase().includes(queryLower)) {
                                matchesOriginalOrderId = true;
                            }
                        }
                    }

                    const isMatch = matchesName || matchesPhone || matchesSecondaryPhone || matchesOrderId ||
                        matchesDeliveryId || matchesCity || matchesAddress || matchesNotes ||
                        matchesSequence || matchesOriginalOrderId;

                    return isMatch;
                }

                return true;
            });
        },
        [filters]
    );

    // =============================================
    // DERIVED COMPUTATIONS
    // =============================================

    const filteredOrders = useMemo(() => {
        const ordersToFilter = (deferredFilters.searchQuery && deferredFilters.searchIncludesArchive)
            ? [...deferredOrders, ...deferredArchivedOrders]
            : deferredOrders;

        const filtered = applyFilters(ordersToFilter, deferredFilters);

        // Parsing `created_at` inside the comparator allocated two Date objects
        // per comparison — on a few thousand orders that is tens of thousands of
        // allocations for every filter change. Resolve each timestamp once.
        const createdAtMs = new Map<string, number>();
        for (const order of filtered) {
            const parsed = Date.parse(order.created_at);
            createdAtMs.set(order.id, Number.isNaN(parsed) ? 0 : parsed);
        }

        return filtered.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return (createdAtMs.get(b.id) ?? 0) - (createdAtMs.get(a.id) ?? 0);
        });
    }, [deferredOrders, deferredArchivedOrders, deferredFilters, applyFilters]);

    const statusCounts = useMemo(() => {
        const filtersWithoutStatus = { ...deferredFilters, status: 'all' as const };
        const matchingOrders = applyFilters(deferredOrders, filtersWithoutStatus);

        const counts: Record<string, number> = {
            all: matchingOrders.length,
            new: 0,
            contacted: 0,
            confirmed: 0,
            cancelled: 0,
            in_transit: 0,
            delivered: 0,
            completed: 0,
            rejected: 0,
            no_response: 0,
            return_pending: 0,
            refund_delivered: 0,
            refund_failed: 0,
            refunds: 0,
            pending_checkout: 0,
            suspended: 0,
        };

        matchingOrders.forEach(order => {
            if (order.status in counts) {
                counts[order.status]++;
            }
            // Unified refunds count: return_pending + refund_delivered + refund_failed
            if (["return_pending", "refund_delivered", "refund_failed"].includes(order.status)) {
                counts.refunds++;
            }
            // Include return_pending orders in confirmed count (refund/replacement orders)
            if (order.status === "return_pending") {
                counts.confirmed++;
            }
        });


        return counts;
    }, [deferredOrders, deferredFilters, applyFilters]);

    const availableCities = useMemo(() => {
        return [...new Set(deferredOrders.map((o) => o.city).filter(Boolean))] as string[];
    }, [deferredOrders]);

    const availableProducts = useMemo(() => {
        return [...new Set(deferredOrders.flatMap((o) => o.items?.map((i) => i.name) || []).filter(Boolean))] as string[];
    }, [deferredOrders]);

    // Products present in the orders matching the CURRENT view (every active
    // filter except the product filter itself — so picking a product doesn't
    // collapse the suggestion row to a single chip). Mirrors `statusCounts`.
    // Count = number of visible orders containing that product.
    const availableProductsInView = useMemo(() => {
        const filtersWithoutProduct = { ...deferredFilters, product: undefined };
        const matchingOrders = applyFilters(deferredOrders, filtersWithoutProduct);

        const counts = new Map<string, number>();
        for (const order of matchingOrders) {
            // De-dupe per order so an order with the same product twice counts once.
            const namesInOrder = new Set(
                (order.items ?? []).map((i) => i.name).filter(Boolean) as string[]
            );
            for (const name of namesInOrder) {
                counts.set(name, (counts.get(name) ?? 0) + 1);
            }
        }

        return [...counts.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }, [deferredOrders, deferredFilters, applyFilters]);

    // =============================================
    // PRESET OPERATIONS
    // =============================================

    function saveFilterPreset(name: string) {
        const preset = createFilterPreset(name, filters, "orders");
        const updated = [...filterPresets, preset];
        setFilterPresets(updated);
        saveFilterPresetsToStorage(updated);
        return preset;
    }

    function loadFilterPreset(presetId: string) {
        const preset = filterPresets.find((p) => p.id === presetId);
        if (preset) {
            setFilters(preset.filters);
        }
    }

    function deleteFilterPreset(presetId: string) {
        const updated = filterPresets.filter((p) => p.id !== presetId);
        setFilterPresets(updated);
        saveFilterPresetsToStorage(updated);
    }


    const latestFn = {
        setFilters,
        clearFilters,
        saveFilterPreset,
        loadFilterPreset,
        deleteFilterPreset,
    };

    const apiRef = useRef(latestFn);

    useLayoutEffect(() => {
        apiRef.current = latestFn;
    });

    const stableAPI = useMemo(() => {
        const proxy: Record<string, unknown> = {};
        for (const key in latestFn) {
            proxy[key as keyof typeof latestFn] = (...args: unknown[]) => {
                // @ts-expect-error dynamic wrapper
                return apiRef.current[key as keyof typeof latestFn](...args);
            };
        }
        return proxy as typeof latestFn;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        filters,
        filterPresets,
        filteredOrders,
        statusCounts,
        availableCities,
        availableProducts,
        availableProductsInView,
        ...stableAPI,
    };
}
