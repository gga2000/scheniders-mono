import { supabase, type Order, type PrintBatch } from "@/lib/supabase";
import type { OrderStatus } from "@/types/order";
import { ORDER_READ_COLUMNS } from "@/lib/repositories/order-columns";

/** What a recorded run was: a label print, or a courier hand-off file. */
export type RunKind = "labels" | "prime" | "waseet";

/** Hand-off runs are named "Prime Export dd/mm/yyyy" / "Al-Waseet Export …" by both export paths. */
export function runKind(batch: Pick<PrintBatch, "name">): RunKind {
    if (batch.name.startsWith("Prime Export")) return "prime";
    if (batch.name.startsWith("Al-Waseet Export")) return "waseet";
    return "labels";
}

// Ids go in the request URL; chunks keep each one well under the gateway's URL limit.
const ID_CHUNK = 150;

function chunks<T>(items: readonly T[]): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += ID_CHUNK) out.push(items.slice(i, i + ID_CHUNK));
    return out;
}

/**
 * The orders of a recorded run, in the order they were run. The desk only holds
 * orders still waiting to ship, so most of an old run is read by id; row-level
 * security keeps the read inside the store. Deleted orders are left out.
 */
export async function ordersOfRun(batch: Pick<PrintBatch, "order_ids">, known: readonly Order[]): Promise<Order[]> {
    const byId = new Map(known.map((o) => [o.id, o]));
    const missing = batch.order_ids.filter((id) => !byId.has(id));
    const pages = await Promise.all(
        chunks(missing).map(async (ids) => {
            const { data, error } = await supabase.from("orders").select(ORDER_READ_COLUMNS).is("deleted_at", null).in("id", ids);
            if (error) throw error;
            return (data ?? []) as unknown as Order[];
        })
    );
    for (const order of pages.flat()) byId.set(order.id, order);
    return batch.order_ids.map((id) => byId.get(id)).filter((o): o is Order => o !== undefined);
}

/** Where each order of these runs stands now, by order id. */
export async function runOrderStatuses(batches: readonly Pick<PrintBatch, "order_ids">[]): Promise<Map<string, OrderStatus>> {
    const ids = [...new Set(batches.flatMap((b) => b.order_ids))];
    const pages = await Promise.all(
        chunks(ids).map(async (part) => {
            const { data, error } = await supabase.from("orders").select("id, status").in("id", part);
            if (error) throw error;
            return (data ?? []) as { id: string; status: OrderStatus }[];
        })
    );
    return new Map(pages.flat().map((row) => [row.id, row.status]));
}

/** How a run's orders are doing: delivered, still out, or came back. Orders since deleted are not counted. */
export interface RunProgress {
    delivered: number;
    out: number;
    back: number;
    waiting: number;
}

const DELIVERED: ReadonlySet<OrderStatus> = new Set(["delivered", "completed"]);
const BACK: ReadonlySet<OrderStatus> = new Set(["rejected", "return_pending", "refund_delivered", "refund_failed", "cancelled"]);

export function runProgress(batch: Pick<PrintBatch, "order_ids">, statuses: ReadonlyMap<string, OrderStatus>): RunProgress {
    const progress: RunProgress = { delivered: 0, out: 0, back: 0, waiting: 0 };
    for (const id of batch.order_ids) {
        const status = statuses.get(id);
        if (status === undefined) continue;
        if (DELIVERED.has(status)) progress.delivered += 1;
        else if (BACK.has(status)) progress.back += 1;
        else if (status === "in_transit") progress.out += 1;
        else progress.waiting += 1;
    }
    return progress;
}
