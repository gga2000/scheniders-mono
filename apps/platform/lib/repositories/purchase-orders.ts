import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { PURCHASE_ORDER_ITEM_READ_COLUMNS } from "./purchase-costs";

/**
 * Purchase order writes go through three database functions
 * (20261101050000_purchase_order_lifecycle.sql): each one is a single
 * transaction, numbers and totals are computed in the database, and received
 * stock is added through adjust_product_stock so it lands in the stock history.
 */

export interface NewPurchaseOrderLine {
    productId: string;
    variantId?: string | null;
    quantityOrdered: number;
    unitCost: number;
}

export interface NewPurchaseOrder {
    tenantId: string;
    supplierName: string;
    supplierContact?: string | null;
    supplierEmail?: string | null;
    expectedDate?: string | null;
    notes?: string | null;
    lines: NewPurchaseOrderLine[];
}

const createdSchema = z.array(
    z.object({ id: z.string(), po_number: z.string(), total_cost: z.coerce.number() })
);

export async function createPurchaseOrder(
    po: NewPurchaseOrder
): Promise<{ id: string; poNumber: string; totalCost: number }> {
    const { data, error } = await supabase.rpc("create_purchase_order", {
        p_tenant_id: po.tenantId,
        p_supplier_name: po.supplierName,
        p_items: po.lines.map((line) => ({
            product_id: line.productId,
            variant_id: line.variantId ?? null,
            quantity_ordered: line.quantityOrdered,
            unit_cost: line.unitCost,
        })),
        p_expected_date: po.expectedDate ?? null,
        p_notes: po.notes ?? null,
        p_supplier_contact: po.supplierContact ?? null,
        p_supplier_email: po.supplierEmail ?? null,
    });
    if (error) throw error;
    const [created] = createdSchema.parse(data);
    if (!created) throw new Error("create_purchase_order returned no row");
    return { id: created.id, poNumber: created.po_number, totalCost: created.total_cost };
}

export type PurchaseOrderTransition = "sent" | "confirmed" | "cancelled";

export async function setPurchaseOrderStatus(poId: string, status: PurchaseOrderTransition): Promise<void> {
    const { error } = await supabase.rpc("set_purchase_order_status", {
        p_po_id: poId,
        p_status: status,
    });
    if (error) throw error;
}

export interface ReceivedLine {
    itemId: string;
    quantity: number;
    /** Real invoice price per unit (whole dinars); replaces the PO line price. */
    unitCost?: number;
}

/** Adds the received quantities to stock; returns the PO's new status (partial or received). */
export async function receivePurchaseOrder(poId: string, lines: ReceivedLine[]): Promise<"partial" | "received"> {
    const { data, error } = await supabase.rpc("receive_purchase_order", {
        p_po_id: poId,
        p_lines: lines.map((line) => ({ item_id: line.itemId, quantity: line.quantity, unit_cost: line.unitCost ?? null })),
    });
    if (error) throw error;
    return z.enum(["partial", "received"]).parse(data);
}

const lineSchema = z.object({
    id: z.string(),
    product_name: z.string(),
    variant_name: z.string().nullable(),
    sku: z.string().nullable(),
    quantity_ordered: z.number(),
    quantity_received: z.number().nullable(),
});

export interface PurchaseOrderLine {
    id: string;
    productName: string;
    variantName: string | null;
    sku: string | null;
    quantityOrdered: number;
    quantityReceived: number;
}

export async function fetchPurchaseOrderLines(poId: string): Promise<PurchaseOrderLine[]> {
    const { data, error } = await supabase
        .from("purchase_order_items")
        .select(PURCHASE_ORDER_ITEM_READ_COLUMNS)
        .eq("po_id", poId)
        .order("created_at", { ascending: true });
    if (error) throw error;
    return z
        .array(lineSchema.passthrough())
        .parse(data ?? [])
        .map((row) => ({
            id: row.id,
            productName: row.product_name,
            variantName: row.variant_name,
            sku: row.sku,
            quantityOrdered: row.quantity_ordered,
            quantityReceived: row.quantity_received ?? 0,
        }));
}
