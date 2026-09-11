import { supabase } from "@/lib/supabase";
import { diag } from "@/lib/diag";
import type { Order } from "@/types/order";

/**
 * Server-side order search, and the risk lookups the list no longer carries.
 *
 * These live outside `order-repository.ts` on purpose. They arrived from the
 * dashboard-audit branch, which had diverged ~140 commits from `main`; grafting
 * them into that file meant reconciling two heavily-edited copies of a large
 * module. A separate module has the same callers, no merge surface, and makes
 * it obvious which queries came from that work.
 *
 * `searchOrders` / `searchCustomers` / `searchProducts` back the global search
 * and chat's #reference picker — they replaced filtering the whole order book in
 * the browser, and lean on the `search_orders` RPC (migration 20260909130000).
 * `findRiskData` / `findRiskFor` fetch `risk_data` separately so the list query
 * does not have to join `customer_trust` for every row.
 */

export interface OrderSearchRow {
    id: string;
    order_id: string;
    customer_name: string | null;
    phone: string | null;
    city: string | null;
    status: string;
    price: number | null;
    governorate_code: string | null;
    created_at: string;
}

export interface CustomerSearchRow {
    customer_phone: string;
    latest_name: string | null;
    total_orders: number;
}

export interface ProductSearchRow {
    id: string;
    name: string;
    price: number | null;
}

export type OrderRisk = NonNullable<Order["risk_data"]>;

export const orderSearchRepository = {
    async findRiskData(): Promise<Map<string, OrderRisk>> {
        const _t = performance.now();
        const { data, error } = await supabase
            .from("v_orders_with_risk")
            .select("id, risk_data")
            .eq("is_archived", false);
        if (error) {
            diag.log(`[Diag:Repo] findRiskData ERR err=${error.message}`);
            throw error;
        }
        const map = new Map<string, OrderRisk>();
        for (const row of (data ?? []) as { id: string; risk_data: OrderRisk | null }[]) {
            if (row.risk_data) map.set(row.id, row.risk_data);
        }
        diag.log(`[Diag:Repo] findRiskData OK rows=${map.size} took=${(performance.now() - _t).toFixed(1)}ms`);
        return map;
    },

    /**
     * Server-side order search. Returns matches, not the book.
     *
     * PERF-D1: global-search and chat's #ref search each filtered all ~4,700
     * orders in the browser, which is why the whole book had to be resident on
     * every route. See migration 20260909130000 — the 2-character floor and the
     * 50-row clamp are enforced in SQL, not here.
     */
    async searchOrders(term: string, limit = 20): Promise<OrderSearchRow[]> {
        const { data, error } = await supabase.rpc("search_orders", { p_term: term, p_limit: limit });
        if (error) throw error;
        return (data ?? []) as OrderSearchRow[];
    },

    /**
     * Customer search, from the tenant-scoped aggregates view.
     *
     * This also FIXES a defect: the old client-side version counted a customer's
     * orders from whatever happened to be loaded, so "N orders" was the number of
     * matches, not the number of orders. `total_orders` is the real count.
     */
    async searchCustomers(term: string, limit = 20): Promise<CustomerSearchRow[]> {
        const t = term.trim();
        if (t.length < 2) return [];
        const { data, error } = await supabase
            .from("customer_aggregates")
            .select("customer_phone, latest_name, total_orders")
            .or(`latest_name.ilike.%${t}%,customer_phone.ilike.%${t}%`)
            .limit(limit);
        if (error) throw error;
        return (data ?? []) as CustomerSearchRow[];
    },

    /**
     * Product search, from `products`.
     *
     * The old version scanned every order's `items` array to discover product
     * names — it could only find a product that had already been ordered, and it
     * priced it from the line rather than the catalogue.
     */
    async searchProducts(term: string, limit = 20): Promise<ProductSearchRow[]> {
        const t = term.trim();
        if (t.length < 2) return [];
        const { data, error } = await supabase
            .from("products")
            .select("id, name, price")
            .eq("is_archived", false)
            .ilike("name", `%${t}%`)
            .limit(limit);
        if (error) throw error;
        return (data ?? []) as ProductSearchRow[];
    },

    /** One order's risk assessment — for detail panels, which need exactly one. */
    async findRiskFor(orderId: string): Promise<OrderRisk | null> {
        const { data, error } = await supabase
            .from("v_orders_with_risk")
            .select("risk_data")
            .eq("id", orderId)
            .maybeSingle();
        if (error) throw error;
        return ((data as { risk_data: OrderRisk | null } | null)?.risk_data) ?? null;
    }
};
