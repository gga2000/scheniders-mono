import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, createSupabaseServiceClient } from '@/lib/supabase-server';
import { orderIdsBodySchema, toOrderUuids } from '@/lib/order-api-schemas';

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

        const t3 = performance.now();
        const { data: profile } = await supabaseAdmin
            .from('user_profiles')
            .select('role, current_tenant_id, is_active')
            .eq('id', user.id)
            .maybeSingle();
        const t4 = performance.now();
        console.log(`[Perf] Admin role check took: ${(t4 - t3).toFixed(2)}ms`);

        // Deactivating a user does not revoke their session, so check it here.
        if (profile?.is_active === false) {
            return NextResponse.json(
                { success: false, error: 'Account deactivated' },
                { status: 403 }
            );
        }

        // Positive allow-list: a missing profile (role === undefined) must not
        // fall through the gate the way a `!== 'viewer'` check would.
        if (!DELETE_ALLOWED_ROLES.includes(profile?.role ?? '')) {
            return NextResponse.json(
                { success: false, error: 'You do not have permission to delete orders' },
                { status: 403 }
            );
        }

        // Tenant comes from the caller's session, never from the request body.
        const tenantId = profile?.current_tenant_id as string | undefined;
        if (!tenantId) {
            return NextResponse.json(
                { success: false, error: 'No active tenant' },
                { status: 400 }
            );
        }

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

        const t9 = performance.now();
        // Unlink self-referencing FK first
        await supabaseAdmin
            .from('orders')
            .update({ original_order_id: null })
            .in('original_order_id', ids)
            .eq('tenant_id', tenantId);
        const t10 = performance.now();
        console.log(`[Perf] FK unlink update took: ${(t10 - t9).toFixed(2)}ms`);

        // Soft-delete the orders by setting deleted_at
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
        
        // Log deletion audit to deletion_log table ONLY for successfully deleted orders
        if (orderSnapshots && deletedIds.length > 0) {
            const successfullyDeletedSnapshots = orderSnapshots.filter(s => deletedIds.includes(s.id));
            if (successfullyDeletedSnapshots.length > 0) {
                const t7 = performance.now();
                const { error: logError } = await supabaseAdmin
                    .from('deletion_log')
                    .insert({
                        deleted_by: user.id,
                        deleted_at: new Date().toISOString(),
                        order_count: successfullyDeletedSnapshots.length,
                        order_ids: successfullyDeletedSnapshots.map(s => s.id),
                        order_snapshots: successfullyDeletedSnapshots,
                    });
                    
                const t8 = performance.now();
                console.log(`[Perf] Audit log insert took: ${(t8 - t7).toFixed(2)}ms`);
                if (logError) {
                    // Table may not exist yet - fall back to console logging
                    console.warn('[Deletion Audit] Could not write to deletion_log table:', logError.message);
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
