"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import type { CustomerAggregate } from "./use-finance-customers";

/** PostgREST returns at most this many rows per request. */
export const AGGREGATE_PAGE_SIZE = 1000;

const COLUMNS =
    "customer_phone, latest_name, latest_city, total_orders, total_spent, first_order_date, last_order_date, cancelled_count, rejected_count";

/**
 * Every customer's lifetime totals for the store, read from the tenant-scoped
 * `customer_aggregates` view. The Customers tab needs lifetime figures, which the
 * period's orders cannot give. Paged by phone so no customer is dropped at the
 * row cap.
 */
export async function fetchCustomerAggregates(tenantId: string): Promise<CustomerAggregate[]> {
    const rows: CustomerAggregate[] = [];
    for (let from = 0; ; from += AGGREGATE_PAGE_SIZE) {
        const { data, error } = await supabase
            .from("customer_aggregates")
            .select(COLUMNS)
            .eq("tenant_id", tenantId)
            .order("customer_phone")
            .range(from, from + AGGREGATE_PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data ?? []) as CustomerAggregate[];
        rows.push(...page);
        if (page.length < AGGREGATE_PAGE_SIZE) return rows;
    }
}

const EMPTY: CustomerAggregate[] = [];

export function useFinanceCustomerAggregates() {
    const { tenantId } = useAuth();
    const query = useQuery({
        queryKey: ["finance-customer-aggregates", tenantId],
        queryFn: () => {
            if (!tenantId) throw new Error("No active tenant");
            return fetchCustomerAggregates(tenantId);
        },
        enabled: !!tenantId,
        // The view is a materialized view refreshed on a schedule; a few minutes of reuse costs nothing.
        staleTime: 5 * 60_000,
    });
    return {
        aggregates: query.data ?? EMPTY,
        loading: query.isPending,
        error: query.error ? (query.error instanceof Error ? query.error.message : "Failed to load customers") : null,
    };
}
