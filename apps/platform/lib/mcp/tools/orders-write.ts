import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpCaller } from "@/lib/mcp/caller";
import { McpToolError, actorName, registerTool, requireWriter } from "@/lib/mcp/tool";
import {
    findOrder,
    findOrders,
    governorateInputSchema,
    orderPhone,
    orderRefSchema,
    orderStatusSchema,
    resolveOrderGovernorate,
} from "@/lib/mcp/orders";
import { iqd, itemsText, orderLine, statusText } from "@/lib/mcp/format";
import { buildStatusUpdate } from "@/lib/repositories/order-repository";
import { ORDER_READ_COLUMNS } from "@/lib/repositories/order-columns";
import { applyStatusSideEffect } from "@/lib/orders/status-side-effects";
import { classifyTransition, resolveStatusForOrder } from "@/lib/order-status-machine";
import { createOrderForTenant } from "@/lib/order-service";
import type { CreateOrderInput, Order, OrderItem } from "@/types/order";

/** One status change can touch at most this many orders. */
const MAX_BULK_ORDERS = 100;

/**
 * The entry the order's activity timeline reads. Runs after the change has
 * landed, so a failure is reported back as a warning, never as "not changed".
 */
async function logOrderActivity(
    caller: McpCaller,
    action: "order.status_change" | "order.edit" | "order.create",
    order: Pick<Order, "id" | "order_id">,
    details: Record<string, unknown>,
): Promise<string | null> {
    const { error } = await caller.db.from("activity_logs").insert({
        user_id: caller.userId,
        user_email: caller.email,
        tenant_id: caller.tenantId,
        action,
        entity_type: "order",
        entity_id: order.id,
        details: { order_id: order.order_id, source: "claude", ...details },
        user_agent: "claude-mcp",
    });
    if (!error) return null;
    Sentry.captureException(new Error(`MCP order activity log failed: ${error.message}`), { extra: { action } });
    return `activity log entry was not recorded (${error.message})`;
}

type StatusOutcome = { order: Order; result: "changed" | "unchanged"; warning?: string };

/**
 * Change one order's status the way the orders page does: the guarded PATCH
 * (pinned to the version we read), the status-history row, the supplies / QC
 * side effects the trigger does not cover, and the activity log entry.
 */
async function changeOrderStatus(
    caller: McpCaller,
    order: Order,
    status: Order["status"],
    reason: string | undefined,
): Promise<StatusOutcome> {
    if (order.status === status) return { order, result: "unchanged" };

    const { data, error } = await caller.db
        .from("orders")
        .update(buildStatusUpdate(status, { rejectionReason: reason, changedByName: actorName(caller) }))
        .eq("tenant_id", caller.tenantId)
        .eq("id", order.id)
        .eq("version", order.version)
        .select(ORDER_READ_COLUMNS)
        .maybeSingle();
    if (error) throw error;
    if (!data) {
        throw new McpToolError(`Order #${order.order_id} changed while Claude was working on it. Open it again and retry.`);
    }

    const { error: historyError } = await caller.db.from("order_status_history").insert({
        order_id: order.id,
        from_status: order.status,
        to_status: status,
        changed_at: new Date().toISOString(),
        notes: reason ?? null,
        changed_by: actorName(caller),
        tenant_id: caller.tenantId,
    });

    const effect = await applyStatusSideEffect(caller.db, {
        orderId: order.id,
        tenantId: caller.tenantId,
        items: order.items ?? [],
        from: order.status,
        to: status,
        reason: reason || `Changed to ${status} via Claude`,
    });

    const logWarning = await logOrderActivity(caller, "order.status_change", order, {
        from_status: order.status,
        to_status: status,
        reason: reason ?? null,
    });

    const warnings = [
        historyError ? `status history was not recorded (${historyError.message})` : null,
        effect.success ? null : `supplies/QC update failed (${effect.error})`,
        logWarning,
    ].filter(Boolean);
    return {
        order: data as unknown as Order,
        result: "changed",
        warning: warnings.length > 0 ? warnings.join("; ") : undefined,
    };
}

export function registerOrderWriteTools(server: McpServer): void {
    registerTool(server, {
        name: "update_order_status",
        title: "Change order status",
        kind: "write",
        description:
            "Move one or more orders to a new status, exactly like changing it in the orders page (stock, history and activity log follow). " +
            `Up to ${MAX_BULK_ORDERS} orders. For more than one order, or an unusual change (e.g. new → delivered), the first call only returns a preview; ` +
            "show it to the user and call again with confirm: true once they agree. Give a reason for rejected or cancelled.",
        input: z.object({
            orders: z.array(orderRefSchema).min(1).max(MAX_BULK_ORDERS),
            status: orderStatusSchema,
            reason: z.string().trim().min(1).max(300).optional(),
            confirm: z.boolean().default(false),
        }),
        async run(caller, input) {
            requireWriter(caller);
            const refs = [...new Set(input.orders)];
            const orders = await findOrders(caller, refs);
            // Same rule as the orders page: a return order is delivered as refund_delivered.
            const targetOf = (o: Order) => resolveStatusForOrder(o, input.status);

            const unusual = orders
                .map((o) => ({ o, verdict: classifyTransition(o.status, targetOf(o)) }))
                .filter((x) => x.verdict.kind === "unusual");
            if ((orders.length > 1 || unusual.length > 0) && !input.confirm) {
                return [
                    `Preview — nothing changed yet. ${orders.length} order(s) → ${statusText(input.status)}:`,
                    ...orders.map((o) => `  #${o.order_id}: ${o.status} → ${targetOf(o)}${o.status === targetOf(o) ? " (already)" : ""}${targetOf(o) !== input.status ? " (return order)" : ""}`),
                    ...unusual.map(({ o, verdict }) => `  ⚠ #${o.order_id}: ${verdict.kind === "unusual" ? verdict.reason : ""}`),
                    "Call again with confirm: true to apply.",
                ].join("\n");
            }

            // One at a time, in order: the same row lock the app's bulk path takes.
            const lines: string[] = [];
            let changed = 0;
            for (const order of orders) {
                try {
                    const target = targetOf(order);
                    const outcome = await changeOrderStatus(caller, order, target, input.reason);
                    if (outcome.result === "changed") changed += 1;
                    lines.push(
                        `  #${order.order_id}: ${outcome.result === "changed" ? `${order.status} → ${target}` : "already in that status"}` +
                            (outcome.warning ? ` (warning: ${outcome.warning})` : ""),
                    );
                } catch (err) {
                    if (orders.length === 1) throw err;
                    if (!(err instanceof McpToolError)) Sentry.captureException(err, { extra: { orderId: order.id } });
                    lines.push(`  #${order.order_id}: NOT changed — ${err instanceof McpToolError ? err.message : "unexpected error"}`);
                }
            }
            return [`${changed} of ${orders.length} order(s) moved to ${statusText(input.status)}.`, ...lines].join("\n");
        },
    });

    registerTool(server, {
        name: "update_order",
        title: "Edit an order",
        kind: "write",
        description:
            "Edit an order's customer and delivery details: name, phones, governorate, address, notes, internal notes, delivery fee. Only the fields given are changed.",
        input: z
            .object({
                order: orderRefSchema,
                customer_name: z.string().trim().min(1).max(120).optional(),
                phone: z.string().trim().min(7).max(30).optional(),
                secondary_phone: z.string().trim().max(30).optional().describe("Empty string removes it"),
                governorate: governorateInputSchema.optional(),
                address_details: z.string().trim().min(1).max(500).optional(),
                notes: z.string().max(1000).optional(),
                internal_notes: z.string().max(1000).optional(),
                delivery_fee: z.number().int().min(0).max(1_000_000).optional(),
            })
            .refine((v) => Object.keys(v).some((k) => k !== "order" && v[k as keyof typeof v] !== undefined), "Give at least one field to change"),
        async run(caller, input) {
            requireWriter(caller);
            const order = await findOrder(caller, input.order);

            const next: Partial<Order> = {};
            if (input.customer_name !== undefined) next.customer_name = input.customer_name;
            if (input.phone !== undefined) next.phone = orderPhone(input.phone, "Phone");
            if (input.secondary_phone !== undefined) next.secondary_phone = input.secondary_phone ? orderPhone(input.secondary_phone, "Second phone") : undefined;
            if (input.governorate !== undefined) Object.assign(next, resolveOrderGovernorate(input.governorate));
            if (input.address_details !== undefined) next.address_details = input.address_details;
            if (input.notes !== undefined) next.notes = input.notes;
            if (input.internal_notes !== undefined) next.internal_notes = input.internal_notes;
            if (input.delivery_fee !== undefined) next.delivery_fee = input.delivery_fee;

            const changes: Record<string, { from: unknown; to: unknown }> = {};
            const patch: Record<string, unknown> = {};
            for (const [key, to] of Object.entries(next)) {
                const from = order[key as keyof Order];
                const value = to === undefined ? null : to;
                if ((from ?? null) === value) continue;
                changes[key] = { from: from ?? null, to: value };
                patch[key] = value;
            }
            if (Object.keys(patch).length === 0) return `Order #${order.order_id} already has those values; nothing changed.`;

            const { data, error } = await caller.db
                .from("orders")
                .update(patch)
                .eq("tenant_id", caller.tenantId)
                .eq("id", order.id)
                .eq("version", order.version)
                .select("id")
                .maybeSingle();
            if (error) throw error;
            if (!data) throw new McpToolError(`Order #${order.order_id} changed while Claude was working on it. Open it again and retry.`);

            const logWarning = await logOrderActivity(caller, "order.edit", order, { changes });
            return [
                `Order #${order.order_id} updated:`,
                ...Object.entries(changes).map(([k, c]) => `  ${k}: ${String(c.from ?? "-")} → ${String(c.to ?? "-")}`),
                ...(logWarning ? [`Warning: ${logWarning}`] : []),
            ].join("\n");
        },
    });

    registerTool(server, {
        name: "add_order_note",
        title: "Add a note to an order",
        kind: "write",
        description: "Add a note to an order's notes thread (visible to the team on the order page).",
        input: z.object({ order: orderRefSchema, note: z.string().trim().min(1).max(2000) }),
        async run(caller, input) {
            requireWriter(caller);
            const order = await findOrder(caller, input.order);
            const { error } = await caller.db.from("order_notes").insert({
                order_id: order.id,
                note: input.note,
                created_by: actorName(caller),
                tenant_id: caller.tenantId,
            });
            if (error) throw error;
            return `Note added to order #${order.order_id}.`;
        },
    });

    registerTool(server, {
        name: "create_order",
        title: "Create an order",
        kind: "write",
        description:
            "Create a COD delivery order, exactly like the New order form: products come from the catalog (use list_products for ids), " +
            "prices are the catalog prices, the order starts as confirmed, plan limits and billing apply, and the store's order number is assigned. " +
            "`price` stored = items total minus discount; the delivery fee is separate (default 5,000 IQD).",
        input: z.object({
            customer_name: z.string().trim().min(1).max(120),
            phone: z.string().trim().min(7).max(30),
            secondary_phone: z.string().trim().max(30).optional(),
            governorate: governorateInputSchema,
            address_details: z.string().trim().min(1).max(500),
            items: z
                .array(
                    z.object({
                        product_id: z.string().uuid(),
                        variant_id: z.string().uuid().optional(),
                        quantity: z.number().int().min(1).max(1000),
                    }),
                )
                .min(1)
                .max(50),
            delivery_fee: z.number().int().min(0).max(1_000_000).default(5000),
            discount: z.number().int().min(0).max(100_000_000).default(0),
            notes: z.string().max(1000).optional(),
            confirm: z.boolean().default(false).describe("false returns a preview; true creates the order"),
        }),
        async run(caller, input) {
            requireWriter(caller);
            const gov = resolveOrderGovernorate(input.governorate);
            const phone = orderPhone(input.phone, "Phone");

            const productIds = [...new Set(input.items.map((i) => i.product_id))];
            const variantIds = input.items.flatMap((i) => (i.variant_id ? [i.variant_id] : []));
            const [productsRes, variantsRes] = await Promise.all([
                caller.db
                    .from("products")
                    .select("id, name, price, sku, image_url, compare_at_price, is_archived")
                    .eq("tenant_id", caller.tenantId)
                    .in("id", productIds),
                variantIds.length === 0
                    ? Promise.resolve({ data: [], error: null })
                    : caller.db
                          .from("product_variants")
                          .select("id, product_id, name, price, sku, image_url, compare_at_price, is_enabled")
                          .eq("tenant_id", caller.tenantId)
                          .in("id", variantIds),
            ]);
            if (productsRes.error) throw productsRes.error;
            if (variantsRes.error) throw variantsRes.error;
            type CatalogRow = { id: string; name: string; price: number | null; sku: string | null; image_url: string | null; compare_at_price: number | null };
            const products = new Map((productsRes.data ?? []).map((p) => [p.id as string, p as CatalogRow & { is_archived: boolean | null }]));
            const variants = new Map(
                (variantsRes.data ?? []).map((v) => [v.id as string, v as CatalogRow & { product_id: string; is_enabled: boolean | null }]),
            );

            const items: OrderItem[] = input.items.map((line) => {
                const product = products.get(line.product_id);
                if (!product || product.is_archived) throw new McpToolError(`Product ${line.product_id} is not in this store's catalog.`);
                const variant = line.variant_id ? variants.get(line.variant_id) : undefined;
                if (line.variant_id && (!variant || variant.product_id !== product.id || variant.is_enabled === false)) {
                    throw new McpToolError(`Variant ${line.variant_id} is not an active variant of ${product.name}.`);
                }
                const source = variant ?? product;
                return {
                    product_id: product.id,
                    ...(variant ? { variant_id: variant.id } : {}),
                    name: variant ? `${product.name} - ${variant.name}` : product.name,
                    quantity: line.quantity,
                    price: Math.round(source.price ?? product.price ?? 0),
                    ...(source.sku ? { sku: source.sku } : {}),
                    ...(source.image_url ?? product.image_url ? { image_url: (source.image_url ?? product.image_url) as string } : {}),
                    ...(source.compare_at_price ? { compare_at_price: Math.round(source.compare_at_price) } : {}),
                };
            });

            const itemsTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
            if (input.discount > itemsTotal) {
                throw new McpToolError(`The discount (${iqd(input.discount)}) is more than the items total (${iqd(itemsTotal)}).`);
            }
            const price = itemsTotal - input.discount;
            const summary = [
                `${input.customer_name} | ${phone} | ${gov.city}, ${input.address_details}`,
                `Items: ${itemsText(items)}`,
                `Items total ${iqd(itemsTotal)} − discount ${iqd(input.discount)} = ${iqd(price)}; delivery ${iqd(input.delivery_fee)}; customer pays ${iqd(price + input.delivery_fee)}`,
            ];
            if (!input.confirm) return ["Preview — no order created yet:", ...summary, "Call again with confirm: true to create it."].join("\n");

            const orderData: CreateOrderInput = {
                customer_name: input.customer_name,
                phone,
                secondary_phone: input.secondary_phone ? orderPhone(input.secondary_phone, "Second phone") : undefined,
                city: gov.city,
                governorate_code: gov.governorate_code,
                address_details: input.address_details,
                items,
                price,
                discount_amount: input.discount,
                delivery_fee: input.delivery_fee,
                status: "confirmed",
                notes: input.notes ?? "",
                internal_notes: "",
                is_shop_order: false,
                is_replacement: false,
                source: "other",
            };
            // The service behind the New order form's server action, given the
            // store that resolveMcpCaller verified: plan limits, the pause
            // switch, catalog ownership and billing all apply. (The action itself
            // refuses Claude connector tokens, like every app entry point.)
            const result = await createOrderForTenant(orderData, caller.tenantId);
            if (!result.success || !result.data) throw new McpToolError(result.error || "The order was not created.");

            const created = result.data as Order;
            const logWarning = await logOrderActivity(caller, "order.create", created, {});
            return [
                `Created order #${created.order_id}.`,
                orderLine(created, true),
                ...[result.warning, logWarning].filter(Boolean).map((w) => `Warning: ${w}`),
            ].join("\n");
        },
    });
}
