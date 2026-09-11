import { NextResponse } from 'next/server';
import { requireCronAuth } from "@/lib/cron-auth";
import { createSupabaseServiceClient } from '@/lib/supabase-server';

// Opt out of caching
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Rows removed per run. Bounds the statement so a backlog cannot time it out. */
const CLEANUP_BATCH_SIZE = 1000;

/**
 * GET /api/cron/cleanup-deleted-orders
 * 
 * Scheduled job to permanently delete orders that have been soft-deleted
 * for more than 30 days. Uses the service_role key to bypass RLS.
 */
export async function GET(request: Request) {
    try {
        // Verify authorization if it's hitting the endpoint directly (optional depending on your Vercel setup,
        // but it's good practice. Vercel Cron sends a Bearer token matching CRON_SECRET)
        const denied = requireCronAuth(request);
        if (denied) return denied;

        const supabase = createSupabaseServiceClient();
        
        // Calculate the threshold date (30 days ago)
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - 30);
        const thresholdIso = thresholdDate.toISOString();

        console.log(`[Cron: cleanup-deleted-orders] Starting cleanup for orders soft-deleted before ${thresholdIso}`);

        // The comment here used to promise a 1000-row batch that the query never
        // enforced, so a single run tried to delete the entire backlog in one
        // statement. Pick the batch explicitly, oldest first, then delete by id.
        // The job is idempotent, so anything left over is taken by the next run.
        const { data: expiredOrders, error: selectError } = await supabase
            .from('orders')
            .select('id, order_id, tenant_id')
            .not('deleted_at', 'is', null)
            .lt('deleted_at', thresholdIso)
            .order('deleted_at', { ascending: true })
            .limit(CLEANUP_BATCH_SIZE);

        if (selectError) {
            console.error('[Cron: cleanup-deleted-orders] Error selecting expired orders:', selectError.message);
            return NextResponse.json({ error: selectError.message }, { status: 500 });
        }

        const expiredIds = (expiredOrders ?? []).map((order) => order.id);

        if (expiredIds.length === 0) {
            console.log('[Cron: cleanup-deleted-orders] Nothing to clean up.');
            return NextResponse.json({
                success: true,
                deletedCount: 0,
                hasMore: false,
                threshold: thresholdIso
            });
        }

        const { data: deletedOrders, error } = await supabase
            .from('orders')
            .delete()
            .in('id', expiredIds)
            .select('id');

        if (error) {
            console.error('[Cron: cleanup-deleted-orders] Error deleting orders:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const count = deletedOrders?.length || 0;

        // Permanent deletion with no audit trail is not acceptable on the
        // revenue surface — once these rows are gone, nothing records that they
        // existed. `order_deletion_log.tenant_id` is NOT NULL and this sweep
        // spans tenants, so write one row per tenant.
        const byTenant = new Map<string, { ids: string[]; numbers: string[] }>();
        for (const order of expiredOrders ?? []) {
            const tenantId = (order as { tenant_id: string | null }).tenant_id;
            if (!tenantId) continue;
            const entry = byTenant.get(tenantId) ?? { ids: [], numbers: [] };
            entry.ids.push((order as { id: string }).id);
            entry.numbers.push(String((order as { order_id: string | null }).order_id ?? ''));
            byTenant.set(tenantId, entry);
        }

        if (byTenant.size > 0) {
            const { error: logError } = await supabase.from('order_deletion_log').insert(
                [...byTenant.entries()].map(([tenantId, entry]) => ({
                    tenant_id: tenantId,
                    deleted_by: null,
                    deleted_by_email: 'cron:cleanup-deleted-orders',
                    order_count: entry.ids.length,
                    order_ids: entry.ids,
                    order_numbers: entry.numbers,
                }))
            );
            // The orders are already gone. A logging failure must be loud, but
            // must not report the deletion itself as failed.
            if (logError) {
                console.error('[Cron: cleanup-deleted-orders] Deletion succeeded but audit log failed:', logError.message);
            }
        }

        // A full batch means the backlog is not drained yet; the next run continues.
        const hasMore = expiredIds.length === CLEANUP_BATCH_SIZE;
        console.log(`[Cron: cleanup-deleted-orders] Successfully deleted ${count} orders.${hasMore ? ' More remain for the next run.' : ''}`);

        return NextResponse.json({
            success: true,
            deletedCount: count,
            tenantsAffected: byTenant.size,
            hasMore,
            threshold: thresholdIso
        });
    } catch (error) {
        console.error('[Cron: cleanup-deleted-orders] Unhandled error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
