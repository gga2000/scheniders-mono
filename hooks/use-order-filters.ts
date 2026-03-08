"use client";

import { useState, useCallback, useMemo, useEffect, useRef, useDeferredValue, useLayoutEffect } from "react";
import type { Order, OrderFilters, FilterPreset } from "@/lib/supabase";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import {
    getDefaultFilters,
    loadFilterPresetsFromStorage,
    saveFilterPresetsToStorage,
    createFilterPreset,
} from "@/lib/order-filter-utils";
import { useUserPreferences, PREFERENCE_KEYS } from "@/hooks/use-user-preferences";

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
    orders: Order[];
    archivedOrders: Order[];
}

export function useOrderFilters({ orders, archivedOrders }: UseOrderFiltersOptions) {
    const { getPreference, setPreference, userId } = useUserPreferences();
    const hasLoadedUserPrefs = useRef(false);

    // =============================================
    // FILTER STATE
    // =============================================

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
            } catch (e) {
                // Fall through to default
            }
        }
        return getDefaultFilters();
    });

    const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => {
        if (typeof window !== "undefined") {
            return loadFilterPresetsFromStorage();
        }
        return [];
    });

    // Reload filters when user auth resolves (goes from null to actual userId)
    useEffect(() => {
        if (userId && !hasLoadedUserPrefs.current) {
            const saved = getPreference<OrderFilters>(PREFERENCE_KEYS.ORDER_FILTERS);
            if (saved) {
                delete saved.riskLevel;
                setFiltersState(saved);
            }
            hasLoadedUserPrefs.current = true;
        } else if (!userId) {
            hasLoadedUserPrefs.current = false;
        }
    }, [userId, getPreference]);

    // Wrapper to persist filters when they change
    const setFilters = useCallback((newFilters: OrderFilters | ((prev: OrderFilters) => OrderFilters)) => {
        setFiltersState(prev => {
            const updated = typeof newFilters === 'function' ? newFilters(prev) : newFilters;
            // Strip riskLevel from persistence
            const { riskLevel, ...persistableFilters } = updated;
            setPreference(PREFERENCE_KEYS.ORDER_FILTERS, persistableFilters);
            return updated;
        });
    }, [setPreference]);

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
                    } else if (statusFilter === "confirmed" && order.status === "return_pending") {
                        // Allow return_pending to appear in the confirmed tab
                    } else if (order.status !== statusFilter) {
                        return false;
                    }
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

        const result = applyFilters(ordersToFilter, deferredFilters).sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        if (deferredFilters.searchQuery) {
            console.log(`[Search Filter] query="${deferredFilters.searchQuery}" → ${result.length}/${ordersToFilter.length} orders`);
        }

        return result;
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
            pending_checkout: 0,
            suspended: 0,
        };

        matchingOrders.forEach(order => {
            if (order.status in counts) {
                counts[order.status]++;
            }
            // Also count return_pending in the confirmed tab to reflect the combined tab logic
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

    function clearFilters() {
        setFilters({ status: "all" });
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
        ...stableAPI,
    };
}
