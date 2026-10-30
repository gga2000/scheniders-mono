import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerTool, canSeeMoney, McpToolError } from "@/lib/mcp/tool";
import { ORDER_STATUSES } from "@/lib/order-status-labels";
import { normalizeIraqiPhone, normalizePhoneForSearch } from "@/lib/order-utils";
import { storedPhoneVariants } from "@/lib/order-server-search";
import { normalizePhoneLikeDb } from "@/lib/customer-trust-risk";
import { SEARCH_LIMIT } from "@/lib/mcp/orders";
import {
    baghdadDayEnd,
    baghdadTime,
    baghdadDayStart,
    baghdadToday,
    iqd,
    orderLine,
    type OrderSummaryRow,
} from "@/lib/mcp/format";
import type { Order } from "@/types/order";

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const PAGE = 1000;
const MAX_SUMMARY_DAYS = 93;
const DEFAULT_LOW_STOCK = 5;
/** Product ids per variant lookup, to keep the request URL short. */
const ID_CHUNK = 200;

type ProductRow = {
    id: string;
    name: string;
    sku: string | null;
    price: number | null;
    stock_quantity: number | null;
    reserved_quantity: number | null;
    open_box_quantity: number | null;
    low_stock_threshold: number | null;
    is_visible: boolean | null;
};
type VariantRow = Omit<ProductRow, "is_visible"> & { product_id: string; is_enabled: boolean | null };

const available = (r: { stock_quantity: number | null; reserved_quantity: number | null }) =>
    (r.stock_quantity ?? 0) - (r.reserved_quantity ?? 0);

const stockText = (r: ProductRow | VariantRow) =>
    `stock ${r.stock_quantity ?? 0}, reserved ${r.reserved_quantity ?? 0}, available ${available(r)}` +
    (r.open_box_quantity ? `, open box left ${r.open_box_quantity}` : "");

export function registerStoreReadTools(server: McpServer): void {
    registerTool(server, {
        name: "get_store",
        title: "Store and session",
        kind: "read",
        description:
            "Which store Claude is working in, the signed-in user's role there, and today's date in Baghdad. Call this first.",
        input: z.object({}),
        async run(caller) {
            const { data, error } = await caller.db
                .from("tenants")
                .select("business_name, slug, status")
                .eq("id", caller.tenantId)
                .single();
            if (error) throw error;
            return [
                `Store: ${data.business_name} (${data.slug}), status ${data.status}`,
                `Signed in as: ${caller.displayName} — role ${caller.role}`,
                `Today in Baghdad: ${baghdadToday()}`,
                "Currency is IQD (whole numbers). There is no tax.",
                "Changes made through Claude are logged as \"via Claude\". Claude cannot delete records or change team, billing, wallet or payroll.",
            ].join("\n");
        },
    });

    registerTool(server, {
        name: "sales_summary",
        title: "Sales summary",
        kind: "read",
        description:
            "Order counts by status for orders created between two Baghdad days (inclusive, default today), and delivered revenue for admins. Test orders are excluded.",
        input: z.object({ from: daySchema.optional(), to: daySchema.optional() }),
        async run(caller, input) {
            const from = input.from ?? baghdadToday();
            const to = input.to ?? from;
            const days = (Date.parse(baghdadDayEnd(to)) - Date.parse(baghdadDayStart(from))) / 86_400_000;
            if (days <= 0) throw new McpToolError("`to` must be on or after `from`.");
            if (days > MAX_SUMMARY_DAYS) throw new McpToolError(`Use a range of at most ${MAX_SUMMARY_DAYS} days.`);

            type Row = Pick<Order, "status" | "price" | "is_return">;
            const rows: Row[] = [];
            for (let offset = 0; ; offset += PAGE) {
                const { data, error } = await caller.db
                    .from("orders")
                    .select("status, price, is_return")
                    .eq("tenant_id", caller.tenantId)
                    .is("deleted_at", null)
                    .eq("is_test", false)
                    .gte("created_at", baghdadDayStart(from))
                    .lt("created_at", baghdadDayEnd(to))
                    .order("id")
                    .range(offset, offset + PAGE - 1);
                if (error) throw error;
                rows.push(...((data ?? []) as Row[]));
                if (!data || data.length < PAGE) break;
            }

            const counts = new Map<string, number>();
            let deliveredRevenue = 0;
            let deliveredOrders = 0;
            for (const r of rows) {
                if (r.is_return) continue;
                counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
                if (r.status === "delivered" || r.status === "completed") {
                    deliveredOrders += 1;
                    deliveredRevenue += r.price ?? 0;
                }
            }
            const returns = rows.filter((r) => r.is_return).length;
            const sales = rows.length - returns;

            const lines = [
                `Orders created ${from}${to === from ? "" : ` to ${to}`} (Baghdad): ${sales} sales orders, ${returns} returns.`,
                ...ORDER_STATUSES.filter((s) => counts.has(s)).map((s) => `  ${s}: ${counts.get(s)}`),
                `Delivered or completed: ${deliveredOrders}`,
            ];
            lines.push(
                canSeeMoney(caller)
                    ? `Delivered revenue (items after discount, without delivery fees): ${iqd(deliveredRevenue)}`
                    : "Revenue is shown to store admins only.",
            );
            return lines.join("\n");
        },
    });

    registerTool(server, {
        name: "find_customer",
        title: "Look up a customer",
        kind: "read",
        description:
            "A customer's orders and reliability by phone (any format) or by name: order history, delivered/returned counts, trust tier, blacklist status, tags and latest notes.",
        input: z
            .object({ phone: z.string().trim().min(6).max(30).optional(), name: z.string().trim().min(2).max(80).optional() })
            .refine((v) => v.phone || v.name, "Give a phone or a name"),
        async run(caller, input) {
            const term = input.phone ? normalizeIraqiPhone(input.phone) : (input.name as string);
            const { data, error } = await caller.db.rpc("search_orders_v2", {
                p_tenant_id: caller.tenantId,
                p_term: term,
                p_limit: SEARCH_LIMIT,
            });
            if (error) throw error;
            const matched = (data ?? []) as (OrderSummaryRow & { deleted_at: string | null })[];
            // The search RPC also returns orders in the trash; they are not the customer's history.
            const orders = matched.filter((o) => o.deleted_at === null);
            if (orders.length === 0) return `No orders for ${term}.`;
            const capped = matched.length >= SEARCH_LIMIT
                ? `Note: the search stops at the ${SEARCH_LIMIT} closest matches; older orders may be missing.`
                : null;

            const byPhone = new Map<string, OrderSummaryRow[]>();
            for (const o of orders) {
                const key = normalizePhoneLikeDb(o.phone);
                byPhone.set(key, [...(byPhone.get(key) ?? []), o]);
            }
            // A phone must name one customer exactly; a partial number or a name
            // that matches several customers gets the candidates instead.
            const wanted = input.phone ? normalizePhoneLikeDb(input.phone) : null;
            const exact = wanted !== null ? byPhone.get(wanted) : byPhone.size === 1 ? [...byPhone.values()][0] : undefined;
            if (!exact) {
                return [
                    `${byPhone.size} customer(s) match "${term}". Ask again with one full phone:`,
                    ...[...byPhone.values()].slice(0, 15).map((list) => `  ${list[0].customer_name} ${list[0].phone} — ${list.length} order(s)`),
                ].join("\n");
            }

            const list = exact;
            const phoneKey = normalizePhoneLikeDb(list[0].phone);
            const last10 = phoneKey.slice(-10);
            const variants = storedPhoneVariants(normalizePhoneForSearch(list[0].phone));
            const [trust, blacklist, tags, notes] = await Promise.all([
                caller.db
                    .from("customer_trust")
                    .select("trust_tier, trust_score, delivery_success_rate, total_orders, delivered_count, total_spent")
                    .eq("tenant_id", caller.tenantId)
                    .eq("phone", phoneKey)
                    .maybeSingle(),
                caller.db.from("blacklist").select("reason").eq("tenant_id", caller.tenantId).like("phone", `%${last10}`).limit(1),
                caller.db
                    .from("customer_tag_assignments")
                    .select("tag:customer_tags(name)")
                    .eq("tenant_id", caller.tenantId)
                    .in("customer_phone", variants),
                caller.db
                    .from("customer_notes")
                    .select("note, created_at")
                    .eq("tenant_id", caller.tenantId)
                    .in("customer_phone", variants)
                    .order("created_at", { ascending: false })
                    .limit(5),
            ]);
            if (trust.error) throw trust.error;
            if (blacklist.error) throw blacklist.error;
            if (tags.error) throw tags.error;
            if (notes.error) throw notes.error;
            const tagNames = ((tags.data ?? []) as unknown as Array<{ tag: { name: string } | null }>)
                .map((t) => t.tag?.name)
                .filter((n): n is string => !!n);
            const noteRows = (notes.data ?? []) as Array<{ note: string; created_at: string }>;

            const sales = list.filter((o) => !o.is_return);
            const delivered = sales.filter((o) => o.status === "delivered" || o.status === "completed").length;
            const rejected = sales.filter((o) => o.status === "rejected").length;
            const t = trust.data;
            return [
                `Customer: ${list[0].customer_name} | ${list[0].phone}`,
                `Orders: ${sales.length} (delivered ${delivered}, rejected ${rejected}, returns ${list.length - sales.length})`,
                t
                    ? `Trust: ${t.trust_tier} (score ${t.trust_score}, delivery success ${t.delivery_success_rate}%)${canSeeMoney(caller) ? `, total spent ${iqd(t.total_spent)}` : ""}`
                    : "Trust: not scored yet",
                blacklist.data && blacklist.data.length > 0 ? `BLACKLISTED: ${blacklist.data[0].reason}` : "Not blacklisted",
                `Tags: ${tagNames.length > 0 ? tagNames.join(", ") : "none"}`,
                ...(noteRows.length > 0
                    ? ["Notes (newest first):", ...noteRows.map((n) => `  ${baghdadTime(n.created_at)}: ${n.note}`)]
                    : []),
                ...(capped ? [capped] : []),
                "",
                "Orders (newest first):",
                ...list
                    .sort((a, b) => b.created_at.localeCompare(a.created_at))
                    .slice(0, 25)
                    .map((o) => `  ${orderLine(o, true)}`),
            ].join("\n");
        },
    });

    registerTool(server, {
        name: "list_products",
        title: "Products and stock",
        kind: "read",
        description:
            "Products with price and stock. `available` = new units in stock minus reserved by confirmed orders; `open box left` = open-box units free to sell (already net of confirmed orders). Use `low_stock` to list only items at or below their alert level (default 5). Variants are listed under their product.",
        input: z.object({
            search: z.string().trim().min(1).max(80).optional().describe("Part of the product name or SKU"),
            low_stock: z.boolean().default(false),
            include_hidden: z.boolean().default(true),
            limit: z.number().int().min(1).max(100).default(50),
        }),
        async run(caller, input) {
            let q = caller.db
                .from("products")
                .select("id, name, sku, price, stock_quantity, reserved_quantity, open_box_quantity, low_stock_threshold, is_visible")
                .eq("tenant_id", caller.tenantId)
                .eq("is_archived", false)
                .or("is_supply.is.null,is_supply.eq.false");
            if (!input.include_hidden) q = q.eq("is_visible", true);
            if (input.search) {
                const s = input.search.replace(/[%,()]/g, " ");
                q = q.or(`name.ilike.%${s}%,sku.ilike.%${s}%`);
            }
            const list: ProductRow[] = [];
            for (let from = 0; ; from += PAGE) {
                const { data: page, error } = await q.order("name").order("id").range(from, from + PAGE - 1);
                if (error) throw error;
                list.push(...((page ?? []) as ProductRow[]));
                if (!page || page.length < PAGE) break;
            }
            if (list.length === 0) return "No products match.";

            const variantData: VariantRow[] = [];
            for (let i = 0; i < list.length; i += ID_CHUNK) {
                const { data, error } = await caller.db
                    .from("product_variants")
                    .select("id, product_id, name, sku, price, stock_quantity, reserved_quantity, open_box_quantity, low_stock_threshold, is_enabled")
                    .eq("tenant_id", caller.tenantId)
                    .in("product_id", list.slice(i, i + ID_CHUNK).map((p) => p.id));
                if (error) throw error;
                variantData.push(...((data ?? []) as VariantRow[]));
            }
            const variants = new Map<string, VariantRow[]>();
            for (const v of variantData) {
                variants.set(v.product_id, [...(variants.get(v.product_id) ?? []), v]);
            }

            const isLow = (r: ProductRow | VariantRow) => available(r) <= (r.low_stock_threshold ?? DEFAULT_LOW_STOCK);
            const shown = list.filter((p) => {
                if (!input.low_stock) return true;
                const vs = variants.get(p.id) ?? [];
                return vs.length > 0 ? vs.some(isLow) : isLow(p);
            });
            if (shown.length === 0) return "No products are at or below their low-stock level.";

            const lines = [`${shown.length} product(s); showing ${Math.min(shown.length, input.limit)}.`];
            for (const p of shown.slice(0, input.limit)) {
                const vs = variants.get(p.id) ?? [];
                lines.push(
                    `${p.name}${p.sku ? ` [${p.sku}]` : ""} (id ${p.id}) | ${iqd(p.price)} | ${p.is_visible ? "visible" : "hidden"}` +
                        (vs.length === 0 ? ` | ${stockText(p)}` : ""),
                );
                for (const v of vs) {
                    if (input.low_stock && !isLow(v)) continue;
                    lines.push(
                        `    ${v.name}${v.sku ? ` [${v.sku}]` : ""} (variant ${v.id}) | ${iqd(v.price ?? p.price)}${v.is_enabled === false ? " | disabled" : ""} | ${stockText(v)}`,
                    );
                }
            }
            return lines.join("\n");
        },
    });
}
