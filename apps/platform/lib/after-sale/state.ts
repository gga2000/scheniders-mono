import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Order } from "@/types/order";
import { refundHistory, type AfterSaleChild, type BackLine } from "@/lib/refunds/refund-history";
import { refundableLines, type RefundableLine } from "@/lib/refunds/refund-math";

/** A refund order still on its way: no second refund until it settles. */
const SETTLED_REFUND_STATUSES = new Set(["refund_delivered", "refund_failed", "rejected", "cancelled"]);

const afterSaleSettingsSchema = z
    .object({ after_sale: z.object({ default_fee_kept: z.int().min(0) }).partial().optional() })
    .loose();

export interface AfterSaleState {
    lines: RefundableLine[];
    /** tenants.settings.after_sale.default_fee_kept; 0 when the store set none. */
    defaultPickupFee: number;
    /** A refund of this order is still open. */
    hasOpenRefund: boolean;
}

/**
 * What a refund or replacement of one original order starts from: every line
 * with what is left to take back (counted the way the database counts it),
 * the store's default pickup fee, and whether a refund is already under way.
 * Read with the caller's own client, so RLS applies on top of the tenant filter.
 */
export async function loadAfterSaleState(
    db: SupabaseClient,
    tenantId: string,
    order: Pick<Order, "id" | "items" | "price">,
): Promise<AfterSaleState> {
    const [children, backLines, tenant] = await Promise.all([
        db
            .from("orders")
            .select("id, status, items, is_return")
            .eq("tenant_id", tenantId)
            .eq("original_order_id", order.id)
            .or("is_return.eq.true,is_replacement.eq.true")
            .is("deleted_at", null),
        db
            .from("after_sale_items")
            .select("order_id, original_line_index, qty, amount")
            .eq("tenant_id", tenantId)
            .eq("original_order_id", order.id)
            .eq("direction", "back"),
        db.from("tenants").select("settings").eq("id", tenantId).maybeSingle(),
    ]);
    if (children.error) throw children.error;
    if (backLines.error) throw backLines.error;
    if (tenant.error) throw tenant.error;

    const kids = (children.data ?? []) as Array<AfterSaleChild & { is_return: boolean | null }>;
    const items = order.items ?? [];
    const history = refundHistory(items, order.price, kids, (backLines.data ?? []) as BackLine[]);
    const settings = afterSaleSettingsSchema.safeParse(tenant.data?.settings ?? {});

    return {
        lines: refundableLines(items, order.price, history),
        defaultPickupFee: settings.success ? settings.data.after_sale?.default_fee_kept ?? 0 : 0,
        hasOpenRefund: kids.some((k) => k.is_return && !SETTLED_REFUND_STATUSES.has(k.status)),
    };
}
