import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderFilters } from "@/types/order";

/**
 * Status counts, filter options and headline stats, computed by the server.
 *
 * The dashboard reads all of it. The orders page no longer reads
 * `status_counts`: its chips are counted over the rows the list shows, with
 * the list's own predicates (lib/orders/order-chips.ts), because these were
 * never invalidated by list writes and used different rules for completed and
 * refunds (the 219-vs-119 incident, 2026-10-17).
 *
 * These were derived by scanning every loaded order, which is a large part of
 * why the page had to download the whole book. Worse, they are the numbers a
 * merchant trusts: once the fetch is windowed, deriving them from the loaded
 * rows would report "12 confirmed" while the filter actually matches 300, and
 * look entirely plausible doing it.
 *
 * `get_orders_aggregates` reproduces the client semantics deliberately — revenue
 * follows lib/order-revenue.ts (tests excluded, today bucketed on the day it was
 * earned) — so switching the source changes no number the merchant sees.
 */
export type OrdersAggregates = {
    status_counts: Record<string, number>;
    stats: Record<string, number>;
    cities: string[];
    products: string[];
    total_risk_count: number;
};

/**
 * The get_orders_aggregates arguments for these filters. Only the filters the
 * RPC understands: free-text search is NOT among them, it still runs
 * client-side over the loaded rows, so aggregates stay unfiltered by it rather
 * than silently disagreeing with the list.
 */
export function ordersAggregatesParams(tenantId: string | null, filters: OrderFilters) {
    return {
        _tenant_id: tenantId,
        _date_from: filters.dateFrom ?? null,
        _date_to: filters.dateTo ?? null,
        _city: filters.city ?? null,
        _product: filters.product ?? null,
        _priority: filters.priority ?? null,
        _payment_status: filters.paymentStatus ?? null,
        _is_return: filters.isReturn ?? null,
        _order_type: (filters as { orderType?: string }).orderType ?? null,
    };
}

export type OrdersAggregatesParams = ReturnType<typeof ordersAggregatesParams>;

export function ordersAggregatesKey(params: OrdersAggregatesParams) {
    return ["orders", "aggregates", params] as const;
}

/** Status counts, filter options and headline stats, computed by the server as the client's user. */
export async function readOrdersAggregates(client: SupabaseClient, params: OrdersAggregatesParams): Promise<OrdersAggregates> {
    const { data, error } = await client.rpc("get_orders_aggregates", params);
    if (error) throw error;
    return data as unknown as OrdersAggregates;
}
