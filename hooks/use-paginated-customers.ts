"use client";

import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { CustomerStatus } from "@/lib/customer-types";
import { CACHE_PRESETS } from '@/lib/query-config';

export interface PaginatedCustomerFilters {
    status?: CustomerStatus | "all";
    city?: string;
    search?: string;
    sortBy?: "name" | "total_orders" | "total_spent" | "last_order_date";
    sortOrder?: "asc" | "desc";
    // Advanced Filters
    minLtv?: number;
    maxLtv?: number;
    lastOrderWithinDays?: number;
    tagId?: string;
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
                is_blacklisted: row.blacklisted,
                total_items: Number(row.total_items || 0),
                last_order_id: row.last_order_id,
                last_order_status: row.last_order_status,
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
                    vip_count: 0,
                    regular_count: 0,
                    new_count: 0,
                };
            }

            const stats = data[0];
            return {
                total_customers: Number(stats.total_customers),
                total_revenue: Number(stats.total_revenue),
                vip_count: Number(stats.vip_count),
                regular_count: Number(stats.regular_count),
                new_count: Number(stats.new_count),
            };
        },
        staleTime: CACHE_PRESETS.PAGINATION.staleTime,
        gcTime: CACHE_PRESETS.PAGINATION.gcTime,
    });
}
