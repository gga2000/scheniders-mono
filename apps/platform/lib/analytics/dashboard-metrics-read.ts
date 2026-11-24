import type { SupabaseClient } from "@supabase/supabase-js";
import { dashboardMetricsSchema, type DashboardMetrics } from "@/lib/analytics/dashboard-metrics-schema";
import type { DateRangeKey } from "@/lib/analytics/dashboard-calculations";

/** The dashboard's numbers for one period, in the query cache. */
export function dashboardMetricsKey(range: DateRangeKey, tenantId: string | null) {
    return ["dashboard-metrics", range, tenantId] as const;
}

/** get_dashboard_metrics answered with a shape the schema does not accept. */
export class DashboardMetricsContractError extends Error {
    constructor(readonly issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
        super(
            `get_dashboard_metrics returned an unexpected shape: ${issues
                .slice(0, 5)
                .map((i) => `${i.path.map(String).join(".")} ${i.message}`)
                .join("; ")}`,
        );
        this.name = "DashboardMetricsContractError";
    }
}

/**
 * One period's dashboard numbers for `tenantId`, read as the client's user
 * (SECURITY INVOKER, RLS), parsed, never asserted. The browser hook and the
 * server's first-load read (lib/boot) both use it, so both hold the same figures.
 */
export async function readDashboardMetrics(
    client: SupabaseClient,
    range: DateRangeKey,
    tenantId: string,
): Promise<DashboardMetrics> {
    // Named shop: a member of two shops must see only the one open (audit R2 N4).
    const { data, error } = await client.rpc("get_dashboard_metrics", {
        p_range: range,
        p_tenant_id: tenantId,
    });
    if (error) throw error;

    // ARCH-D3: parse, do not assert. Any drift between the SQL function and the
    // TS type fails here, through the same path as any other RPC error, rather
    // than arriving as `undefined` inside widgets.
    const parsed = dashboardMetricsSchema.safeParse(data);
    if (!parsed.success) throw new DashboardMetricsContractError(parsed.error.issues);
    return parsed.data;
}
