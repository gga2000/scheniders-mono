"use client";

import { formatPhoneDisplay } from "@/lib/customer-format";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { CustomerStatus, TrustTier } from "@/types/customer";
import type { ValueTier, RiskLevel } from "@/lib/customer-reliability";
import { CACHE_PRESETS } from '@/lib/query-config';
import type { Database } from "@scheniders/supabase/database.types";
import { LoadFailure, loadFailureKindFromStatus } from "@/lib/load-failure";

export const CUSTOMER_SORT_FIELDS = ["name", "total_orders", "total_spent", "last_order_date", "trust_score"] as const;
export type CustomerSortBy = (typeof CUSTOMER_SORT_FIELDS)[number];

/** A sort field from a URL or a select, or undefined when it is not one we support. */
export function parseCustomerSort(value: string | null | undefined): CustomerSortBy | undefined {
    return CUSTOMER_SORT_FIELDS.find((f) => f === value);
}

export interface PaginatedCustomerFilters {
    status?: CustomerStatus | "all";
    city?: string;
    search?: string;
    sortBy?: CustomerSortBy;
    sortOrder?: "asc" | "desc";
    // Advanced Filters
    minLtv?: number;
    maxLtv?: number;
    lastOrderWithinDays?: number;
    tagId?: string;
    // Trust filters
    trustTier?: TrustTier | "all";
    minTrustScore?: number;
    maxTrustScore?: number;
    // Two-axis server-side filters
    valueFilter?: ValueTier | "all";   // vip | good | newcomer
    riskFilter?: RiskLevel | "all";    // clean | caution | high | blocked
    // Server-side cohort filters (smart segments)
    lastOrderBeforeDays?: number;      // dormant: last order older than N days
    firstOrderWithinDays?: number;     // recently acquired: first order within N days
    firstDeliveryPending?: boolean;    // ordered but nothing delivered yet
}

export interface PaginatedCustomer {
    phone: string;
    /** Display name: the latest order's name, or the formatted phone when there is none. */
    name: string;
    /** False when no order carried a name and `name` is only the phone. */
    has_name: boolean;
    city: string | null;
    governorate: string | null;
    total_orders: number;
    total_spent: number;
    last_order_date: string;
    first_order_date: string;
    calculated_status: CustomerStatus;
    is_blacklisted: boolean;
    total_items: number;
    last_order_id?: string;
    last_order_status?: string;
    secondary_phone?: string;
    address_details?: string;
    // Trust fields
    trust_score: number;
    trust_tier: TrustTier;
    delivery_success_rate: number;
    community_avg_rating: number;
    // Live per-customer order-status counts (from get_paginated_customers)
    cancelled_count: number;
    no_response_count: number;
    rejected_count: number;
    returned_count: number;
    refund_count: number;
    completed_count: number;
    // Two-axis model (computed server-side via the shared SQL helpers)
    value_tier: ValueTier;
    risk_level: RiskLevel;
    severe_count: number;
    recent_severe_count: number;
    moderate_count: number;
    recent_moderate_count: number;
}

export interface PaginatedCustomersResponse {
    data: PaginatedCustomer[];
    totalCount: number;
    totalPages: number;
}

/** RPC arguments for get_paginated_customers; shared by the list and the export so both read the same set. */
export function toCustomerRpcArgs(filters: PaginatedCustomerFilters | undefined, limit: number, offset: number) {
    return {
        search_query: filters?.search || null,
        status_filter: filters?.status === "all" ? null : (filters?.status || null),
        city_filter: filters?.city || null,
        sort_by: filters?.sortBy || "last_order_date",
        sort_desc: filters?.sortOrder !== "asc",
        page_limit: limit,
        page_offset: offset,
        min_ltv: filters?.minLtv ?? null,
        max_ltv: filters?.maxLtv ?? null,
        last_order_within_days: filters?.lastOrderWithinDays ?? null,
        tag_id_filter: filters?.tagId || null,
        trust_tier_filter: filters?.trustTier === "all" ? null : (filters?.trustTier || null),
        min_trust_score: filters?.minTrustScore ?? null,
        max_trust_score: filters?.maxTrustScore ?? null,
        value_filter: filters?.valueFilter && filters.valueFilter !== "all" ? filters.valueFilter : null,
        risk_filter: filters?.riskFilter && filters.riskFilter !== "all" ? filters.riskFilter : null,
        last_order_before_days: filters?.lastOrderBeforeDays ?? null,
        first_order_within_days: filters?.firstOrderWithinDays ?? null,
        first_delivery_pending: filters?.firstDeliveryPending ?? null,
    };
}

export type CustomerRpcRow = Database["public"]["Functions"]["get_paginated_customers"]["Returns"][number];

export function mapCustomerRow(row: CustomerRpcRow): PaginatedCustomer {
    return {
        phone: row.phone,
        // No name on any order: show the number rather than an English placeholder.
        name: row.name || formatPhoneDisplay(row.phone),
        has_name: !!row.name,
        city: row.city,
        governorate: row.governorate,
        total_orders: Number(row.total_orders),
        total_spent: Number(row.total_spent),
        last_order_date: row.last_order_date,
        first_order_date: row.first_order_date,
        calculated_status: row.calculated_status as CustomerStatus,
        is_blacklisted: row.is_blacklisted,
        total_items: Number(row.total_items || 0),
        last_order_id: row.last_order_id,
        last_order_status: row.last_order_status,
        secondary_phone: row.secondary_phone ?? undefined,
        address_details: row.address_details ?? undefined,
        trust_score: Number(row.trust_score ?? 50),
        trust_tier: (row.trust_tier || 'new') as TrustTier,
        delivery_success_rate: Number(row.delivery_success_rate ?? 0),
        community_avg_rating: Number(row.community_avg_rating ?? 0),
        cancelled_count: Number(row.cancelled_count ?? 0),
        no_response_count: Number(row.no_response_count ?? 0),
        rejected_count: Number(row.rejected_count ?? 0),
        returned_count: Number(row.returned_count ?? 0),
        refund_count: Number(row.refund_count ?? 0),
        completed_count: Number(row.completed_count ?? 0),
        value_tier: (row.value_tier || 'newcomer') as ValueTier,
        risk_level: (row.risk_level || 'clean') as RiskLevel,
        severe_count: Number(row.severe_count ?? 0),
        recent_severe_count: Number(row.recent_severe_count ?? 0),
        moderate_count: Number(row.moderate_count ?? 0),
        recent_moderate_count: Number(row.recent_moderate_count ?? 0),
    };
}

/**
 * Hook to fetch paginated customers directly from the database using an RPC.
 * Uses useInfiniteQuery to support infinite scrolling in the virtualized list.
 */
export function usePaginatedCustomers(
    limit: number = 20,
    filters?: PaginatedCustomerFilters
) {
    // The RPCs read the caller's active store; the store is in the key so a
    // store switch never serves the previous store's cached pages.
    const { tenantId } = useAuth();
    return useInfiniteQuery({
        queryKey: ["customers", "infinite", tenantId, limit, filters],
        enabled: !!tenantId,
        initialPageParam: 1,
        queryFn: async ({ pageParam = 1 }): Promise<{ customers: PaginatedCustomer[], totalCount: number, nextPage: number | null }> => {
            const offset = (pageParam - 1) * limit;

            // Call the RPC we defined in the migration
            const { data, error, status } = await supabase.rpc("get_paginated_customers", toCustomerRpcArgs(filters, limit, offset));

            if (error) {
                console.error("Error fetching paginated customers:", error);
                throw new LoadFailure("Failed to fetch customers", loadFailureKindFromStatus(status), { cause: error });
            }

            const rawData = (data ?? []) as CustomerRpcRow[];

            // The RPC returns total_count as a column on every row. Grab it from the first row.
            const totalCount = rawData.length > 0 ? Number(rawData[0].total_count) : 0;

            // Clean up the data before returning it to the components.
            const formattedData: PaginatedCustomer[] = rawData.map(mapCustomerRow);

            // Determine if there's a next page
            const hasMore = offset + formattedData.length < totalCount;

            return {
                customers: formattedData,
                totalCount,
                nextPage: hasMore ? pageParam + 1 : null,
            };
        },
        getNextPageParam: (lastPage) => lastPage.nextPage,
        // Keep data fresh for 5 minutes — avoids repeated fetches on navigation
        staleTime: 5 * 60 * 1000,
        gcTime: CACHE_PRESETS.PAGINATION.gcTime,
        // Don't refetch on mount if we already have cached pages — show cached data instantly
        refetchOnMount: false,
        // Refetch when window regains focus to catch new orders
        refetchOnWindowFocus: true,
    });
}

/**
 * Hook to fetch the top-level stats for the dashboard quickly.
 */
export function useCustomerDashboardStats() {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["customers", "dashboard_stats", tenantId],
        enabled: !!tenantId,
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_customer_dashboard_stats");

            if (error) {
                console.error("Error fetching customer stats:", error);
                throw new Error("Failed to fetch customer stats");
            }

            if (!data || data.length === 0) {
                return {
                    total_customers: 0,
                    total_revenue: 0,
                    avg_trust_score: 50,
                    repeat_customer_count: 0,
                    new_this_month: 0,
                    top_governorate: null as string | null,
                    top_governorate_count: 0,
                    val_vip: 0,
                    val_good: 0,
                    val_newcomer: 0,
                    risk_clean: 0,
                    risk_caution: 0,
                    risk_high: 0,
                    risk_blocked: 0,
                    vips_quiet_count: 0,
                    first_delivery_pending_count: 0,
                };
            }

            const stats = data[0];
            return {
                total_customers: Number(stats.total_customers),
                total_revenue: Number(stats.total_revenue),
                avg_trust_score: Number(stats.avg_trust_score || 50),
                repeat_customer_count: Number(stats.repeat_customer_count || 0),
                new_this_month: Number(stats.new_this_month || 0),
                top_governorate: (stats.top_governorate as string | null) ?? null,
                top_governorate_count: Number(stats.top_governorate_count || 0),
                val_vip: Number(stats.val_vip || 0),
                val_good: Number(stats.val_good || 0),
                val_newcomer: Number(stats.val_newcomer || 0),
                risk_clean: Number(stats.risk_clean || 0),
                risk_caution: Number(stats.risk_caution || 0),
                risk_high: Number(stats.risk_high || 0),
                risk_blocked: Number(stats.risk_blocked || 0),
                vips_quiet_count: Number(stats.vips_quiet_count || 0),
                first_delivery_pending_count: Number(stats.first_delivery_pending_count || 0),
            };
        },
        staleTime: CACHE_PRESETS.PAGINATION.staleTime,
        gcTime: CACHE_PRESETS.PAGINATION.gcTime,
        // Keep the KPI/chip counts in sync with the card list (which refetches on focus).
        refetchOnWindowFocus: true,
    });
}
