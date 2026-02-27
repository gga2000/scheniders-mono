"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { PaginatedCustomerFilters } from "@/hooks/use-paginated-customers";
import { CustomerStatus } from "@/lib/customer-types";
import { useDebounce } from "@/hooks/use-debounce";

interface CustomerUrlState extends PaginatedCustomerFilters {
    customerId: string | null;
}

/**
 * Hook to strictly sync Customer Page state (filters, search, selected customer)
 * deeply into the URL so state survives reloads and links are shareable.
 */
export function useCustomerUrlState() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Parse initial state from URL
    const getInitialState = (): CustomerUrlState => ({
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
    });

    const [state, setState] = useState<CustomerUrlState>(getInitialState);
    const debouncedSearch = useDebounce(state.search || "", 300);

    // Update URL when state changes (debounced for search)
    // We remove useCallback and useEffect to avoid dependency loop issues that trigger React re-renders.
    // Instead we only push to the router when we EXPLICITLY set a state, rather than reacting to it.

    // Helper to safely update the URL without causing infinite loops
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
            const newUrl = `${pathname}${newQueryString ? `?${newQueryString}` : ''}`;
            router.replace(newUrl, { scroll: false });
        }
    };

    // Helpers to update individual pieces AND the URL simultaneously to prevent loops
    const setSearch = (search: string) => {
        setState(prev => ({ ...prev, search }));
        // Note: we don't push URL here immediately, we let the debounced value handle it below
    };

    // React to debounced search changing
    useEffect(() => {
        pushStateToUrl("search", debouncedSearch || null);
    }, [debouncedSearch]);

    const setStatus = (status: CustomerStatus | "all") => {
        setState(prev => ({ ...prev, status }));
        pushStateToUrl("status", status);
    };

    const setCity = (city: string) => {
        setState(prev => ({ ...prev, city }));
        pushStateToUrl("city", city);
    };

    const setSort = (sortBy: CustomerUrlState["sortBy"], sortOrder: "asc" | "desc") => {
        setState(prev => ({ ...prev, sortBy, sortOrder }));

        const params = new URLSearchParams(searchParams.toString());
        if (sortBy === "last_order_date") params.delete("sortBy");
        else params.set("sortBy", sortBy || "");

        if (sortOrder === "desc") params.delete("sortOrder");
        else params.set("sortOrder", sortOrder);

        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const setSelectedCustomer = (customerId: string | null) => {
        setState(prev => ({ ...prev, customerId }));
        pushStateToUrl("customer", customerId);
    };

    // Advanced Setters
    const setAdvancedFilters = (filters: Pick<CustomerUrlState, "minLtv" | "maxLtv" | "lastOrderWithinDays" | "tagId">) => {
        setState(prev => ({ ...prev, ...filters }));
        const params = new URLSearchParams(searchParams.toString());

        if (filters.minLtv !== undefined) params.set("minLtv", filters.minLtv.toString()); else params.delete("minLtv");
        if (filters.maxLtv !== undefined) params.set("maxLtv", filters.maxLtv.toString()); else params.delete("maxLtv");
        if (filters.lastOrderWithinDays !== undefined) params.set("withinDays", filters.lastOrderWithinDays.toString()); else params.delete("withinDays");
        if (filters.tagId) params.set("tagId", filters.tagId); else params.delete("tagId");

        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const clearAdvancedFilters = () => {
        setState(prev => ({ ...prev, minLtv: undefined, maxLtv: undefined, lastOrderWithinDays: undefined, tagId: undefined }));
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
            search: debouncedSearch // Expose the debounced version for actual fetching
        },
        rawSearch: state.search, // Expose raw for the input field instantly
        setSearch,
        setStatus,
        setCity,
        setSort,
        setSelectedCustomer,
        setAdvancedFilters,
        clearAdvancedFilters
    };
}
