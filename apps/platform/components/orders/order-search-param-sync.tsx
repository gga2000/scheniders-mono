"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";

/**
 * Applies `/orders?search=<term>` — the link the top-bar search and other pages
 * use to open the orders list on a lookup.
 *
 * The page used to ignore the parameter. It is applied once the merchant's
 * saved filter has settled (applied earlier, the saved filter would replace it)
 * and only the search is set: the date range and status chip the merchant was
 * using stay as they were, so clearing the search returns to that view.
 *
 * The parameter is then removed from the URL, so following the same link again
 * — after the search box was cleared — applies it again rather than being a
 * no-op on an unchanged URL.
 */
export function OrderSearchParamSync() {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();
    const term = searchParams.get("search");
    const { setFilters, filtersSettled } = useOrdersContext();

    useEffect(() => {
        if (!filtersSettled || !term || pathname !== "/orders") return;
        useOrderStore.getState().setLocalSearchQuery(term);
        setFilters((prev) => (prev.searchQuery === term ? prev : { ...prev, searchQuery: term }));

        const rest = new URLSearchParams(searchParams.toString());
        rest.delete("search");
        const query = rest.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, [term, filtersSettled, setFilters, searchParams, pathname, router]);

    return null;
}
