"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { parseCustomerSort, type PaginatedCustomerFilters } from "@/hooks/use-paginated-customers";

// A hand-edited ?tagId= that is not a uuid would make the list RPC error.
const SEARCH_DEBOUNCE_MS = 300;

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

/** Only what the list page can set; anything else in the URL is ignored. */
interface CustomerUrlState extends Pick<PaginatedCustomerFilters, "search" | "sortBy" | "sortOrder" | "tagId"> {
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
        sortBy: parseCustomerSort(searchParams.get("sortBy")) ?? "total_orders",
        sortOrder: searchParams.get("sortOrder") === "asc" ? "asc" : "desc",
        tagId: UUID.test(searchParams.get("tagId") ?? "") ? (searchParams.get("tagId") as string) : undefined,
        view: searchParams.get("view") === "list" ? "list" : undefined,
    };

    const chips: CustomerChipFilters = {
        value: pick(searchParams.get("value"), VALUE_TIERS) ?? "all",
        risk: pick(searchParams.get("risk"), RISK_LEVELS) ?? "all",
        lane: pick(searchParams.get("lane"), LANES) ?? null,
    };

    // 2. Search box. Typing updates the box at once and writes the URL after a
    // pause; a search that arrives in the URL from elsewhere (a global-search
    // result, back/forward) replaces what is in the box.
    const urlSearch = state.search ?? "";
    const [localSearch, setLocalSearch] = useState(urlSearch);
    const [urlSeen, setUrlSeen] = useState(urlSearch);
    const [pushed, setPushed] = useState(urlSearch);
    if (urlSearch !== urlSeen) {
        setUrlSeen(urlSearch);
        // The box's own write coming back is not an outside change.
        if (urlSearch !== pushed) setLocalSearch(urlSearch);
    }

    // The timer fires after later renders, so it reads the params as they are then.
    const latestParams = useRef(searchParams.toString());
    useEffect(() => {
        latestParams.current = searchParams.toString();
    }, [searchParams]);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);

    const setSearch = (text: string) => {
        setLocalSearch(text);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            const params = new URLSearchParams(latestParams.current);
            if ((params.get("search") ?? "") === text) return;
            if (text) params.set("search", text); else params.delete("search");
            setPushed(text);
            const qs = params.toString();
            router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
        }, SEARCH_DEBOUNCE_MS);
    };

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

    const setTag = (tagId: string) => pushStateToUrl("tagId", tagId);

    const setSort = (sortBy: CustomerUrlState["sortBy"], sortOrder: "asc" | "desc") => {
        const params = new URLSearchParams(searchParams.toString());
        if (sortBy === "total_orders") params.delete("sortBy");
        else params.set("sortBy", sortBy || "");

        if (sortOrder === "desc") params.delete("sortOrder");
        else params.set("sortOrder", sortOrder);

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

    return {
        state,
        chips,
        setChips,
        rawSearch: localSearch, // Instant view for search box
        setSearch,
        setTag,
        setSort,
        setView,
    };
}
