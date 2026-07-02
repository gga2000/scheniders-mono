"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { CustomerStatus, TrustTier } from "@/types/customer";
import type { ValueTier, RiskLevel } from "@/lib/customer-reliability";
import { CACHE_PRESETS } from '@/lib/query-config';

export interface PaginatedCustomerFilters {
    status?: CustomerStatus | "all";
    city?: string;
    search?: string;
    sortBy?: "name" | "total_orders" | "total_spent" | "last_order_date" | "trust_score";
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
}

export interface PaginatedCustomer {
    phone: string;
    name: string;
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

/**
 * Hook to fetch paginated customers directly from the database using an RPC.
 * Uses useInfiniteQuery to support infinite scrolling in the virtualized list.
 */
export function usePaginatedCustomers(
    limit: number = 20,
    filters?: PaginatedCustomerFilters
) {
    return useInfiniteQuery({
        queryKey: ["customers", "infinite", limit, filters],
        initialPageParam: 1,
        queryFn: async ({ pageParam = 1 }): Promise<{ customers: PaginatedCustomer[], totalCount: number, nextPage: number | null }> => {
            const offset = (pageParam - 1) * limit;

            // Call the RPC we defined in the migration
            const { data, error } = await supabase.rpc("get_paginated_customers", {
                search_query: filters?.search || null,
                status_filter: filters?.status === "all" ? null : (filters?.status || null),
                city_filter: filters?.city || null,
                sort_by: filters?.sortBy || "last_order_date",
                sort_desc: filters?.sortOrder !== "asc", // Defaults to true/desc
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
            });

            if (error) {
                console.error("Error fetching paginated customers:", error);
                throw new Error("Failed to fetch customers");
            }

            const rawData = data as any[];

            // The RPC returns total_count as a column on every row. Grab it from the first row.
            const totalCount = rawData.length > 0 ? Number(rawData[0].total_count) : 0;

            // Clean up the data before returning it to the components.
            const formattedData: PaginatedCustomer[] = rawData.map(row => ({
                phone: row.phone,
                name: row.name || "Unknown Customer",
                city: row.city,
                governorate: row.governorate,
                total_orders: Number(row.total_orders),
                total_spent: Number(row.total_spent),
                last_order_date: row.last_order_date,
                first_order_date: row.first_order_date,
                calculated_status: row.calculated_status as CustomerStatus,
                is_blacklisted: row.blacklisted ?? row.is_blacklisted,
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
            }));

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
    return useQuery({
        queryKey: ["customers", "dashboard_stats"],
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
