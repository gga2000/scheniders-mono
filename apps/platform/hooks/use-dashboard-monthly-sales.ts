"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { CACHE_PRESETS } from "@/lib/query-config";
import {
    MONTHLY_SALES_MONTHS,
    monthlySalesSchema,
    type MonthlySales,
} from "@/lib/analytics/dashboard-bento";

/**
 * Orders and realized revenue per Baghdad month for the Seasonality card, from
 * `get_dashboard_monthly_sales` (SECURITY INVOKER: the caller's RLS scopes it;
 * revenue is null server-side for viewers without VIEW_FINANCIALS).
 *
 * Keyed under "dashboard-metrics" so the orders-changed invalidation in
 * useDashboardMetricsQuery refreshes it with every other dashboard figure.
 */
export function useDashboardMonthlySales() {
    const { session, clientReady, tenantId } = useAuth();

    return useQuery<MonthlySales[]>({
        queryKey: ["dashboard-metrics", "monthly-sales", tenantId, MONTHLY_SALES_MONTHS],
        queryFn: async () => {
            if (!tenantId) throw new Error("monthly sales requested without a tenant");
            const { data, error } = await supabase.rpc("get_dashboard_monthly_sales", {
                p_tenant_id: tenantId,
                p_months: MONTHLY_SALES_MONTHS,
            });
            if (error) throw error;
            // Parse, do not assert (ARCH-D3): drift between the SQL and this type
            // surfaces as the widget's error state, not as NaN on the chart.
            return monthlySalesSchema.parse(data);
        },
        enabled: !!session && clientReady && !!tenantId,
        // Months move slowly; the orders-changed invalidation still applies.
        staleTime: CACHE_PRESETS.FREQUENT.staleTime,
        gcTime: CACHE_PRESETS.FREQUENT.gcTime,
        retry: 2,
    });
}
