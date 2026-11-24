import { dehydrate, QueryClient, type DehydratedState } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dashboardMetricsKey, readDashboardMetrics } from "@/lib/analytics/dashboard-metrics-read";
import { ordersAggregatesKey, ordersAggregatesParams, readOrdersAggregates } from "@/lib/orders/aggregates-read";
import { financeSummaryKey, readFinanceSummary } from "@/lib/finance/summary-read";
import { openingSummaryDays, StoredPeriodSchema, type StoredPeriod } from "@/lib/finance/period";
import { readProfileRow, readTenantAccess } from "@/lib/session-context";
import { BootSessionSchema, bootDashboardRange, type BootPayload, type BootRequest, type BootSession } from "@/lib/boot/schema";

/** Who the verified token says is signed in. */
export interface BootUser {
    userId: string;
    /** The token's app_metadata.support_viewer (set only by the staff console). */
    supportViewer: boolean;
}

/** The stored Finances choice the head script sent, or null when absent or not one. */
function storedFinancePeriod(raw: string | undefined): StoredPeriod | null {
    if (!raw) return null;
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        // Not JSON: the page itself ignores such a value and opens on its default, so do we.
        return null;
    }
    const parsed = StoredPeriodSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

/**
 * The reads a page opens with, under the keys its hooks use, for `tenantId`.
 * Each is the hook's own read function. A read that fails is left out (dehydrate
 * keeps successful reads only): the page then asks for it itself and shows its
 * failure the usual way.
 */
async function readPageQueries(client: SupabaseClient, tenantId: string, request: BootRequest): Promise<DehydratedState | null> {
    const queryClient = new QueryClient();
    const reads: Promise<void>[] = [];
    if (request.path === "/dashboard") {
        const range = bootDashboardRange(request);
        reads.push(queryClient.prefetchQuery({
            queryKey: dashboardMetricsKey("all", tenantId),
            queryFn: () => readDashboardMetrics(client, "all", tenantId),
        }));
        if (range !== "all") {
            reads.push(queryClient.prefetchQuery({
                queryKey: dashboardMetricsKey(range, tenantId),
                queryFn: () => readDashboardMetrics(client, range, tenantId),
            }));
        }
        const params = ordersAggregatesParams(tenantId, {});
        reads.push(queryClient.prefetchQuery({
            queryKey: ordersAggregatesKey(params),
            queryFn: () => readOrdersAggregates(client, params),
        }));
    } else if (request.path === "/finances") {
        const { current, compare } = openingSummaryDays(storedFinancePeriod(request.financePeriod), "last30");
        reads.push(queryClient.prefetchQuery({
            queryKey: financeSummaryKey(tenantId, current),
            queryFn: () => readFinanceSummary(client, tenantId, current),
        }));
        if (compare) {
            reads.push(queryClient.prefetchQuery({
                queryKey: financeSummaryKey(tenantId, compare),
                queryFn: () => readFinanceSummary(client, tenantId, compare),
            }));
        }
    }
    if (reads.length === 0) return null;
    await Promise.all(reads);
    return dehydrate(queryClient);
}

/**
 * Who the signed-in user is in their current shop, and the page's first
 * figures, read as that user. The shop is the one their profile has open
 * (user_profiles.current_tenant_id), never one the request names, and every
 * read runs under RLS exactly as the browser's would.
 *
 * Throws when the user's own rows cannot be read: the browser then reads them
 * itself, as it always did.
 */
export async function readBoot(client: SupabaseClient, user: BootUser, request: BootRequest, now: () => number): Promise<BootPayload> {
    const { userId } = user;
    const profileRead = await readProfileRow(client, userId);
    if (profileRead.kind === "failed") throw new Error(`profile read failed: ${profileRead.message}`);

    if (profileRead.kind === "none") {
        const session: BootSession = { userId, profile: null, tenantId: null, role: null, permissions: [], supportView: null };
        return { v: 1, serverNow: now(), session, queries: null };
    }

    // Checked here as the browser will check it, so a row it would refuse is never sent.
    const profile = BootSessionSchema.shape.profile.unwrap().parse(profileRead.profile);
    const tenantId = profile.current_tenant_id ?? null;
    const [access, queries] = await Promise.all([
        readTenantAccess(client, {
            userId,
            tenantId,
            platformRole: profile.role,
            isSupportViewer: async () => user.supportViewer,
        }),
        tenantId ? readPageQueries(client, tenantId, request) : Promise.resolve(null),
    ]);
    const session: BootSession = { userId, profile, tenantId, ...access };
    return { v: 1, serverNow: now(), session, queries };
}
