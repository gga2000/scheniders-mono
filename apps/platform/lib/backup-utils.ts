import { supabase } from "@/lib/supabase";
import { ORDER_READ_COLUMNS, RESTORE_ORDERS_BATCH_SIZE, pickOrderWriteColumns } from "@/lib/repositories/order-columns";
import { restoreOrdersAction } from "@/app/actions/orders";

// Define the shape of our snapshot
export interface DatabaseSnapshot {
    version: number;
    timestamp: string;
    source: string;
    data: {
        orders: any[];
        customers: {
            metadata: any[];
            notes: any[];
            tags: any[];
            assignments: any[];
        };
        // Add other entities as needed
    };
}

const CURRENT_VERSION = 1;

/**
 * Snapshot of one tenant's orders and customer data. RLS already limits each
 * read to the caller's tenants; the tenant filter keeps a user who belongs to
 * several from exporting (and later restoring) them all as one book.
 */
export async function generateFullSnapshot(tenantId: string): Promise<DatabaseSnapshot> {
    try {
        // Parallel fetch for speed
        const [
            { data: orders },
            { data: metadata },
            { data: notes },
            { data: tags },
            { data: assignments },
        ] = await Promise.all([
            supabase.from('orders').select(ORDER_READ_COLUMNS).eq('tenant_id', tenantId),
            supabase.from('customer_metadata').select('*').eq('tenant_id', tenantId),
            supabase.from('customer_notes').select('*').eq('tenant_id', tenantId),
            supabase.from('customer_tags').select('*').eq('tenant_id', tenantId),
            supabase.from('customer_tag_assignments').select('*').eq('tenant_id', tenantId),
        ]);

        return {
            version: CURRENT_VERSION,
            timestamp: new Date().toISOString(),
            source: 'admin_dashboard',
            data: {
                orders: orders || [],
                customers: {
                    metadata: metadata || [],
                    notes: notes || [],
                    tags: tags || [],
                    assignments: assignments || [],
                },
            }
        };
    } catch (error) {
        console.error("Snapshot generation failed:", error);
        throw new Error("Failed to generate snapshot");
    }
}

/**
 * Write backed-up order rows through restoreOrdersAction, in batches that fit
 * a Server Action body. Browsers cannot insert orders themselves
 * (trg_orders_order_id_server_only). Only ORDER_READ_COLUMNS keys are sent:
 * backups taken before migration 20261021090000 carry the margin columns and
 * old client-side fields, which only make the payload bigger. Throws on the
 * first refused batch; the batches before it stay written.
 */
export async function restoreOrderRows(
    rows: Record<string, unknown>[],
    onBatch?: (written: number, total: number) => void,
): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    const orders = rows.map(pickOrderWriteColumns);
    for (let start = 0; start < orders.length; start += RESTORE_ORDERS_BATCH_SIZE) {
        const batch = orders.slice(start, start + RESTORE_ORDERS_BATCH_SIZE);
        const result = await restoreOrdersAction(batch, session?.access_token ?? "");
        if (!result.success) throw new Error(result.error ?? "Orders restore failed");
        onBatch?.(start + batch.length, orders.length);
    }
}

export async function restoreFromSnapshot(snapshot: DatabaseSnapshot): Promise<{ success: boolean; error?: string }> {
    try {
        if (!snapshot.version || snapshot.version !== CURRENT_VERSION) {
            return { success: false, error: "Incompatible snapshot version" };
        }

        // Restore logic: Upsert everything
        // We do this sequentially to respect dependencies (e.g. tags must exist before assignments)

        // 1. Tags (Independent)
        if (snapshot.data.customers.tags?.length) {
            const { error } = await supabase.from('customer_tags').upsert(snapshot.data.customers.tags, { onConflict: 'id' });
            if (error) throw error;
        }

        // 2. Orders (Independent-ish)
        if (snapshot.data.orders?.length) {
            // Only ORDER_READ_COLUMNS keys: a snapshot taken before migration
            // 20261021090000 carries the margin columns, and upserting them is
            // refused with 42501 once the caller holds no SELECT on them.
            await restoreOrderRows(snapshot.data.orders);
        }

        // 3. Customer Metadata
        if (snapshot.data.customers.metadata?.length) {
            const { error } = await supabase.from('customer_metadata').upsert(snapshot.data.customers.metadata, { onConflict: 'tenant_id,customer_phone' });
            if (error) throw error;
        }

        // 4. Customer Notes
        if (snapshot.data.customers.notes?.length) {
            const { error } = await supabase.from('customer_notes').upsert(snapshot.data.customers.notes, { onConflict: 'id' });
            if (error) throw error;
        }

        // 5. Tag Assignments (Dependent on Tags)
        if (snapshot.data.customers.assignments?.length) {
            const { error } = await supabase.from('customer_tag_assignments').upsert(snapshot.data.customers.assignments, { onConflict: 'id' });
            if (error) throw error;
        }

        return { success: true };
    } catch (error: any) {
        console.error("Restore failed:", error);
        return { success: false, error: error.message || "Unknown restore error" };
    }
}

// Download helper
export function downloadSnapshot(snapshot: DatabaseSnapshot, filename?: string) {
    const name = filename || `snapshot_${new Date().toISOString().split('T')[0]}.json`;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
