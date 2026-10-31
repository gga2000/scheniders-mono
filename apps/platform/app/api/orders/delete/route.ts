import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, createSupabaseServiceClient } from '@/lib/supabase-server';
import { orderIdsBodySchema, toOrderUuids } from '@/lib/order-api-schemas';
import { reportOrderError } from '@/lib/order-telemetry';
import { resolveActiveTenant } from '@/lib/auth/resolve-active-tenant';

/** Roles allowed to delete orders. Anything else — including `viewer` and a
 *  user with no profile row — is denied. */
const DELETE_ALLOWED_ROLES = ['admin', 'super_admin', 'employee'];

/**
 * POST /api/orders/delete
 *
 * Delete orders by IDs using service role (bypasses RLS).
 * Requires authenticated admin user via Authorization header.
 * Body: { ids: string[] }
 */
export async function POST(request: NextRequest) {
    const startTime = performance.now();
    try {
        // Verify the requesting user via access token
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json(
                { success: false, error: 'Missing Authorization header' },
                { status: 401 }
            );
        }

        const t1 = performance.now();
        const { user, error: authError } = await verifyAccessToken(token);
        const t2 = performance.now();
        console.log(`[Perf] verifyAccessToken took: ${(t2 - t1).toFixed(2)}ms`);

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const supabaseAdmin = createSupabaseServiceClient();

        // Tenant comes from the caller's session, never from the request body,
        // and only while they are an active member of it.
        const t3 = performance.now();
        const active = await resolveActiveTenant(user.id);
        const t4 = performance.now();
        console.log(`[Perf] Tenant + role check took: ${(t4 - t3).toFixed(2)}ms`);
        if (!active.ok) {
            return NextResponse.json({ success: false, error: active.error }, { status: active.status });
        }

        // Positive allow-list: a missing profile (role === '') must not
        // fall through the gate the way a `!== 'viewer'` check would.
        if (!DELETE_ALLOWED_ROLES.includes(active.role)) {
            return NextResponse.json(
                { success: false, error: 'You do not have permission to delete orders' },
                { status: 403 }
            );
        }
        const tenantId = active.tenantId;

        const parsedBody = orderIdsBodySchema.safeParse(await request.json());
        if (!parsedBody.success) {
            return NextResponse.json(
                { success: false, error: 'Invalid request: `ids` must be 1-500 order ids' },
                { status: 400 }
            );
        }
        // Narrow to real UUIDs: optimistic `temp-*` rows have no server row and
        // must not fail the rest of the batch.
        const ids = toOrderUuids(parsedBody.data.ids);
        if (ids.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No valid order ids provided' },
                { status: 400 }
            );
        }

        const t5 = performance.now();
        // Snapshot orders before deletion for audit trail
        const { data: orderSnapshots } = await supabaseAdmin
            .from('orders')
            .select('id, order_id, customer_name, phone, status, price, items')
            .in('id', ids)
            .eq('tenant_id', tenantId);
        const t6 = performance.now();
        console.log(`[Perf] Snapshot fetch took: ${(t6 - t5).toFixed(2)}ms`);

        if (orderSnapshots && orderSnapshots.length > 0) {
            // Always log to console (captured by Vercel) before attempting so we have a trace if it crashes
            console.warn(`[Deletion Audit] User ${user.email || user.id} attempting to delete ${orderSnapshots.length} orders:`,
                orderSnapshots.map(o => `${o.order_id} (${o.status})`).join(', '));
        }

        // Soft-delete only. original_order_id links on returns, replacements
        // and exchanges are left intact so the after-sale chain survives a
        // delete and a restore.
        const t11 = performance.now();
        const { data: deletedRows, error: deleteError } = await supabaseAdmin
            .from('orders')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', ids)
            .eq('tenant_id', tenantId)
            .select('id');
        const t12 = performance.now();
        console.log(`[Perf] Actual delete took: ${(t12 - t11).toFixed(2)}ms`);

        if (deleteError) {
            console.error('[Deletion] Error deleting orders:', deleteError.message);
            return NextResponse.json(
                { success: false, error: deleteError.message },
                { status: 500 }
            );
        }

        const deletedIds = (deletedRows || []).map(r => r.id);
        
        // Record who deleted what, for the orders that actually got deleted.
        // Deliberately no customer data: orders are soft-deleted, so the order
        // row itself is the recovery path and a second copy of names and phones
        // would be PII duplicated into another table. See OBS-2.
        if (orderSnapshots && deletedIds.length > 0) {
            const deleted = orderSnapshots.filter(s => deletedIds.includes(s.id));
            if (deleted.length > 0) {
                const t7 = performance.now();
                const { error: logError } = await supabaseAdmin
                    .from('order_deletion_log')
                    .insert({
                        tenant_id: tenantId,
                        deleted_by: user.id,
                        deleted_by_email: user.email ?? null,
                        deleted_at: new Date().toISOString(),
                        order_count: deleted.length,
                        order_ids: deleted.map(s => s.id),
                        order_numbers: deleted.map(s => String(s.order_id)),
                    });

                const t8 = performance.now();
                console.log(`[Perf] Audit log insert took: ${(t8 - t7).toFixed(2)}ms`);
                if (logError) {
                    // The deletion itself succeeded, so this must not fail the
                    // request — but a lost audit record was previously only a
                    // console warning, which is how the trail went missing
                    // unnoticed for the entire life of the feature.
                    reportOrderError(new Error(`Deletion audit write failed: ${logError.message}`), {
                        operation: 'orders-deletion-audit-write',
                        tenantId,
                        extra: { orderCount: deleted.length },
                    });
                }
            }
        }

        console.log(`[Perf] Total backend deletion process took: ${(performance.now() - startTime).toFixed(2)}ms`);

        return NextResponse.json({
            success: true,
            count: deletedIds.length,
            deletedIds,
        });
    } catch (error) {
        console.error('Delete orders error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
