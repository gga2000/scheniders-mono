"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import {
    orderSearchRepository,
    type CustomerSearchRow,
    type OrderSearchRow,
    type ProductSearchRow,
} from "@/lib/repositories/order-search-repository";

/** The floor the RPC enforces. Kept in sync so we do not fire a doomed request. */
const MIN_TERM = 2;

const EMPTY_ORDERS: OrderSearchRow[] = [];
const EMPTY_CUSTOMERS: CustomerSearchRow[] = [];
const EMPTY_PRODUCTS: ProductSearchRow[] = [];

/** Debounce a term so a fast typist does not fire a request per keystroke. */
function useDebounced(value: string, ms = 200): string {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), ms);
        return () => clearTimeout(id);
    }, [value, ms]);
    return debounced;
}

/**
 * PERF-D1. Order matches for a typed term, from the server.
 *
 * This replaces filtering the entire order book in the browser — the reason
 * `OrdersProvider` had to sit in the root layout and fetch ~9.7 MB on every
 * route. Used by global-search and by chat's `#ref` picker.
 */
export function useOrderSearchQuery(term: string, limit = 20): OrderSearchRow[] {
    const { session, clientReady } = useAuth();
    const debounced = useDebounced(term);
    const { data } = useQuery({
        queryKey: ["orders", "search", debounced, limit],
        queryFn: () => orderSearchRepository.searchOrders(debounced, limit),
        enabled: !!session && clientReady && debounced.trim().length >= MIN_TERM,
        staleTime: 30 * 1000,
    });
    return data ?? EMPTY_ORDERS;
}

/** Customer matches, with their REAL order counts (see searchCustomers). */
export function useCustomerSearchQuery(term: string, limit = 20): CustomerSearchRow[] {
    const { session, clientReady } = useAuth();
    const debounced = useDebounced(term);
    const { data } = useQuery({
        queryKey: ["customers", "search", debounced, limit],
        queryFn: () => orderSearchRepository.searchCustomers(debounced, limit),
        enabled: !!session && clientReady && debounced.trim().length >= MIN_TERM,
        staleTime: 30 * 1000,
    });
    return data ?? EMPTY_CUSTOMERS;
}

/** Product matches, from the catalogue rather than from past order lines. */
export function useProductSearchQuery(term: string, limit = 20): ProductSearchRow[] {
    const { session, clientReady } = useAuth();
    const debounced = useDebounced(term);
    const { data } = useQuery({
        queryKey: ["products", "search", debounced, limit],
        queryFn: () => orderSearchRepository.searchProducts(debounced, limit),
        enabled: !!session && clientReady && debounced.trim().length >= MIN_TERM,
        staleTime: 30 * 1000,
    });
    return data ?? EMPTY_PRODUCTS;
}
