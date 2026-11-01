"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";
import { orderRepository } from "@/lib/repositories/order-repository";
import { reportOrderError } from "@/lib/order-telemetry";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applies `/orders?order=<id>` — opens that order's details, e.g. from the
 * "View order" action on the toast after creating an order (which used to
 * point at a `highlight` parameter nothing read, so it only reloaded the page).
 *
 * Also applies `/orders?search=<term>` — the link the top-bar search and other pages
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
    const orderId = searchParams.get("order");
    const { setFilters, filtersSettled } = useOrdersContext();
    const { t } = useLanguage();
    // The id last opened from the URL. Removing the parameter re-runs the
    // effect, so the fetch is not tied to its cleanup; this ref stops a second
    // open of the same link instead.
    const openedRef = useRef<string | null>(null);

    useEffect(() => {
        if (!filtersSettled || !term || pathname !== "/orders") return;
        useOrderStore.getState().setLocalSearchQuery(term);
        setFilters((prev) => (prev.searchQuery === term ? prev : { ...prev, searchQuery: term }));

        const rest = new URLSearchParams(searchParams.toString());
        rest.delete("search");
        const query = rest.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, [term, filtersSettled, setFilters, searchParams, pathname, router]);

    useEffect(() => {
        if (!orderId) {
            // The link was consumed; the same order may be opened again later.
            openedRef.current = null;
            return;
        }
        if (pathname !== "/orders") return;
        const rest = new URLSearchParams(searchParams.toString());
        rest.delete("order");
        const query = rest.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        if (!UUID.test(orderId) || openedRef.current === orderId) return;
        openedRef.current = orderId;

        orderRepository.findById(orderId).then(
            (order) => {
                if (order) useOrderStore.getState().openOrderDetails(order);
                else toast.error(t("orders.toast.notFound"), t("orders.toast.notFoundDesc"));
            },
            (err: unknown) => {
                reportOrderError(err, { operation: "orders-open-from-url", orderId });
                toast.error(t("orders.toast.notFound"), t("orders.toast.notFoundDesc"));
            },
        );
    }, [orderId, searchParams, pathname, router, t]);

    return null;
}
