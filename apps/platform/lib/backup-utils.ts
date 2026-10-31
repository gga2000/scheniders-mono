import { supabase } from "@/lib/supabase";
import { RESTORE_ORDERS_BATCH_SIZE, pickOrderWriteColumns } from "@/lib/repositories/order-columns";
import { restoreOrdersAction } from "@/app/actions/orders";

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
