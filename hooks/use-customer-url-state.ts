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
    });

    const [state, setState] = useState<CustomerUrlState>(getInitialState);
    const debouncedSearch = useDebounce(state.search || "", 300);

    // Update URL when state changes (debounced for search)
    const updateUrl = useCallback((newState: CustomerUrlState, currentSearch: string) => {
        const params = new URLSearchParams(searchParams.toString());

        // Handle Search (debounced)
        if (currentSearch) {
            params.set("search", currentSearch);
        } else {
            params.delete("search");
        }

        // Handle Status
        if (newState.status && newState.status !== "all") {
            params.set("status", newState.status);
        } else {
            params.delete("status");
        }

        // Handle City
        if (newState.city) {
            params.set("city", newState.city);
        } else {
            params.delete("city");
        }

        // Handle Sorting
        if (newState.sortBy && newState.sortBy !== "last_order_date") {
            params.set("sortBy", newState.sortBy);
        } else {
            params.delete("sortBy");
        }

        if (newState.sortOrder && newState.sortOrder !== "desc") {
            params.set("sortOrder", newState.sortOrder);
        } else {
            params.delete("sortOrder"); // desc is default
        }

        // Handle Selected Customer
        if (newState.customerId) {
            params.set("customer", newState.customerId);
        } else {
            params.delete("customer");
        }

        // Only push if params actually changed
        const newQueryString = params.toString();
        const currentQueryString = searchParams.toString();

        if (newQueryString !== currentQueryString) {
            const newUrl = `${pathname}${newQueryString ? `?${newQueryString}` : ''}`;
            // Use replace to avoid filling history stack for every keystroke filter
            router.replace(newUrl, { scroll: false });
        }
    }, [pathname, router, searchParams]);

    // Effect to trigger URL update when relevant state pieces change
    useEffect(() => {
        updateUrl(state, debouncedSearch);
    }, [state.status, state.city, state.sortBy, state.sortOrder, state.customerId, debouncedSearch, updateUrl]);

    // Helpers to update individual pieces
    const setSearch = (search: string) => setState(prev => ({ ...prev, search }));
    const setStatus = (status: CustomerStatus | "all") => setState(prev => ({ ...prev, status }));
    const setCity = (city: string) => setState(prev => ({ ...prev, city }));
    const setSort = (sortBy: CustomerUrlState["sortBy"], sortOrder: "asc" | "desc") =>
        setState(prev => ({ ...prev, sortBy, sortOrder }));
    const setSelectedCustomer = (customerId: string | null) => setState(prev => ({ ...prev, customerId }));

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
    };
}
