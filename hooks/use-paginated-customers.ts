"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { CustomerStatus } from "@/lib/customer-types";

export interface PaginatedCustomerFilters {
    status?: CustomerStatus | "all";
    city?: string;
    search?: string;
    sortBy?: "name" | "total_orders" | "total_spent" | "last_order_date";
    sortOrder?: "asc" | "desc";
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
}

export interface PaginatedCustomersResponse {
    data: PaginatedCustomer[];
    totalCount: number;
    totalPages: number;
}

/**
 * Hook to fetch paginated customers directly from the database using an RPC.
 * This is designed to replace the expensive client-side aggregation done in useCustomers.
 */
export function usePaginatedCustomers(
    page: number = 1,
    limit: number = 20,
    filters?: PaginatedCustomerFilters
) {
    const offset = (page - 1) * limit;

    return useQuery({
        queryKey: ["customers", "paginated", page, limit, filters],
        queryFn: async (): Promise<PaginatedCustomersResponse> => {
            // Call the RPC we defined in the migration
            const { data, error } = await supabase.rpc("get_paginated_customers", {
                search_query: filters?.search || null,
                status_filter: filters?.status === "all" ? null : filters?.status,
                city_filter: filters?.city || null,
                sort_by: filters?.sortBy || "last_order_date",
                sort_desc: filters?.sortOrder !== "asc", // Defaults to true/desc
                page_limit: limit,
                page_offset: offset,
            });

            if (error) {
                console.error("Error fetching paginated customers:", error);
                throw new Error("Failed to fetch customers");
            }

            const rawData = data as any[];

            // The RPC returns total_count as a column on every row. Grab it from the first row.
            const totalCount = rawData.length > 0 ? Number(rawData[0].total_count) : 0;
            const totalPages = Math.ceil(totalCount / limit);

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
            }));

            return {
                data: formattedData,
                totalCount,
                totalPages,
            };
        },
        // Keep previous data while fetching next pages to avoid UI flashing
        placeholderData: (previousData) => previousData,
        staleTime: 1000 * 60 * 5, // 5 minutes fresh
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
        staleTime: 1000 * 60 * 15, // 15 mins fresh, these don't change wildly second to second
    });
}
