import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface BusinessMetrics {
    total_customers: number;
    total_revenue: number;
    vip_count: number;
    new_count: number; // New customers this month
    avg_order_value: number;
    active_customers: number; // Last 30 days
    at_risk_customers: number; // 90-180 days
    dormant_customers: number; // 180+ days
    revenue_growth_percent: number; // vs last month
    retention_rate: number; // Percentage
    avg_customer_ltv: number;
    repeat_purchase_rate: number; // Percentage
    total_orders: number;
    repeat_customers: number;
}

export function useBusinessMetrics() {
    return useQuery({
        queryKey: ["business-metrics", "v2"],
        queryFn: async (): Promise<BusinessMetrics> => {
            // Get current date boundaries
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

            // Fetch all customer aggregates in one query
            const { data: customers, error } = await supabase
                .from("mv_customer_aggregates")
                .select("*");

            if (error) throw error;
            if (!customers) throw new Error("No customer data found");

            // Calculate metrics
            const total_customers = customers.length;
            const total_revenue = customers.reduce((sum, c) => sum + (c.total_spent || 0), 0);

            // VIP: 5+ orders OR 500k+ IQD spent
            const vip_count = customers.filter(
                (c) => c.total_orders >= 5 || c.total_spent >= 500000
            ).length;

            // New customers this month
            const new_count = customers.filter((c) => {
                const firstOrder = new Date(c.first_order_date);
                return firstOrder >= startOfMonth;
            }).length;

            // Calculate total orders across all customers
            const total_orders = customers.reduce((sum, c) => sum + (c.total_orders || 0), 0);
            const avg_order_value = total_orders > 0 ? total_revenue / total_orders : 0;

            // Activity segmentation
            const active_customers = customers.filter((c) => {
                const lastOrder = new Date(c.last_order_date);
                return lastOrder >= thirtyDaysAgo;
            }).length;

            const at_risk_customers = customers.filter((c) => {
                const lastOrder = new Date(c.last_order_date);
                return lastOrder < ninetyDaysAgo && lastOrder >= oneEightyDaysAgo;
            }).length;

            const dormant_customers = customers.filter((c) => {
                const lastOrder = new Date(c.last_order_date);
                return lastOrder < oneEightyDaysAgo;
            }).length;

            // Revenue growth vs last month (query orders table for accurate monthly revenue)
            const { data: currentMonthOrders } = await supabase
                .from("orders")
                .select("total")
                .gte("created_at", startOfMonth.toISOString())
                .in("status", ["delivered", "confirmed"]);

            const { data: lastMonthOrders } = await supabase
                .from("orders")
                .select("total")
                .gte("created_at", startOfLastMonth.toISOString())
                .lte("created_at", endOfLastMonth.toISOString())
                .in("status", ["delivered", "confirmed"]);

            const currentMonthRevenue = currentMonthOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
            const lastMonthRevenue = lastMonthOrders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;

            const revenue_growth_percent =
                lastMonthRevenue > 0
                    ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
                    : currentMonthRevenue > 0 ? 100 : 0;

            // Retention rate: customers who ordered in last 30 days
            const retention_rate = total_customers > 0 ? (active_customers / total_customers) * 100 : 0;

            // Average customer LTV
            const avg_customer_ltv = total_customers > 0 ? total_revenue / total_customers : 0;

            // Repeat purchase rate: customers with 2+ orders
            const repeat_customers = customers.filter((c) => c.total_orders >= 2).length;
            const repeat_purchase_rate = total_customers > 0 ? (repeat_customers / total_customers) * 100 : 0;

            return {
                total_customers,
                total_revenue,
                vip_count,
                new_count,
                avg_order_value,
                active_customers,
                at_risk_customers,
                dormant_customers,
                revenue_growth_percent,
                retention_rate,
                avg_customer_ltv,
                repeat_purchase_rate,
                total_orders,
                repeat_customers,
            };
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
    });
}
