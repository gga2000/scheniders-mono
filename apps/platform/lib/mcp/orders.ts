import { z } from "zod";
import type { McpCaller } from "@/lib/mcp/caller";
import { McpToolError } from "@/lib/mcp/tool";
import { ORDER_STATUSES } from "@/lib/order-status-labels";
import { ORDER_READ_COLUMNS } from "@/lib/repositories/order-columns";
import { normalizeOrder } from "@/lib/order-normalize-utils";
import { findExactGovernorate, getGovernorateByCode } from "@/lib/address-validator";
import type { Order } from "@/types/order";

export const orderStatusSchema = z.enum(ORDER_STATUSES);

/** An order as merchants refer to it: its visible number ("SC-1234"), or the row id. */
export const orderRefSchema = z
    .string()
    .trim()
    .min(1)
    .max(64)
    .describe('The order number as shown in the app (for example "1234" or "RTN-1234-1"), or the order id.');

const UUID = z.string().uuid();

/**
 * Find one live order in the caller's store. The tenant filter is explicit on
 * top of RLS: a user who belongs to several stores is acting in one of them.
 */
export async function findOrder(caller: McpCaller, ref: string): Promise<Order> {
    const cleaned = ref.replace(/^#/, "");
    let query = caller.db
        .from("orders")
        .select(ORDER_READ_COLUMNS)
        .eq("tenant_id", caller.tenantId)
        .is("deleted_at", null);
    query = UUID.safeParse(cleaned).success ? query.eq("id", cleaned) : query.eq("order_id", cleaned);

    const { data, error } = await query.limit(2);
    if (error) throw error;
    if (!data || data.length === 0) throw new McpToolError(`No order ${ref} in this store.`);
    if (data.length > 1) throw new McpToolError(`More than one order matches ${ref}; use the order id instead.`);
    return normalizeOrder(data[0] as unknown as Order);
}

export const governorateInputSchema = z
    .string()
    .trim()
    .min(2)
    .max(40)
    .describe('Governorate as a code, English or Arabic name, e.g. "BGD", "Basra", "النجف"');

/**
 * The governorate the orders page would store: `city` holds the Arabic name and
 * `governorate_code` the address-validator code, as the order editor sets them.
 */
export function resolveOrderGovernorate(input: string): { city: string; governorate_code: string } {
    const gov = getGovernorateByCode(input.trim().toUpperCase()) ?? findExactGovernorate(input);
    if (!gov) throw new McpToolError(`Unknown governorate "${input}".`);
    return { city: gov.nameAr, governorate_code: gov.code };
}
