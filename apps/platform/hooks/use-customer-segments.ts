import { useQuery } from "@tanstack/react-query";
import { CACHE_PRESETS } from '@/lib/query-config';
import { supabase } from "@/lib/supabase";

export interface CustomerSegmentData {
    vip_revenue: number;
    vip_count: number;
    regular_revenue: number;
    regular_count: number;
    new_revenue: number;
    new_count: number;
}

export function useCustomerSegments() {
    return useQuery({
        queryKey: ["customer-segments"],
        queryFn: async (): Promise<CustomerSegmentData> => {
            // Fetch all customer aggregates
            const { data: customers, error } = await supabase
                .from("mv_customer_aggregates")
                .select("*");

            if (error) throw error;
            if (!customers) throw new Error("No customer data found");

            // Segment customers based on status logic
            // VIP: 5+ orders OR 500k+ IQD spent
            // Regular: 2+ orders (but not VIP)
            // New: < 2 orders

            const segments = {
                vip_revenue: 0,
                vip_count: 0,
                regular_revenue: 0,
                regular_count: 0,
                new_revenue: 0,
                new_count: 0,
            };

            customers.forEach((customer) => {
                const isVIP = customer.total_orders >= 5 || customer.total_spent >= 500000;
                const isRegular = customer.total_orders >= 2 && !isVIP;
                const isNew = customer.total_orders < 2;

                if (isVIP) {
                    segments.vip_revenue += customer.total_spent || 0;
                    segments.vip_count += 1;
                } else if (isRegular) {
                    segments.regular_revenue += customer.total_spent || 0;
                    segments.regular_count += 1;
                } else if (isNew) {
                    segments.new_revenue += customer.total_spent || 0;
                    segments.new_count += 1;
                }
            });

            return segments;
        },
        staleTime: CACHE_PRESETS.STANDARD.staleTime,
        gcTime: CACHE_PRESETS.STANDARD.gcTime,
        refetchOnWindowFocus: false,
    });
}
