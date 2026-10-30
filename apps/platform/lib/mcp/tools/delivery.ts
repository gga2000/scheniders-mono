import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpCaller } from "@/lib/mcp/caller";
import { McpToolError, actorName, registerTool, requireWriter } from "@/lib/mcp/tool";
import { findOrder, findOrders, orderRefSchema } from "@/lib/mcp/orders";
import { findProduct, pickVariant, productRefSchema, variantRefSchema } from "@/lib/mcp/products";
import { baghdadTime, baghdadToday, iqd, statusText } from "@/lib/mcp/format";
import { COURIER_LABELS, courierSheet, type CourierCompany } from "@/lib/shipping/courier-sheets";
import { computeCodAmount } from "@/lib/order-money";
import { isAdminRole } from "@/lib/permissions";
import { partitionByShipDay } from "@/lib/order-bulk-scope";
import { loadAfterSaleState } from "@/lib/after-sale/state";
import { createAfterSaleOrder, receiveAfterSaleItem } from "@/lib/after-sale/create";
import { previewRefund, type RefundableLine, type RefundSelection } from "@/lib/refunds/refund-math";
import { previewReplacement } from "@/lib/after-sale/replacement-math";
import type { Order } from "@/types/order";

/** One courier batch holds at most this many orders, the order-search page size. */
const MAX_BATCH_ORDERS = 200;

/** Each courier sheet's governorate column; empty means the courier cannot route the parcel. */
const GOVERNORATE_COLUMN: Record<CourierCompany, string> = { prime: "شفرة المحافظة", waseet: "المحافظة" };

/** Child orders that never left or were called off: nothing is coming back. */
const DEAD_CHILD_STATUSES = ["cancelled", "rejected", "refund_failed"];

const CONDITION_EFFECT = {
    sealed: "back in stock",
    opened_usable: "added to open-box stock",
    damaged: "written off",
    missing: "marked not returned",
} as const;

const lineSchema = z.object({
    line: z.number().int().min(1).describe("The line number as listed in the preview (1 is the order's first item)."),
    qty: z.number().int().min(1),
});

const afterSaleLines = z
    .array(lineSchema)
    .min(1)
    .max(50)
    .optional()
    .describe("Which items come back. Leave out to take back everything not already refunded or replaced.");

/** `dd/mm/yyyy`, the date format of the batch names the orders page writes. */
function batchDate(): string {
    const [year, month, day] = baghdadToday().split("-");
    return `${day}/${month}/${year}`;
}

/** An original sale that can be refunded or replaced, with what is left of each line. */
async function originalSale(caller: McpCaller, ref: string) {
    const order = await findOrder(caller, ref);
    if (order.is_return || order.is_replacement) {
        throw new McpToolError(`#${order.order_id} is itself a refund or replacement; start from the original sale.`);
    }
    if (order.status !== "delivered" && order.status !== "completed") {
        throw new McpToolError(`Only a delivered order can be refunded or replaced; #${order.order_id} is ${statusText(order.status)}.`);
    }
    const state = await loadAfterSaleState(caller.db, caller.tenantId, order);
    return { order, ...state };
}

/** The chosen lines, or every line with units left; refuses lines that do not exist or are used up. */
function selectLines(order: Order, lines: RefundableLine[], wanted: z.infer<typeof lineSchema>[] | undefined): RefundSelection[] {
    if (!wanted) {
        const all = lines.filter((l) => l.remainingQuantity > 0).map((l) => ({ index: l.index, quantity: l.remainingQuantity }));
        if (all.length === 0) throw new McpToolError(`Every item of #${order.order_id} was already refunded or replaced.`);
        return all;
    }
    const seen = new Set<number>();
    return wanted.map((w) => {
        const line = lines.find((l) => l.index === w.line - 1);
        if (!line) throw new McpToolError(`#${order.order_id} has no line ${w.line}; it has ${lines.length}.`);
        if (seen.has(line.index)) throw new McpToolError(`Line ${w.line} is listed twice.`);
        seen.add(line.index);
        if (w.qty > line.remainingQuantity) {
            throw new McpToolError(
                `Line ${w.line} (${line.name}): ${w.qty} asked, ${line.remainingQuantity} left to take back.`,
            );
        }
        return { index: line.index, quantity: w.qty };
    });
}

function linesText(lines: RefundableLine[]): string[] {
    return lines.map(
        (l) =>
            `  ${l.index + 1}. ${l.name} ×${l.quantity}, paid ${iqd(l.paid)}` +
            (l.refundedQuantity > 0 ? `, ${l.refundedQuantity} already taken back` : ""),
    );
}

export function registerDeliveryTools(server: McpServer): void {
    registerTool(server, {
        name: "ship_orders",
        title: "Prepare a courier batch",
        kind: "write",
        description:
            "Put orders in a courier batch for Prime or Al-Waseet, exactly like Export on the orders page: the batch is " +
            "recorded and a link to the courier's upload file is returned (the merchant downloads it signed in to the app; " +
            "the batch also shows on the Printing page for labels). Orders scheduled for a later day are kept back unless " +
            "include_scheduled_later is true. Always returns a preview first; call again with confirm: true. " +
            "It does not change order status: after the courier has the file, ask before moving the orders to in_transit with update_order_status.",
        input: z.object({
            orders: z.array(orderRefSchema).min(1).max(MAX_BATCH_ORDERS),
            company: z.enum(["prime", "waseet"]).describe("prime = Prime, waseet = Al-Waseet"),
            include_scheduled_later: z.boolean().default(false),
            confirm: z.boolean().default(false),
        }),
        async run(caller, input) {
            requireWriter(caller);
            const found = await findOrders(caller, [...new Set(input.orders)]);
            const unique = [...new Map(found.map((o) => [o.id, o])).values()];
            const { shippable, scheduledLater } = partitionByShipDay(unique);
            const orders = input.include_scheduled_later ? unique : shippable;
            const held = input.include_scheduled_later ? [] : scheduledLater;
            if (orders.length === 0) throw new McpToolError("Every order listed is scheduled for a later day; nothing to ship.");

            const label = COURIER_LABELS[input.company];
            const sheet = courierSheet(input.company, orders);
            const cod = orders.reduce((sum, o) => sum + computeCodAmount(o), 0);

            const warnings: string[] = [];
            const notConfirmed = orders.filter((o) => o.status !== "confirmed");
            if (notConfirmed.length > 0) {
                warnings.push(`Not confirmed: ${notConfirmed.map((o) => `#${o.order_id} (${o.status})`).join(", ")}.`);
            }
            const sentBefore = orders.filter((o) => (o.print_count ?? 0) > 0 || !!o.delivery_order_id);
            if (sentBefore.length > 0) {
                warnings.push(`Already printed or sent to a courier before: ${sentBefore.map((o) => `#${o.order_id}`).join(", ")}.`);
            }
            const noGovernorate = orders.filter((_, i) => !sheet.rows[i][GOVERNORATE_COLUMN[input.company]]);
            if (noGovernorate.length > 0) {
                warnings.push(
                    `No governorate the courier can read (fix the address first): ${noGovernorate.map((o) => `#${o.order_id}`).join(", ")}.`,
                );
            }

            const summary = [
                `${label} batch: ${orders.length} order${orders.length === 1 ? "" : "s"}, COD to collect ${iqd(cod)}.`,
                ...orders.map((o) => `  #${o.order_id} ${o.customer_name}, ${o.city || "no city"}: COD ${iqd(computeCodAmount(o))}`),
                ...(held.length > 0
                    ? [`Kept back (scheduled for a later day): ${held.map((o) => `#${o.order_id} (${o.scheduled_date})`).join(", ")}.`]
                    : []),
                ...warnings.map((w) => `⚠ ${w}`),
            ];
            if (!input.confirm) {
                return ["Preview — nothing recorded yet.", ...summary, "Call again with confirm: true to create the batch."].join("\n");
            }

            const cities = [...new Set(orders.map((o) => o.city).filter((c): c is string => !!c))];
            const { data: batch, error } = await caller.db
                .from("print_batches")
                .insert({
                    tenant_id: caller.tenantId,
                    name: `${label} Export ${batchDate()} (Claude)`,
                    order_count: orders.length,
                    // The orders page records the items value here, not the COD.
                    total_value: orders.reduce((sum, o) => sum + Number(o.price || 0), 0),
                    cities,
                    order_ids: orders.map((o) => o.id),
                    invoice_template: input.company,
                    print_type: "invoice",
                })
                .select("id, name")
                .single();
            if (error) throw error;

            return [
                `Created "${batch.name}".`,
                ...summary,
                `Download the ${label} file (sign in to the app if asked): ${caller.appUrl}/shipping-export/${batch.id}`,
                "Labels: Printing page, under batches.",
                "Order statuses are unchanged. Ask before moving these orders to in_transit.",
            ].join("\n");
        },
    });

    registerTool(server, {
        name: "refund_order",
        title: "Refund a delivered order",
        kind: "write",
        description:
            "Open a refund (RTN- order) for items of a delivered order, like the Refund button: the courier picks the items up " +
            "and hands the customer the money. Amounts come from what the customer paid, never from Claude. " +
            "customer_keeps (nothing picked up) is for owners and admins only and needs a note. " +
            "Always returns a preview first, listing the order's lines; call again with confirm: true.",
        input: z
            .object({
                order: orderRefSchema,
                lines: afterSaleLines,
                customer_keeps: z.boolean().default(false).describe("True when the customer keeps the items and nothing is picked up."),
                keep_pickup_fee: z.boolean().default(true).describe("Keep the store's pickup fee from the refund (only when the courier picks up)."),
                reason: z.string().trim().min(2).max(200).optional(),
                note: z.string().trim().max(1000).optional(),
                confirm: z.boolean().default(false),
            })
            .refine((v) => !v.customer_keeps || !!v.note, { message: "A note is required when the customer keeps the items", path: ["note"] }),
        async run(caller, input) {
            requireWriter(caller);
            // Paying out with nothing coming back is for owners and admins (the app's rule).
            if (input.customer_keeps && !isAdminRole(caller.role)) {
                throw new McpToolError("Only an owner or admin can refund without a pickup.");
            }
            const { order, lines, defaultPickupFee, hasOpenRefund } = await originalSale(caller, input.order);
            if (hasOpenRefund) {
                throw new McpToolError(`A refund of #${order.order_id} is still open; a second one waits until it settles.`);
            }
            const selection = selectLines(order, lines, input.lines);
            const expectsBack = !input.customer_keeps;
            const preview = previewRefund(lines, selection, expectsBack && input.keep_pickup_fee ? defaultPickupFee : 0);

            const summary = [
                `Refund of #${order.order_id} (${order.customer_name}). Order lines:`,
                ...linesText(lines),
                "Taking back:",
                ...preview.lines.map((l) => `  ${l.index + 1}. ${l.name} ×${l.quantity}: ${iqd(l.amount)}`),
                `Items ${iqd(preview.itemsTotal)} − pickup fee kept ${iqd(preview.deductions)} = customer receives ${iqd(preview.customerReceives)}.`,
                expectsBack ? "The courier picks the items up." : "⚠ The customer keeps the items; nothing is picked up.",
            ];
            if (!input.confirm) {
                return ["Preview — nothing created yet.", ...summary, "Call again with confirm: true to create the refund."].join("\n");
            }

            const result = await createAfterSaleOrder(
                { userId: caller.userId, tenantId: caller.tenantId, role: caller.role, actorName: actorName(caller) },
                {
                    kind: "refund",
                    originalOrderId: order.id,
                    lines: preview.lines.map((l) => ({ originalLine: l.index, qty: l.quantity, expectsBack })),
                    feeKept: preview.deductions,
                    reason: input.reason ?? null,
                    notes: [input.note, "via Claude"].filter(Boolean).join(" — "),
                },
            );
            if (!result.success) throw new McpToolError(result.error);
            return [`Created refund #${result.orderNumber}.`, ...summary.slice(-2)].join("\n");
        },
    });

    registerTool(server, {
        name: "replace_order",
        title: "Replace items of a delivered order",
        kind: "write",
        description:
            "Open a replacement (RPL- order) for a delivered order, like the Replace button: the courier brings the new items " +
            "and picks up the old ones. New items are priced from the catalog; the courier collects (or pays out) the difference " +
            "plus the delivery fee when the customer pays it. Always returns a preview first; call again with confirm: true.",
        input: z.object({
            order: orderRefSchema,
            lines: afterSaleLines,
            new_items: z
                .array(z.object({ product: productRefSchema, variant: variantRefSchema.optional(), qty: z.number().int().min(1).max(100) }))
                .min(1)
                .max(20),
            customer_pays_delivery: z.boolean().default(true),
            note: z.string().trim().max(1000).optional(),
            confirm: z.boolean().default(false),
        }),
        async run(caller, input) {
            requireWriter(caller);
            const { order, lines, defaultPickupFee } = await originalSale(caller, input.order);
            const selection = selectLines(order, lines, input.lines);

            const out = await Promise.all(
                input.new_items.map(async (item) => {
                    const { product, variants } = await findProduct(caller, item.product);
                    // The replace sheet sends the product alone; a named variant is honoured.
                    const variant = item.variant !== undefined ? pickVariant(product, variants, item.variant) : null;
                    const stock = variant ?? product;
                    const available = (stock.stock_quantity ?? 0) - (stock.reserved_quantity ?? 0);
                    return {
                        productId: product.id,
                        variantId: variant?.id ?? null,
                        qty: item.qty,
                        name: variant ? `${product.name} — ${variant.name}` : product.name,
                        price: (variant ? variant.price ?? product.price : product.price) ?? 0,
                        available,
                    };
                }),
            );
            const preview = previewReplacement(
                lines,
                selection,
                out.map((o) => ({ price: o.price, quantity: o.qty })),
                defaultPickupFee,
                input.customer_pays_delivery,
            );
            const short = out.filter((o) => o.available < o.qty);

            const courier =
                preview.courierAmount >= 0
                    ? `the courier collects ${iqd(preview.courierAmount)}`
                    : `the courier hands the customer ${iqd(-preview.courierAmount)}`;
            const summary = [
                `Replacement for #${order.order_id} (${order.customer_name}). Order lines:`,
                ...linesText(lines),
                "Coming back:",
                ...preview.backLines.map((l) => `  ${l.index + 1}. ${l.name} ×${l.quantity}: credit ${iqd(l.amount)}`),
                "Going out:",
                ...out.map((o) => `  ${o.name} ×${o.qty} @ ${iqd(o.price)}`),
                `New items ${iqd(preview.newItemsTotal)} − credit ${iqd(preview.credit)} + delivery ${iqd(preview.feeKept)}: ${courier}.`,
                ...short.map((o) => `⚠ ${o.name}: only ${Math.max(0, o.available)} available, ${o.qty} needed.`),
            ];
            if (!input.confirm) {
                return ["Preview — nothing created yet.", ...summary, "Call again with confirm: true to create the replacement."].join("\n");
            }

            const result = await createAfterSaleOrder(
                { userId: caller.userId, tenantId: caller.tenantId, role: caller.role, actorName: actorName(caller) },
                {
                    kind: "replacement",
                    originalOrderId: order.id,
                    lines: selection.map((s) => ({ originalLine: s.index, qty: s.quantity })),
                    outLines: out.map((o) => ({ productId: o.productId, variantId: o.variantId, qty: o.qty })),
                    chargeFee: input.customer_pays_delivery,
                    notes: [input.note, "via Claude"].filter(Boolean).join(" — "),
                },
            );
            if (!result.success) throw new McpToolError(result.error);
            return [`Created replacement #${result.orderNumber}.`, ...summary.slice(-1 - short.length)].join("\n");
        },
    });

    registerTool(server, {
        name: "pending_returns",
        title: "Items waiting to come back",
        kind: "read",
        description:
            "Items from refunds and replacements that are expected back and not yet received, oldest first, with the item id receive_return needs.",
        input: z.object({}),
        async run(caller) {
            const { data, error } = await caller.db
                .from("after_sale_items")
                .select(
                    "id, name, qty, created_at, child:orders!after_sale_items_order_id_fkey!inner(order_id, status, customer_name, deleted_at)",
                )
                .eq("tenant_id", caller.tenantId)
                .eq("direction", "back")
                .eq("expects_back", true)
                .is("disposition", null)
                .is("child.deleted_at", null)
                .not("child.status", "in", `(${DEAD_CHILD_STATUSES.join(",")})`)
                .order("created_at", { ascending: true })
                .limit(MAX_BATCH_ORDERS);
            if (error) throw error;
            const rows = (data ?? []) as unknown as Array<{
                id: string;
                name: string;
                qty: number;
                created_at: string;
                child: { order_id: string; status: Order["status"]; customer_name: string };
            }>;
            if (rows.length === 0) return "Nothing is waiting to come back.";
            return [
                `${rows.length} item${rows.length === 1 ? "" : "s"} waiting to come back${rows.length === MAX_BATCH_ORDERS ? " (first 200)" : ""}:`,
                ...rows.map(
                    (r) =>
                        `  ${r.name} ×${r.qty} on #${r.child.order_id} (${r.child.customer_name}, ${r.child.status}), opened ${baghdadTime(r.created_at)}; item id ${r.id}`,
                ),
            ].join("\n");
        },
    });

    registerTool(server, {
        name: "receive_return",
        title: "Receive a returned item",
        kind: "write",
        description:
            "Record what came back for one item from pending_returns, like the receive-back inbox: sealed goes back in stock, " +
            "opened_usable to open-box stock, damaged is written off, missing means it never came back.",
        input: z.object({
            item_id: z.string().uuid().describe("The item id from pending_returns."),
            condition: z.enum(["sealed", "opened_usable", "damaged", "missing"]),
            note: z.string().trim().max(500).optional(),
        }),
        async run(caller, input) {
            requireWriter(caller);
            const { data: item, error } = await caller.db
                .from("after_sale_items")
                .select("id, name, qty, child:orders!after_sale_items_order_id_fkey!inner(order_id)")
                .eq("tenant_id", caller.tenantId)
                .eq("id", input.item_id)
                .eq("direction", "back")
                .maybeSingle();
            if (error) throw error;
            if (!item) throw new McpToolError("No item waiting to come back with that id in this store. Use pending_returns.");
            const row = item as unknown as { name: string; qty: number; child: { order_id: string } };

            const result = await receiveAfterSaleItem(
                { userId: caller.userId, tenantId: caller.tenantId, role: caller.role, actorName: actorName(caller) },
                { itemId: input.item_id, condition: input.condition, note: input.note ?? null },
            );
            if (!result.success) throw new McpToolError(result.error);
            return `Received ${row.name} ×${row.qty} on #${row.child.order_id}: ${input.condition}, ${CONDITION_EFFECT[input.condition]}.`;
        },
    });
}
