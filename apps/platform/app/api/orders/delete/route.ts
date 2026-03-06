import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, createSupabaseServiceClient } from '@/lib/supabase-server';

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
            .select('role')
            .eq('id', user.id)
            .single();
        const t4 = performance.now();
        console.log(`[Perf] Admin role check took: ${(t4 - t3).toFixed(2)}ms`);

        if (profile?.role !== 'admin') {
            return NextResponse.json(
                { success: false, error: 'Admin access required' },
                { status: 403 }
            );
        }

        const { ids } = await request.json();

        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No order IDs provided' },
                { status: 400 }
            );
        }

        const t5 = performance.now();
        // Snapshot orders before deletion for audit trail
        const { data: orderSnapshots } = await supabaseAdmin
            .from('orders')
            .select('id, order_id, customer_name, phone, status, price, items')
            .in('id', ids);
        const t6 = performance.now();
        console.log(`[Perf] Snapshot fetch took: ${(t6 - t5).toFixed(2)}ms`);

        // Log deletion audit to deletion_log table (best-effort, don't block on failure)
        if (orderSnapshots && orderSnapshots.length > 0) {
            const t7 = performance.now();
            await supabaseAdmin
                .from('deletion_log')
                .insert({
                    deleted_by: user.id,
                    deleted_at: new Date().toISOString(),
                    order_count: orderSnapshots.length,
                    order_ids: ids,
                    order_snapshots: orderSnapshots,
                })
                .then(({ error: logError }) => {
                    const t8 = performance.now();
                    console.log(`[Perf] Audit log insert took: ${(t8 - t7).toFixed(2)}ms`);
                    if (logError) {
                        // Table may not exist yet - fall back to console logging
                        console.warn('[Deletion Audit] Could not write to deletion_log table:', logError.message);
                    }
                });

            // Always log to console (captured by Vercel)
            console.warn(`[Deletion Audit] User ${user.email || user.id} deleting ${orderSnapshots.length} orders:`,
                orderSnapshots.map(o => `${o.order_id} (${o.status})`).join(', '));
        }

        const t9 = performance.now();
        // Unlink self-referencing FK first
        await supabaseAdmin
            .from('orders')
            .update({ original_order_id: null })
            .in('original_order_id', ids);
        const t10 = performance.now();
        console.log(`[Perf] FK unlink update took: ${(t10 - t9).toFixed(2)}ms`);

        const t11 = performance.now();
        // Delete the orders
        const { data: deletedRows, error: deleteError } = await supabaseAdmin
            .from('orders')
            .delete()
            .in('id', ids)
            .select('id');
        const t12 = performance.now();
        console.log(`[Perf] Actual delete took: ${(t12 - t11).toFixed(2)}ms`);

        console.log(`[Perf] Total backend deletion process took: ${(performance.now() - startTime).toFixed(2)}ms`);

        if (deleteError) {
            return NextResponse.json(
                { success: false, error: deleteError.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            count: deletedRows?.length || 0,
            deletedIds: (deletedRows || []).map(r => r.id),
        });
    } catch (error) {
        console.error('Delete orders error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
