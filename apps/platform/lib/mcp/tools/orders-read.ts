import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerTool } from "@/lib/mcp/tool";
import { findOrder, governorateInputSchema, orderRefSchema, orderStatusSchema, resolveOrderGovernorate, SEARCH_LIMIT } from "@/lib/mcp/orders";
import {
    ORDER_SUMMARY_COLUMNS,
    baghdadDayEnd,
    baghdadDayStart,
    baghdadTime,
    iqd,
    itemsText,
    orderLine,
    statusText,
    type OrderSummaryRow,
} from "@/lib/mcp/format";

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export function registerOrderReadTools(server: McpServer): void {
    registerTool(server, {
        name: "search_orders",
        title: "Search orders",
        kind: "read",
        description:
            "Find orders in the store. `query` matches order number, customer name or phone (any format: 07…, +9647…, 7…). " +
            "Filter by status, governorate and creation date (Baghdad days, inclusive). Newest first.",
        input: z.object({
            query: z.string().trim().min(1).max(100).optional(),
            status: z.array(orderStatusSchema).max(14).optional(),
            governorate: governorateInputSchema.optional(),
            from: daySchema.optional(),
            to: daySchema.optional(),
            include_archived: z.boolean().default(false),
            limit: z.number().int().min(1).max(50).default(20),
        }),
        async run(caller, input) {
            const governorate = input.governorate ? resolveOrderGovernorate(input.governorate) : undefined;

            let rows: OrderSummaryRow[];
            let total: number | null = null;
            let capped = false;

            if (input.query) {
                // The app's own search: number, name and every phone format.
                const { data, error } = await caller.db.rpc("search_orders_v2", {
                    p_tenant_id: caller.tenantId,
                    p_term: input.query,
                    p_limit: SEARCH_LIMIT,
                });
                if (error) throw error;
                const found = (data ?? []) as (OrderSummaryRow & { is_archived?: boolean; deleted_at: string | null })[];
                capped = found.length >= SEARCH_LIMIT;
                rows = found.filter((row) => {
                    // The search RPC also returns orders in the trash.
                    if (row.deleted_at !== null) return false;
                    if (!input.include_archived && row.is_archived) return false;
                    if (input.status && !input.status.includes(row.status)) return false;
                    if (governorate && row.city !== governorate.city) return false;
                    if (input.from && row.created_at < baghdadDayStart(input.from)) return false;
                    if (input.to && row.created_at >= baghdadDayEnd(input.to)) return false;
                    return true;
                });
                total = rows.length;
                rows = rows.slice(0, input.limit);
            } else {
                let q = caller.db
                    .from("orders")
                    .select(ORDER_SUMMARY_COLUMNS, { count: "exact" })
                    .eq("tenant_id", caller.tenantId)
                    .is("deleted_at", null);
                if (!input.include_archived) q = q.eq("is_archived", false);
                if (input.status) q = q.in("status", input.status);
                if (governorate) q = q.eq("city", governorate.city);
                if (input.from) q = q.gte("created_at", baghdadDayStart(input.from));
                if (input.to) q = q.lt("created_at", baghdadDayEnd(input.to));
                const { data, error, count } = await q.order("created_at", { ascending: false }).limit(input.limit);
                if (error) throw error;
                rows = (data ?? []) as unknown as OrderSummaryRow[];
                total = count;
            }

            if (rows.length === 0) return "No orders match.";
            const header =
                `${total ?? rows.length} order(s) match; showing ${rows.length}.` +
                (capped ? ` The text search stops at its ${SEARCH_LIMIT} closest matches, so older orders may be missing; narrow the query to be sure.` : "");
            return [header, ...rows.map((o) => orderLine(o, true))].join("\n");
        },
    });

    registerTool(server, {
        name: "get_order",
        title: "Open an order",
        kind: "read",
        description: "Full details of one order: customer, address, items, money, delivery, notes and status history.",
        input: z.object({ order: orderRefSchema }),
        async run(caller, { order: ref }) {
            const o = await findOrder(caller, ref);
            const [history, notes] = await Promise.all([
                caller.db
                    .from("order_status_history")
                    .select("from_status, to_status, changed_by, changed_at, notes")
                    .eq("tenant_id", caller.tenantId)
                    .eq("order_id", o.id)
                    .order("changed_at", { ascending: true }),
                caller.db
                    .from("order_notes")
                    .select("note, created_by, created_at")
                    .eq("tenant_id", caller.tenantId)
                    .eq("order_id", o.id)
                    .order("created_at", { ascending: true }),
            ]);
            if (history.error) throw history.error;
            if (notes.error) throw notes.error;

            const lines = [
                `Order #${o.order_id} (id ${o.id})${o.is_return ? " — return" : ""}${o.is_replacement ? " — replacement" : ""}`,
                `Status: ${statusText(o.status)}${o.rejection_reason ? ` — reason: ${o.rejection_reason}` : ""}`,
                `Created: ${baghdadTime(o.created_at)}${o.scheduled_date ? ` | scheduled ${o.scheduled_date}` : ""}`,
                `Customer: ${o.customer_name} | ${o.phone}${o.secondary_phone ? ` / ${o.secondary_phone}` : ""}`,
                `Address: ${o.city ?? "-"}, ${o.address_details ?? "-"}`,
                `Items: ${itemsText(o.items)}`,
                `Money: items ${iqd(o.price)} (after discount ${iqd(o.discount_amount)}) + delivery ${iqd(o.delivery_fee)} = COD ${iqd((o.price ?? 0) + (o.delivery_fee ?? 0))}`,
                `Delivery: ${o.delivery_company ?? "not sent"}${o.waseet_qr_id ? ` | Waseet ${o.waseet_qr_id} ${o.waseet_status_text ?? ""}` : ""}`,
                `Notes: ${o.notes || "-"} | Internal: ${o.internal_notes || "-"}`,
                `Version: ${o.version}`,
                "",
                "Status history:",
                ...(history.data ?? []).map(
                    (h) => `  ${baghdadTime(h.changed_at)} ${h.from_status ?? "-"} → ${h.to_status} by ${h.changed_by ?? "?"}${h.notes ? ` (${h.notes})` : ""}`,
                ),
                "Order notes:",
                ...((notes.data ?? []).length === 0
                    ? ["  none"]
                    : (notes.data ?? []).map((n) => `  ${baghdadTime(n.created_at)} ${n.created_by ?? "?"}: ${n.note}`)),
            ];
            return lines.join("\n");
        },
    });
}
