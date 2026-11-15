import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, createSupabaseServiceClient } from '@/lib/supabase-server';
import { orderIdsBodySchema, toOrderUuids } from '@/lib/order-api-schemas';
import { reportOrderError } from '@/lib/order-telemetry';
import { resolveActiveTenant } from '@/lib/auth/resolve-active-tenant';
import { callerHasPermission } from '@/lib/auth/caller-has-permission';
import { PERMISSIONS } from '@/lib/permissions';
import { withFailureReport } from "@/lib/job-monitor";
import { TRASHABLE_ORDERS_FILTER } from "@/lib/order-trash";

/**
 * POST /api/orders/delete
 *
 * Delete orders by IDs using service role (bypasses RLS).
 * Requires authenticated admin user via Authorization header.
 * Body: { ids: string[] }
 */
async function handlePOST(request: NextRequest) {
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

        const { user, error: authError } = await verifyAccessToken(token);

        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const supabaseAdmin = createSupabaseServiceClient();

        // Tenant comes from the caller's session, never from the request body,
        // and only while they are an active member of it.
        const active = await resolveActiveTenant(user.id);
        if (!active.ok) {
            return NextResponse.json({ success: false, error: active.error }, { status: active.status });
        }

        // The store's own permission, not the role name: a member whose
        // orders.delete was switched off must be refused even as an employee.
        const permission = await callerHasPermission(request, active, PERMISSIONS.DELETE_ORDERS, 'orders-delete');
        if (!permission.ok) return permission.response;
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

        // Soft-delete only. original_order_id links on returns, replacements
        // and exchanges are left intact so the after-sale chain survives a
        // delete and a restore. Rows already in the trash are skipped, so a
        // repeat delete does not restart their 30-day purge clock. Shipped
        // orders are skipped too (board O1; the DB trigger refuses them, and
        // one refused row would fail the whole batch). RETURNING gives the
        // audit record exactly the rows that changed.
        const { data: deletedRows, error: deleteError } = await supabaseAdmin
            .from('orders')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', ids)
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .or(TRASHABLE_ORDERS_FILTER)
            .select('id, order_id, status');

        if (deleteError) {
            console.error('[Deletion] Error deleting orders:', deleteError.message);
            return NextResponse.json(
                { success: false, error: deleteError.message },
                { status: 500 }
            );
        }

        const newlyDeletedIds = (deletedRows || []).map(r => r.id);

        // Ids the write skipped are either already in the trash or shipped.
        // Delete is idempotent: an id already in this tenant's trash is in the
        // state the caller asked for. Without this a stale list (a second tab,
        // a double click, a realtime event that has not landed yet) re-sends an
        // already-trashed id, nothing matches, and the client reports "No
        // orders were deleted" with the row stuck on screen. Shipped ones are
        // named back so the screen can say why they stayed.
        const remainingIds = ids.filter(id => !newlyDeletedIds.includes(id));
        let alreadyDeletedIds: string[] = [];
        let shippedOrderNumbers: string[] = [];
        if (remainingIds.length > 0) {
            const { data: skippedRows, error: skippedError } = await supabaseAdmin
                .from('orders')
                .select('id, order_id, deleted_at')
                .in('id', remainingIds)
                .eq('tenant_id', tenantId);
            if (skippedError) {
                console.error('[Deletion] Error reading skipped orders:', skippedError.message);
                return NextResponse.json(
                    { success: false, error: skippedError.message },
                    { status: 500 }
                );
            }
            const skipped = skippedRows || [];
            alreadyDeletedIds = skipped.filter(r => r.deleted_at !== null).map(r => r.id);
            shippedOrderNumbers = skipped.filter(r => r.deleted_at === null).map(r => String(r.order_id));
        }
        const deletedIds = [...newlyDeletedIds, ...alreadyDeletedIds];

        // Record who deleted what, for the orders that actually got deleted.
        // Deliberately no customer data: orders are soft-deleted, so the order
        // row itself is the recovery path and a second copy of names and phones
        // would be PII duplicated into another table. See OBS-2.
        const deleted = deletedRows ?? [];
        if (deleted.length > 0) {
            console.warn(`[Deletion Audit] User ${user.email || user.id} deleted ${deleted.length} orders:`,
                deleted.map(o => `${o.order_id} (${o.status})`).join(', '));
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

        return NextResponse.json({
            success: true,
            count: newlyDeletedIds.length,
            deletedIds,
            shippedOrderNumbers,
        });
    } catch (error) {
        console.error('Delete orders error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}

export const POST = withFailureReport("api/orders/delete POST", handlePOST);
