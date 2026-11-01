import { supabase } from "@/lib/supabase";

interface BatchCostRow {
    id: string;
    cost_per_unit: number | null;
}

interface PurchaseOrderCostRow {
    id: string;
    total_cost: number | null;
}

/**
 * product_batches.cost_per_unit, purchase_orders.total_cost and
 * purchase_order_items.unit_cost are not readable columns (migration
 * 20261101010100): reads name the columns below and get cost from these
 * functions, which return rows only to members who may see cost
 * (products.manage or system.financials.view). Anyone else gets an empty map,
 * so a cost reads as unknown, never as 0.
 * purchase-select-guard.test.ts keeps reads on these lists.
 */
export const BATCH_READ_COLUMNS =
    "id, product_id, variant_id, batch_number, expiry_date, quantity, received_at, notes, status, tenant_id, created_at";

export const PURCHASE_ORDER_READ_COLUMNS =
    "id, tenant_id, po_number, supplier_name, supplier_contact, supplier_email, status, notes, expected_date, sent_at, received_at, created_by, created_at, updated_at";

export const PURCHASE_ORDER_ITEM_READ_COLUMNS =
    "id, po_id, product_id, variant_id, product_name, variant_name, sku, quantity_ordered, quantity_received, notes, created_at";

/** Cost per unit of each batch of a product, by batch id. */
export async function fetchBatchCosts(productId: string): Promise<Map<string, number | null>> {
    const { data, error } = await supabase.rpc("product_batch_costs", { p_product_id: productId });
    if (error) throw error;
    return new Map(((data ?? []) as BatchCostRow[]).map((row) => [row.id, row.cost_per_unit]));
}

/** Total cost of each purchase order of the store, by purchase order id. */
export async function fetchPurchaseOrderCosts(tenantId: string): Promise<Map<string, number | null>> {
    const { data, error } = await supabase.rpc("purchase_order_costs", { p_tenant_id: tenantId });
    if (error) throw error;
    return new Map(((data ?? []) as PurchaseOrderCostRow[]).map((row) => [row.id, row.total_cost]));
}
