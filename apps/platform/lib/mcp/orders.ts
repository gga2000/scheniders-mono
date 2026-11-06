import { z } from "zod";
import type { McpCaller } from "@/lib/mcp/caller";
import { McpToolError } from "@/lib/mcp/tool";
import { ORDER_STATUSES } from "@/lib/order-status-labels";
import { ORDER_READ_COLUMNS } from "@/lib/repositories/order-columns";
import { normalizeOrder } from "@/lib/order-normalize-utils";
import { findExactGovernorate, getGovernorateByCode } from "@/lib/address-validator";
import { normalizeIraqiPhone } from "@/lib/order-utils";
import { isValidIraqiMobile } from "@scheniders/shared";
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

/** Rows the order-search RPC returns at most; a full page means older matches may be missing. */
export const SEARCH_LIMIT = 200;

/**
 * Find one live order in the caller's store. The tenant filter is explicit on
 * top of RLS: a user who belongs to several stores is acting in one of them.
 */
export async function findOrder(caller: McpCaller, ref: string): Promise<Order> {
    const [order] = await findOrders(caller, [ref]);
    return order;
}

/**
 * Find several live orders in the caller's store with at most two queries (by
 * id and by number), returned in the order given. Fails as a whole, naming
 * every reference that matches no order or more than one.
 */
export async function findOrders(caller: McpCaller, refs: string[]): Promise<Order[]> {
    const cleaned = refs.map((ref) => ({ ref, key: ref.replace(/^#/, "") }));
    const ids = cleaned.filter((r) => UUID.safeParse(r.key).success).map((r) => r.key);
    const numbers = cleaned.filter((r) => !UUID.safeParse(r.key).success).map((r) => r.key);

    const lookup = async (column: "id" | "order_id", keys: string[]): Promise<Order[]> => {
        if (keys.length === 0) return [];
        const { data, error } = await caller.db
            .from("orders")
            .select(ORDER_READ_COLUMNS)
            .eq("tenant_id", caller.tenantId)
            .is("deleted_at", null)
            .in(column, keys);
        if (error) throw error;
        return ((data ?? []) as unknown as Order[]).map(normalizeOrder);
    };
    const [byId, byNumber] = await Promise.all([lookup("id", ids), lookup("order_id", numbers)]);

    const missing: string[] = [];
    const ambiguous: string[] = [];
    const found = cleaned.flatMap(({ ref, key }) => {
        const matches = UUID.safeParse(key).success
            ? byId.filter((o) => o.id === key)
            : byNumber.filter((o) => o.order_id === key);
        if (matches.length === 0) missing.push(ref);
        if (matches.length > 1) ambiguous.push(ref);
        return matches.length === 1 ? matches : [];
    });
    if (missing.length > 0) throw new McpToolError(`No order ${missing.join(", ")} in this store.`);
    if (ambiguous.length > 0) {
        throw new McpToolError(`More than one order matches ${ambiguous.join(", ")}; use the order id instead.`);
    }
    return found;
}

/**
 * An Iraqi mobile in the form orders store it (07XXXXXXXXX), or a refusal: an
 * order the courier cannot call is not deliverable.
 */
export function orderPhone(raw: string, field: string): string {
    const phone = normalizeIraqiPhone(raw);
    if (!isValidIraqiMobile(phone)) {
        throw new McpToolError(`${field} "${raw}" is not an Iraqi mobile number (07XX XXX XXXX).`);
    }
    return phone;
}

const LEADING_SEPARATORS = /^[\s/\\\-–—•·,،:]+/;

/**
 * The orders page shows `city • address_details`, so an address that starts
 * with the governorate repeats it ("الديوانية • الديوانية / قضاء الشامية").
 * Drops one leading mention of the order's governorate (name or alias, with an
 * optional "محافظة") and its separator; an address that is only the governorate
 * is kept as is.
 */
export function stripLeadingGovernorate(address: string, governorateCode: string): string {
    const gov = getGovernorateByCode(governorateCode);
    const text = address.trim();
    if (!gov) return text;
    const names = [gov.nameAr, gov.nameEn, ...gov.aliases]
        .map((n) => n.trim())
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
    const lower = text.toLowerCase();
    const body = lower.startsWith("محافظة ") ? text.slice("محافظة ".length).trimStart() : text;
    const bodyLower = body.toLowerCase();
    for (const name of names) {
        if (!bodyLower.startsWith(name.toLowerCase())) continue;
        const rest = body.slice(name.length);
        // Whole word only: "البصرة" must not eat the start of "البصرة2" style names.
        if (rest !== "" && !LEADING_SEPARATORS.test(rest)) continue;
        const remainder = rest.replace(LEADING_SEPARATORS, "").trim();
        return remainder === "" ? text : remainder;
    }
    return text;
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
