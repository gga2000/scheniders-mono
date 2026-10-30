import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpCaller } from "@/lib/mcp/caller";
import { McpToolError, actorName, canSeeMoney, registerTool, requireWriter } from "@/lib/mcp/tool";
import { ORDER_SUMMARY_COLUMNS, baghdadTime, iqd, orderLine, type OrderSummaryRow } from "@/lib/mcp/format";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import { storedPhoneVariants } from "@/lib/order-server-search";
import { parseRecovery } from "@/lib/orders/abandoned-cart-recovery";
import { isValidIraqiMobile } from "@scheniders/shared";

/** Open carts listed at most; the Abandoned column holds a few dozen at its busiest. */
const MAX_CARTS = 100;

const phoneSchema = z.string().trim().min(7).max(30).describe("The customer's phone in any format (07…, +964…, 7…).");

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The national digits (7XXXXXXXXX) the customer pages key notes and tags by,
 * for a customer who has at least one order in this store. Refusing unknown
 * numbers keeps a typo from growing a customer record nobody can find.
 */
async function knownCustomer(caller: McpCaller, raw: string): Promise<{ phone: string; name: string }> {
    const phone = normalizePhoneForSearch(raw);
    if (!isValidIraqiMobile(`0${phone}`)) throw new McpToolError(`${raw} is not a valid Iraqi mobile number.`);
    const { data, error } = await caller.db
        .from("orders")
        .select("customer_name")
        .eq("tenant_id", caller.tenantId)
        .in("phone", storedPhoneVariants(phone))
        .order("created_at", { ascending: false })
        .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) throw new McpToolError(`No customer with phone 0${phone} has ordered from this store.`);
    return { phone, name: (data[0] as { customer_name: string | null }).customer_name ?? "customer" };
}

export function registerCustomerTools(server: McpServer): void {
    registerTool(server, {
        name: "abandoned_carts",
        title: "Abandoned carts",
        kind: "read",
        description:
            "Open abandoned carts (checkouts the customer did not finish, status pending_checkout), newest first, with a WhatsApp " +
            "link per customer, plus how carts ended over the last `days`. To take a cart, call the customer (or message them " +
            "yourself through the link) and move it with update_order_status (contacted or confirmed): the app records it as " +
            "recovered by the caller. Claude never messages customers itself.",
        input: z.object({ days: z.number().int().min(1).max(90).default(30) }),
        async run(caller, input) {
            const [carts, recovery] = await Promise.all([
                caller.db
                    .from("orders")
                    .select(`${ORDER_SUMMARY_COLUMNS}, abandoned_cart_at`)
                    .eq("tenant_id", caller.tenantId)
                    .eq("status", "pending_checkout")
                    .is("deleted_at", null)
                    .order("created_at", { ascending: false })
                    .limit(MAX_CARTS),
                // A read-only function: GET keeps it inside the guard's read path.
                caller.db.rpc("get_abandoned_cart_recovery", { _tenant_id: caller.tenantId, _days: input.days }, { get: true }),
            ]);
            if (carts.error) throw carts.error;
            if (recovery.error) throw recovery.error;

            const open = (carts.data ?? []) as unknown as Array<OrderSummaryRow & { abandoned_cart_at: string | null }>;
            const r = parseRecovery(recovery.data);
            const lines = [
                `Last ${r.days} days: ${r.recovered} recovered by staff, ${r.returned} came back on their own, recovery rate ${r.rate}%` +
                    (r.recovered_iqd !== null && canSeeMoney(caller) ? `, ${iqd(r.recovered_iqd)} recovered` : "") +
                    `. Removed automatically: ${r.removed.junk_phone} bad phone, ${r.removed.junk_location} no address, ` +
                    `${r.removed.already_ordered} already ordered, ${r.removed.expired} expired.`,
                ...(r.by_staff.length > 0 ? [`By staff: ${r.by_staff.map((s) => `${s.name} ${s.recovered}`).join(", ")}.`] : []),
                "",
            ];
            if (open.length === 0) return [...lines, "No open abandoned carts."].join("\n");
            return [
                ...lines,
                `${open.length} open cart${open.length === 1 ? "" : "s"}${open.length === MAX_CARTS ? ` (newest ${MAX_CARTS})` : ""}:`,
                ...open.map((o) => {
                    const national = normalizePhoneForSearch(o.phone);
                    return `  ${orderLine(o, true)} | left ${baghdadTime(o.abandoned_cart_at ?? o.created_at)} | WhatsApp https://wa.me/964${national}`;
                }),
            ].join("\n");
        },
    });

    registerTool(server, {
        name: "add_customer_note",
        title: "Add a customer note",
        kind: "write",
        description: "Add a note to a customer's profile (seen by the team on the customer page). The note is signed as coming from Claude.",
        input: z.object({ phone: phoneSchema, note: z.string().trim().min(1).max(1000) }),
        async run(caller, input) {
            requireWriter(caller);
            const customer = await knownCustomer(caller, input.phone);
            const { error } = await caller.db.from("customer_notes").insert({
                tenant_id: caller.tenantId,
                customer_phone: customer.phone,
                note: `${input.note} — ${actorName(caller)}`,
            });
            if (error) throw error;
            return `Note added to ${customer.name} (0${customer.phone}).`;
        },
    });

    registerTool(server, {
        name: "tag_customer",
        title: "Tag a customer",
        kind: "write",
        description:
            "Put one of the store's customer tags on a customer. A tag that does not exist yet is created only with create_tag: true. " +
            "Claude cannot remove tags; do that in the app.",
        input: z.object({
            phone: phoneSchema,
            tag: z.string().trim().min(1).max(40),
            create_tag: z.boolean().default(false),
        }),
        async run(caller, input) {
            requireWriter(caller);
            const customer = await knownCustomer(caller, input.phone);

            const { data: tags, error: tagsError } = await caller.db
                .from("customer_tags")
                .select("id, name")
                .eq("tenant_id", caller.tenantId);
            if (tagsError) throw tagsError;
            let tag = ((tags ?? []) as Array<{ id: string; name: string }>).find((t) => sameText(t.name, input.tag));
            if (!tag) {
                if (!input.create_tag) {
                    const names = (tags ?? []).map((t) => (t as { name: string }).name);
                    throw new McpToolError(
                        `No tag "${input.tag}" in this store. ${names.length > 0 ? `Tags: ${names.join(", ")}.` : "The store has no tags yet."} ` +
                            "Call again with create_tag: true to create it.",
                    );
                }
                const { data: created, error: createError } = await caller.db
                    .from("customer_tags")
                    .insert({ tenant_id: caller.tenantId, name: input.tag })
                    .select("id, name")
                    .single();
                if (createError) throw createError;
                tag = created as { id: string; name: string };
            }

            const { data: existing, error: findError } = await caller.db
                .from("customer_tag_assignments")
                .select("id")
                .eq("tenant_id", caller.tenantId)
                .eq("tag_id", tag.id)
                .in("customer_phone", storedPhoneVariants(customer.phone))
                .limit(1);
            if (findError) throw findError;
            if (existing && existing.length > 0) return `${customer.name} (0${customer.phone}) already has the tag "${tag.name}".`;

            const { error } = await caller.db
                .from("customer_tag_assignments")
                .insert({ tenant_id: caller.tenantId, customer_phone: customer.phone, tag_id: tag.id });
            if (error) throw error;
            return `Tagged ${customer.name} (0${customer.phone}) "${tag.name}".`;
        },
    });
}
