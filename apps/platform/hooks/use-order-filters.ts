"use client";

import { useState, useMemo, useDeferredValue, useRef, useLayoutEffect, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { reportOrderError } from "@/lib/order-telemetry";
import { toast } from "@/hooks/use-toast";
import type { Order, OrderFilters, FilterPreset } from "@/lib/supabase";
import {
    loadFilterPresetsFromStorage,
    saveFilterPresetsToStorage,
    createFilterPreset,
} from "@/lib/order-filter-utils";
import { summarizeAdChannels } from "@/lib/ad-channel-filter";
import { NO_CAMPAIGN, summarizeAdCampaigns } from "@/lib/ad-campaign-filter";
import { leadQuality } from "@/lib/lead-quality";
import { filterOrders } from "@/lib/orders/filter-orders";
import { countOrderChips, type OrderChipCounts } from "@/lib/orders/order-chips";
import { countProductsInView } from "@/lib/orders/product-match";
import { listCovers } from "@/lib/orders/coverage-key";
import { sortPinnedNewestFirst } from "@/lib/orders/list-sort";
import type { OrderListPreview } from "@/lib/orders/list-preview";
import { windowCacheKey, windowFromDateFilter } from "@/lib/order-window";

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
    /**
     * Server matches for `filters.searchQuery`, or null when nothing is being
     * searched. Search is a lookup over the whole order book: while it is
     * active the list shows these matches — every date, every status, archived
     * and trashed included — instead of the filtered window.
     */
    searchResults: Order[] | null;
    /**
     * The window (`windowCacheKey`) the `orders` were loaded for, or null when
     * nothing has been loaded. Omitted (undefined), the caller asserts the rows
     * are the complete set for whatever window the filters name.
     */
    loadedWindowKey?: string | null;
    /**
     * The list fetch's head (lib/orders/list-preview.ts), or null. Shown only
     * while the loaded rows do not cover the window, and never counted.
     */
    preview?: Pick<OrderListPreview, "rows" | "newestCutoff"> | null;
}

/** The preview the list may show: the head, through the list's own filter and sort. */
export interface FilteredListPreview {
    rows: Order[];
    newestCutoff: string | null;
}

/**
 * Whether the counts describe the list on screen, from the same deferred
 * render as the list:
 *  - `ready`: not searching, and the loaded rows cover the filter's window.
 *  - `statusIsAll` / `windowIsAll`: the deferred filter has no status / dates.
 * The page combines these with its own refinements (lib/orders/count-visibility.ts).
 */
export interface CountViewFacts {
    ready: boolean;
    /** The loaded rows cover the filter's window: the list is the whole of it. */
    covered: boolean;
    statusIsAll: boolean;
    windowIsAll: boolean;
}

export function useOrderFilters({ orders, searchResults, filters, setFilters, clearFilters, loadedWindowKey, preview = null }: UseOrderFiltersOptions) {

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

    // The rows, the window they were loaded for and the preview are deferred
    // TOGETHER, so no render pairs one window's rows with another's coverage,
    // or shows the preview beside a list that already covers the window.
    const snapshot = useMemo(() => ({ orders, loadedWindowKey, preview }), [orders, loadedWindowKey, preview]);
    const deferredSnapshot = useDeferredValue(snapshot);
    const deferredOrders = deferredSnapshot.orders;
    const deferredSearchResults = useDeferredValue(searchResults);
    const deferredFilters = useDeferredValue(filters);

    // =============================================
    // DERIVED COMPUTATIONS
    //
    // Everything below is computed from the deferred values only, so the list
    // and every count change in the same render. The status chips, the list,
    // the product and channel tallies and the Needs Attention counts all run
    // `filterOrders` over the same rows: each count is, by construction, the
    // length of the list its click opens (see lib/orders/order-chips.ts).
    // =============================================

    const {
        status: dStatus,
        orderType: dOrderType,
        dateFrom: dDateFrom,
        dateTo: dDateTo,
        city: dCity,
        product: dProduct,
        priority: dPriority,
        paymentStatus: dPaymentStatus,
        adChannel: dAdChannel,
        adCampaign: dAdCampaign,
        isReturn: dIsReturn,
    } = deferredFilters;

    // The list's filter without its status: every FILTER_FIELDS_READ field but
    // one. A chip click changes only `status`, so this — and the counts taken
    // over it — keep their identity across chip switches.
    const nonStatusFilters = useMemo<OrderFilters>(() => ({
        orderType: dOrderType,
        dateFrom: dDateFrom,
        dateTo: dDateTo,
        city: dCity,
        product: dProduct,
        priority: dPriority,
        paymentStatus: dPaymentStatus,
        adChannel: dAdChannel,
        adCampaign: dAdCampaign,
        isReturn: dIsReturn,
    }), [dOrderType, dDateFrom, dDateTo, dCity, dProduct, dPriority, dPaymentStatus, dAdChannel, dAdCampaign, dIsReturn]);

    /** The rows every status chip counts over: the list's filter with status = all. */
    const countView = useMemo(
        () => filterOrders(deferredOrders, { ...nonStatusFilters, status: "all" }),
        [deferredOrders, nonStatusFilters],
    );

    const statusCounts = useMemo<OrderChipCounts>(() => countOrderChips(countView), [countView]);

    const filteredOrders = useMemo(() => {
        // Search results keep the server's ranking (exact number, then exact
        // phone, then partial matches) — re-sorting by date would bury the one
        // order the term names under newer partial matches.
        if (deferredSearchResults) return deferredSearchResults;

        // The status filter over the count view is the full list filter: every
        // other predicate has already been applied, and they are conjunctive.
        const filtered = filterOrders(countView, { status: dStatus });

        return sortPinnedNewestFirst(filtered);
    }, [countView, deferredSearchResults, dStatus]);

    // Needs Attention, each equal to the list its click opens:
    //   no response     → { ...filters, status: 'no_response' }    (a chip)
    //   returns pending → { ...filters, status: 'return_pending' } (exact status)
    //   urgent          → { ...filters, priority: 'urgent' }       (status kept)
    const urgentCount = useMemo(
        () => filterOrders(deferredOrders, { ...nonStatusFilters, status: dStatus, priority: "urgent" }).length,
        [deferredOrders, nonStatusFilters, dStatus],
    );
    const attentionCounts = useMemo(() => ({
        urgent: urgentCount,
        noResponse: statusCounts.no_response,
        returnPending: countView.filter((o) => o.status === "return_pending").length,
    }), [urgentCount, statusCounts, countView]);

    const deferredLoadedKey = deferredSnapshot.loadedWindowKey;
    const countViewFacts = useMemo<CountViewFacts>(() => {
        const window = windowFromDateFilter(dDateFrom, dDateTo);
        const covered = deferredLoadedKey === undefined || listCovers(deferredLoadedKey, windowCacheKey(window));
        return {
            // Search hits are not narrowed by status, channel or product, so no
            // count describes them. Otherwise the rows must cover the window.
            ready: deferredSearchResults === null && covered,
            covered,
            statusIsAll: !dStatus || dStatus === "all",
            windowIsAll: window === null,
        };
    }, [deferredSearchResults, deferredLoadedKey, dDateFrom, dDateTo, dStatus]);

    // The head of the list fetch, through the list's own filter and sort —
    // only while the rows do not cover the window and nothing is searched.
    // The page drops the rows that could still move (lib/orders/list-preview.ts)
    // and shows the rest read-only. No count is ever taken over it.
    const deferredPreview = deferredSnapshot.preview;
    const listPreview = useMemo<FilteredListPreview | null>(() => {
        if (!deferredPreview || countViewFacts.covered || deferredSearchResults !== null) return null;
        return {
            rows: sortPinnedNewestFirst(filterOrders(deferredPreview.rows, { ...nonStatusFilters, status: dStatus })),
            newestCutoff: deferredPreview.newestCutoff,
        };
    }, [deferredPreview, countViewFacts.covered, deferredSearchResults, nonStatusFilters, dStatus]);

    const availableCities = useMemo(() => {
        return [...new Set(deferredOrders.map((o) => o.city).filter(Boolean))] as string[];
    }, [deferredOrders]);

    const availableProducts = useMemo(() => {
        return [...new Set(deferredOrders.flatMap((o) => o.items?.map((i) => i.name) || []).filter(Boolean))] as string[];
    }, [deferredOrders]);

    // Products present in the orders matching the CURRENT view (every active
    // filter except the product filter itself — so picking a product doesn't
    // collapse the suggestion row to a single chip). Each count is the length
    // of the list that chip opens (lib/orders/product-match.ts).
    const availableProductsInView = useMemo(() => {
        // While searching, the view IS the search results.
        const matchingOrders = deferredSearchResults
            ?? filterOrders(deferredOrders, { ...nonStatusFilters, status: dStatus, product: undefined });
        return countProductsInView(matchingOrders);
    }, [deferredOrders, deferredSearchResults, nonStatusFilters, dStatus]);

    // Orders per ad channel over the CURRENT view minus the channel filter itself,
    // so picking Instagram does not collapse the row to a single chip. Its
    // `total` is the list the "all channels" chip opens.
    const adChannelSummary = useMemo(() => {
        return summarizeAdChannels(
            deferredSearchResults
                ?? filterOrders(deferredOrders, { ...nonStatusFilters, status: dStatus, adChannel: undefined }),
        );
    }, [deferredOrders, deferredSearchResults, nonStatusFilters, dStatus]);

    // Orders per ad campaign over the CURRENT view minus the campaign filter itself,
    // so picking one campaign keeps the others in the dropdown.
    const adCampaignSummary = useMemo(() => {
        return summarizeAdCampaigns(
            deferredSearchResults
                ?? filterOrders(deferredOrders, { ...nonStatusFilters, status: dStatus, adCampaign: undefined }),
        );
    }, [deferredOrders, deferredSearchResults, nonStatusFilters, dStatus]);

    // How the pinned campaign's leads ended, over the campaign's whole view (every status tab).
    const adCampaignQuality = useMemo(
        () => (dAdCampaign && dAdCampaign !== NO_CAMPAIGN ? leadQuality(countView) : null),
        [dAdCampaign, countView],
    );

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
        attentionCounts,
        countViewFacts,
        listPreview,
        availableCities,
        availableProducts,
        availableProductsInView,
        adChannelSummary,
        adCampaignSummary,
        adCampaignQuality,
        ...stableAPI,
    };
}
