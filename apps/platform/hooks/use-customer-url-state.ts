"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { PaginatedCustomerFilters, parseCustomerSort } from "@/hooks/use-paginated-customers";
import { CustomerStatus, TrustTier } from "@/types/customer";
import { useDebounce } from "@/hooks/use-debounce";

// A hand-edited ?tagId= that is not a uuid would make the list RPC error.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALUE_TIERS = ["vip", "good", "newcomer"] as const;
const RISK_LEVELS = ["clean", "caution", "high", "blocked"] as const;
const LANES = ["vipsQuiet", "new", "firstDelivery"] as const;
export type UrlValueFilter = (typeof VALUE_TIERS)[number] | "all";
export type UrlRiskFilter = (typeof RISK_LEVELS)[number] | "all";
export type UrlLane = (typeof LANES)[number] | null;

function pick<T extends string>(raw: string | null, allowed: readonly T[]): T | undefined {
    return allowed.find((v) => v === raw);
}

/** The chip, risk and action-lane filters, kept in the URL so a profile round-trip or reload keeps them. */
export interface CustomerChipFilters {
    value: UrlValueFilter;
    risk: UrlRiskFilter;
    lane: UrlLane;
}

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
        sortBy: parseCustomerSort(searchParams.get("sortBy")) ?? "total_orders",
        sortOrder: (searchParams.get("sortOrder") as "asc" | "desc") || "desc",
        customerId: searchParams.get("customer") || null,
        minLtv: searchParams.has("minLtv") ? Number(searchParams.get("minLtv")) : undefined,
        maxLtv: searchParams.has("maxLtv") ? Number(searchParams.get("maxLtv")) : undefined,
        lastOrderWithinDays: searchParams.has("withinDays") ? Number(searchParams.get("withinDays")) : undefined,
        tagId: UUID.test(searchParams.get("tagId") ?? "") ? (searchParams.get("tagId") as string) : undefined,
        trustTier: (searchParams.get("tier") as TrustTier | "all") || undefined,
        minTrustScore: searchParams.has("minScore") ? Number(searchParams.get("minScore")) : undefined,
        maxTrustScore: searchParams.has("maxScore") ? Number(searchParams.get("maxScore")) : undefined,
        view: (searchParams.get("view") as "grid" | "list") || undefined,
    };

    const chips: CustomerChipFilters = {
        value: pick(searchParams.get("value"), VALUE_TIERS) ?? "all",
        risk: pick(searchParams.get("risk"), RISK_LEVELS) ?? "all",
        lane: pick(searchParams.get("lane"), LANES) ?? null,
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

    // 3. Sync debounced search to URL. Only a change of the typed text pushes;
    // a URL that moved on its own (below) must not be pushed back to the old text.
    const lastUrlSearch = useRef(state.search ?? "");
    const lastDebounced = useRef(debouncedSearch);
    useEffect(() => {
        if (debouncedSearch === lastDebounced.current) return;
        lastDebounced.current = debouncedSearch;
        if (debouncedSearch !== (state.search ?? "")) {
            lastUrlSearch.current = debouncedSearch;
            pushStateToUrl("search", debouncedSearch || null);
        }
    }, [debouncedSearch]);

    // A search that arrives from outside the box (a global-search result, browser
    // back/forward) replaces what is typed; the box's own pushes are not echoed back.
    useEffect(() => {
        const urlSearch = state.search ?? "";
        if (urlSearch !== lastUrlSearch.current) {
            lastUrlSearch.current = urlSearch;
            setLocalSearch(urlSearch);
        }
    }, [state.search]);

    // Setters just push to the URL. React will handle the re-render.
    const setSearch = (search: string) => setLocalSearch(search);
    const setStatus = (status: CustomerStatus | "all") => pushStateToUrl("status", status);
    const setCity = (city: string) => pushStateToUrl("city", city);
    const setTag = (tagId: string) => pushStateToUrl("tagId", tagId);
    const setSelectedCustomer = (customerId: string | null) => pushStateToUrl("customer", customerId);

    const setSort = (sortBy: CustomerUrlState["sortBy"], sortOrder: "asc" | "desc") => {
        const params = new URLSearchParams(searchParams.toString());
        if (sortBy === "total_orders") params.delete("sortBy");
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
    /** One URL write for the chips (and optionally the sort), so two setters never race on stale params. */
    const setChips = (next: CustomerChipFilters, sort?: { by: string; order: "asc" | "desc" }) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next.value === "all") params.delete("value"); else params.set("value", next.value);
        if (next.risk === "all") params.delete("risk"); else params.set("risk", next.risk);
        if (next.lane) params.set("lane", next.lane); else params.delete("lane");
        if (sort) {
            if (sort.by === "total_orders") params.delete("sortBy"); else params.set("sortBy", sort.by);
            if (sort.order === "desc") params.delete("sortOrder"); else params.set("sortOrder", sort.order);
        }
        const qs = params.toString();
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
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
        chips,
        setChips,
        rawSearch: localSearch, // Instant view for search box
        setSearch,
        setStatus,
        setCity,
        setTag,
        setSort,
        setSelectedCustomer,
        setAdvancedFilters,
        clearAdvancedFilters,
        setTrustTier,
        setTrustScoreRange,
        setView,
    };
}
