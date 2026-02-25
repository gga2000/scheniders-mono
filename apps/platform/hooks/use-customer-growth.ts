import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { CustomerGrowthData } from "@/components/customers/customer-growth-chart";

export function useCustomerGrowth(days: number = 365) {
    return useQuery({
        queryKey: ["customer-growth", days],
        queryFn: async (): Promise<CustomerGrowthData[]> => {
            // Get all customers
            const { data: customers, error } = await supabase
                .from("mv_customer_aggregates")
                .select("first_order_date")
                .order("first_order_date", { ascending: true });

            if (error) throw error;
            if (!customers || customers.length === 0) return [];

            // Calculate date range
            const now = new Date();
            const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

            // Group customers by day
            const dailyData = new Map<string, { new: number; total: number }>();

            // Initialize all days in the range
            for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
                const dateKey = d.toISOString().split("T")[0];
                dailyData.set(dateKey, { new: 0, total: 0 });
            }

            // Count new customers per day
            customers.forEach((customer) => {
                const firstOrderDate = new Date(customer.first_order_date);
                const dateKey = firstOrderDate.toISOString().split("T")[0];

                if (dailyData.has(dateKey)) {
                    const current = dailyData.get(dateKey)!;
                    current.new += 1;
                    dailyData.set(dateKey, current);
                }
            });

            // Calculate cumulative totals
            let runningTotal = customers.filter((c) => {
                const firstOrder = new Date(c.first_order_date);
                return firstOrder < startDate;
            }).length;

            const result: CustomerGrowthData[] = [];
            const sortedDates = Array.from(dailyData.keys()).sort();

            sortedDates.forEach((dateKey) => {
                const dayData = dailyData.get(dateKey)!;
                runningTotal += dayData.new;

                result.push({
                    date: dateKey,
                    newCustomers: dayData.new,
                    totalCustomers: runningTotal,
                });
            });

            return result;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
    });
}
