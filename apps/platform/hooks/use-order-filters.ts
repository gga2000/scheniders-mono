"use client";

import { useState, useMemo, useCallback, useDeferredValue, useRef, useLayoutEffect, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { reportOrderError } from "@/lib/order-telemetry";
import { toast } from "@/hooks/use-toast";
import type { Order, OrderFilters, FilterPreset } from "@/lib/supabase";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import {
    loadFilterPresetsFromStorage,
    saveFilterPresetsToStorage,
    createFilterPreset,
    orderMatchesSearch,
} from "@/lib/order-filter-utils";
import { windowFromDateFilter, orderInDateWindow } from "@/lib/order-window";

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

    // WF-3: saved views used to live only in localStorage, so they did not follow
    // a user to another device or browser and were lost when site data was
    // cleared. They now persist to `filter_presets`, which already existed with
    // tenant-scoped RLS. localStorage is kept as the initial paint (so the list
    // is not empty on first render) and as the source for a one-time migration
    // of views a user had saved before this change.
    const [filterPresets, setFilterPresets] = useState<FilterPreset[]>(() => {
        if (typeof window !== "undefined") {
            return loadFilterPresetsFromStorage();
        }
        return [];
    });

    const { tenantId } = useAuth();

    useEffect(() => {
        if (!tenantId) return;
        let cancelled = false;

        (async () => {
            const { data, error } = await supabase
                .from("filter_presets")
                .select("id, name, filters, page, created_by, created_at")
                .eq("page", "orders")
                .order("created_at", { ascending: true });

            if (cancelled) return;
            if (error) {
                // Keep whatever localStorage gave us rather than blanking the list.
                reportOrderError(error, { operation: "orders-filter-presets-load", tenantId });
                return;
            }

            const remote = (data ?? []) as FilterPreset[];

            // One-time lift of pre-existing local views into the shared table.
            const local = loadFilterPresetsFromStorage();
            const missing = local.filter(l => !remote.some(r => r.name === l.name));
            if (missing.length > 0) {
                const { error: upErr } = await supabase.from("filter_presets").insert(
                    missing.map(m => ({
                        name: m.name,
                        filters: m.filters,
                        page: "orders",
                        created_by: m.created_by ?? null,
                        tenant_id: tenantId,
                    })),
                );
                if (upErr) {
                    reportOrderError(upErr, { operation: "orders-filter-presets-migrate", tenantId });
                } else {
                    const { data: refreshed } = await supabase
                        .from("filter_presets")
                        .select("id, name, filters, page, created_by, created_at")
                        .eq("page", "orders")
                        .order("created_at", { ascending: true });
                    if (!cancelled && refreshed) {
                        setFilterPresets(refreshed as FilterPreset[]);
                        return;
                    }
                }
            }

            setFilterPresets(remote);
        })();

        return () => { cancelled = true; };
    }, [tenantId]);

    const deferredOrders = useDeferredValue(orders);
    const deferredArchivedOrders = useDeferredValue(archivedOrders);
    const deferredFilters = useDeferredValue(filters);

    // =============================================
    // FILTER APPLICATION
    // =============================================

    const applyFilters = useCallback(
        (ordersToFilter: Order[], activeFilters: OrderFilters = filters): Order[] => {
            const dateWindow = windowFromDateFilter(activeFilters.dateFrom, activeFilters.dateTo);
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

                // Date range filter — the same rule the server fetch and realtime
                // use (lib/order-window): Baghdad calendar days, and an order
                // scheduled for a day in the range belongs to it as well as the
                // day it arrived. This used to compare against the browser's
                // local midnight on `created_at` alone, so a postponed order never
                // showed on its day and a device outside Iraq drew different day
                // lines from the fetch it was filtering.
                if (dateWindow && !orderInDateWindow(order, dateWindow)) {
                    return false;
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

                // Search query — shared with the mobile screen via
                // orderMatchesSearch so the two cannot drift. This block used to
                // be a second, hand-maintained copy of the same predicate.
                if (activeFilters.searchQuery) {
                    return orderMatchesSearch(order, activeFilters.searchQuery, ordersToFilter);
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
        // Optimistic so the view appears immediately; the row id is replaced by
        // the server's once the insert returns.
        setFilterPresets(updated);
        saveFilterPresetsToStorage(updated);

        void (async () => {
            const { data, error } = await supabase
                .from("filter_presets")
                .insert({
                    name: preset.name,
                    filters: preset.filters,
                    page: "orders",
                    created_by: preset.created_by ?? null,
                    tenant_id: tenantId,
                })
                .select("id, name, filters, page, created_by, created_at")
                .single();

            if (error) {
                reportOrderError(error, { operation: "orders-filter-preset-save", tenantId });
                toast.error("Saved view kept on this device only", "It could not be synced to your account.");
                return;
            }
            if (data) {
                setFilterPresets(prev =>
                    prev.map(p => (p.id === preset.id ? (data as FilterPreset) : p)),
                );
            }
        })();

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

        void (async () => {
            const { error } = await supabase.from("filter_presets").delete().eq("id", presetId);
            if (error) {
                reportOrderError(error, { operation: "orders-filter-preset-delete", tenantId });
            }
        })();
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
