"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { PaginatedCustomerFilters } from "@/hooks/use-paginated-customers";
import { CustomerStatus, TrustTier } from "@/types/customer";
import { useDebounce } from "@/hooks/use-debounce";

interface CustomerUrlState extends PaginatedCustomerFilters {
    customerId: string | null;
    trustTier?: TrustTier | "all";
    minTrustScore?: number;
    maxTrustScore?: number;
    view?: "grid" | "list";
}

/**
 * Hook to strictly sync Customer Page state (filters, search, selected customer)
 * deeply into the URL so state survives reloads and links are shareable.
 * 
 * OPTIMIZED: Derives state strictly from URL to prevent Render Cascades.
 */
export function useCustomerUrlState() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // 1. Derive active state directly from the URL on every render
    const state: CustomerUrlState = {
        search: searchParams.get("search") || "",
        status: (searchParams.get("status") as CustomerStatus | "all") || "all",
        city: searchParams.get("city") || "",
        sortBy: (searchParams.get("sortBy") as any) || "last_order_date",
        sortOrder: (searchParams.get("sortOrder") as "asc" | "desc") || "desc",
        customerId: searchParams.get("customer") || null,
        minLtv: searchParams.has("minLtv") ? Number(searchParams.get("minLtv")) : undefined,
        maxLtv: searchParams.has("maxLtv") ? Number(searchParams.get("maxLtv")) : undefined,
        lastOrderWithinDays: searchParams.has("withinDays") ? Number(searchParams.get("withinDays")) : undefined,
        tagId: searchParams.get("tagId") || undefined,
        trustTier: (searchParams.get("tier") as TrustTier | "all") || undefined,
        minTrustScore: searchParams.has("minScore") ? Number(searchParams.get("minScore")) : undefined,
        maxTrustScore: searchParams.has("maxScore") ? Number(searchParams.get("maxScore")) : undefined,
        view: (searchParams.get("view") as "grid" | "list") || undefined,
    };

    // 2. Local search tracking strictly for fast typing UI
    const [localSearch, setLocalSearch] = useState(state.search || "");
    const debouncedSearch = useDebounce(localSearch, 300);

    // Helper to push URL safely
    const pushStateToUrl = (key: string, value: string | null) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value === null || value === "" || value === "all") {
            params.delete(key);
        } else {
            params.set(key, value);
        }

        const newQueryString = params.toString();
        const currentQueryString = searchParams.toString();

        if (newQueryString !== currentQueryString) {
            router.replace(`${pathname}${newQueryString ? `?${newQueryString}` : ''}`, { scroll: false });
        }
    };

    // 3. Sync debounced search to URL
    useEffect(() => {
        if (debouncedSearch !== state.search) {
            pushStateToUrl("search", debouncedSearch || null);
        }
    }, [debouncedSearch, state.search]); // Depend on derived state to prevent loops

    // Setters just push to the URL. React will handle the re-render.
    const setSearch = (search: string) => setLocalSearch(search);
    const setStatus = (status: CustomerStatus | "all") => pushStateToUrl("status", status);
    const setCity = (city: string) => pushStateToUrl("city", city);
    const setSelectedCustomer = (customerId: string | null) => pushStateToUrl("customer", customerId);

    const setSort = (sortBy: CustomerUrlState["sortBy"], sortOrder: "asc" | "desc") => {
        const params = new URLSearchParams(searchParams.toString());
        if (sortBy === "last_order_date") params.delete("sortBy");
        else params.set("sortBy", sortBy || "");

        if (sortOrder === "desc") params.delete("sortOrder");
        else params.set("sortOrder", sortOrder);

        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const setTrustTier = (tier: TrustTier | "all" | undefined) => pushStateToUrl("tier", tier === "all" ? null : (tier || null));
    const setTrustScoreRange = (min?: number, max?: number) => {
        const params = new URLSearchParams(searchParams.toString());
        if (min !== undefined) params.set("minScore", min.toString()); else params.delete("minScore");
        if (max !== undefined) params.set("maxScore", max.toString()); else params.delete("maxScore");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };
    const setView = (view: "grid" | "list") => pushStateToUrl("view", view === "grid" ? null : view);

    const setAdvancedFilters = (filters: Pick<CustomerUrlState, "minLtv" | "maxLtv" | "lastOrderWithinDays" | "tagId">) => {
        const params = new URLSearchParams(searchParams.toString());
        if (filters.minLtv !== undefined) params.set("minLtv", filters.minLtv.toString()); else params.delete("minLtv");
        if (filters.maxLtv !== undefined) params.set("maxLtv", filters.maxLtv.toString()); else params.delete("maxLtv");
        if (filters.lastOrderWithinDays !== undefined) params.set("withinDays", filters.lastOrderWithinDays.toString()); else params.delete("withinDays");
        if (filters.tagId) params.set("tagId", filters.tagId); else params.delete("tagId");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const clearAdvancedFilters = () => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("minLtv");
        params.delete("maxLtv");
        params.delete("withinDays");
        params.delete("tagId");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    return {
        state: {
            ...state,
            search: state.search // Exposed true URL state for fetchers
        },
        rawSearch: localSearch, // Instant view for search box
        setSearch,
        setStatus,
        setCity,
        setSort,
        setSelectedCustomer,
        setAdvancedFilters,
        clearAdvancedFilters,
        setTrustTier,
        setTrustScoreRange,
        setView,
    };
}
