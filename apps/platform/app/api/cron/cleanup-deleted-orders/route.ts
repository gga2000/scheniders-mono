import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase-server';

// Opt out of caching
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Matches the comment below, and the batch size the original claimed but never enforced. */
const MAX_DELETIONS_PER_RUN = 1000;

/**
 * GET /api/cron/cleanup-deleted-orders
 *
 * Permanently deletes orders soft-deleted more than 30 days ago. Uses the
 * service_role key, so RLS does not apply and this runs across EVERY tenant.
 *
 * ORD-A7. The authorization used to read:
 *
 *     if (process.env.CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`)
 *
 * — so when `CRON_SECRET` was unset the check was skipped entirely and this
 * became an unauthenticated, cross-tenant, permanent delete reachable with a
 * plain GET. `CRON_SECRET` is `.optional()` in env.ts and appears in no
 * .env.example, and this project has previously lost environment variables in
 * production without anyone noticing. The guard now fails CLOSED: no secret
 * configured means the endpoint refuses to run at all, matching the strict form
 * already used by trial-suspend and subscription-renew.
 */
export async function GET(request: Request) {
    try {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
            // Fail closed. A destructive endpoint with no configured secret is
            // misconfigured, not "open by default".
            console.error('[Cron: cleanup-deleted-orders] CRON_SECRET is not set — refusing to run.');
            return NextResponse.json(
                { error: 'Endpoint is not configured.' },
                { status: 503 }
            );
        }

        const authHeader = request.headers.get('authorization');
        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = createSupabaseServiceClient();

        // Calculate the threshold date (30 days ago)
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() - 30);
        const thresholdIso = thresholdDate.toISOString();

        console.log(`[Cron: cleanup-deleted-orders] Starting cleanup for orders soft-deleted before ${thresholdIso}`);

        // Read the batch FIRST, so the deletion can be bounded and recorded.
        // The original deleted everything matching in one unbounded statement
        // while its comment claimed a 1000-row batch.
        const { data: doomed, error: selectError } = await supabase
            .from('orders')
            .select('id, order_id, tenant_id')
            .not('deleted_at', 'is', null)
            .lt('deleted_at', thresholdIso)
            .limit(MAX_DELETIONS_PER_RUN);

        if (selectError) {
            console.error('[Cron: cleanup-deleted-orders] Error selecting orders:', selectError.message);
            return NextResponse.json({ error: selectError.message }, { status: 500 });
        }

        if (!doomed || doomed.length === 0) {
            return NextResponse.json({ success: true, deletedCount: 0, threshold: thresholdIso });
        }

        const ids = doomed.map((o) => o.id as string);

        const { data: deletedOrders, error } = await supabase
            .from('orders')
            .delete()
            .in('id', ids)
            .select('id');

        if (error) {
            console.error('[Cron: cleanup-deleted-orders] Error deleting orders:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const count = deletedOrders?.length || 0;

        // Permanent deletion with no audit trail is not acceptable on the
        // revenue surface. `order_deletion_log.tenant_id` is NOT NULL and this
        // sweep spans tenants, so record one row per tenant.
        const byTenant = new Map<string, { ids: string[]; numbers: string[] }>();
        for (const o of doomed) {
            const tenantId = o.tenant_id as string | null;
            if (!tenantId) continue;
            const entry = byTenant.get(tenantId) ?? { ids: [], numbers: [] };
            entry.ids.push(o.id as string);
            entry.numbers.push(String(o.order_id ?? ''));
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
            // The orders are already gone; a logging failure must be loud but
            // must not present the deletion as failed.
            if (logError) {
                console.error('[Cron: cleanup-deleted-orders] Deletion succeeded but audit log failed:', logError.message);
            }
        }

        console.log(`[Cron: cleanup-deleted-orders] Successfully deleted ${count} orders across ${byTenant.size} tenant(s).`);

        return NextResponse.json({
            success: true,
            deletedCount: count,
            tenantsAffected: byTenant.size,
            threshold: thresholdIso,
            batchLimit: MAX_DELETIONS_PER_RUN,
        });
    } catch (error) {
        console.error('[Cron: cleanup-deleted-orders] Unhandled error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
