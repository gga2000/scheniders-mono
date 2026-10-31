import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { McpToolError, actorName, registerTool, requireWriter } from "@/lib/mcp/tool";
import { findProduct, pickVariant, productRefSchema, variantRefSchema, type CatalogProduct, type CatalogVariant } from "@/lib/mcp/products";
import { orderPhone } from "@/lib/mcp/orders";
import { iqd } from "@/lib/mcp/format";

/** A price moving below half or above double its current value needs confirm: true. */
const PRICE_JUMP = 2;

/** The reasons the products page offers for a manual stock change (a shelf count is set_stock_count). */
const STOCK_REASONS = ["received", "damaged", "sold", "other"] as const;

/** Postgres refuses with 42501 when the role lacks products.edit; say so plainly. */
function stockError(error: { code?: string; message: string }): Error {
    if (error.code === "42501") return new McpToolError("Your role in this store cannot change stock.");
    if (error.code === "P0002") return new McpToolError("That variant does not belong to this product.");
    return new Error(error.message);
}

function label(product: CatalogProduct, variant: CatalogVariant | null): string {
    return variant ? `${product.name} — ${variant.name}` : product.name;
}

export function registerCatalogWriteTools(server: McpServer): void {
    registerTool(server, {
        name: "update_product",
        title: "Change price or visibility",
        kind: "write",
        description:
            "Change a product's (or one variant's) price and compare-at price, or show/hide the product in the store. " +
            "A price that drops below half or more than doubles returns a preview first; call again with confirm: true.",
        input: z
            .object({
                product: productRefSchema,
                variant: variantRefSchema.optional(),
                price: z.number().int().min(0).max(100_000_000).optional(),
                compare_at_price: z
                    .number()
                    .int()
                    .min(0)
                    .max(100_000_000)
                    .nullable()
                    .optional()
                    .describe("The struck-through 'was' price; null removes it"),
                visible: z.boolean().optional().describe("Show (true) or hide (false) the product in the store; not per variant"),
                confirm: z.boolean().default(false),
            })
            .refine((v) => v.price !== undefined || v.compare_at_price !== undefined || v.visible !== undefined, "Give a price, compare_at_price or visible")
            .refine((v) => !(v.variant && v.visible !== undefined), "Visibility is set on the product, not a variant"),
        async run(caller, input) {
            requireWriter(caller);
            const { product, variants } = await findProduct(caller, input.product);
            // Without a variant the change is to the product's base price, which
            // variants without a price of their own inherit.
            const variant = input.variant !== undefined ? pickVariant(product, variants, input.variant) : null;
            const current = variant ?? product;
            const oldPrice = variant ? (variant.price ?? product.price) : product.price;

            const patch: Record<string, unknown> = {};
            const changes: Record<string, { from: unknown; to: unknown }> = {};
            const set = (key: string, from: unknown, to: unknown) => {
                if ((from ?? null) === (to ?? null)) return;
                patch[key] = to;
                changes[key] = { from: from ?? null, to: to ?? null };
            };
            if (input.price !== undefined) set("price", oldPrice, input.price);
            if (input.compare_at_price !== undefined) set("compare_at_price", current.compare_at_price, input.compare_at_price);
            if (input.visible !== undefined) set("is_visible", product.is_visible, input.visible);
            if (Object.keys(patch).length === 0) return `${label(product, variant)} already has those values; nothing changed.`;

            const newPrice = (patch.price as number | undefined) ?? oldPrice;
            const newCompare = "compare_at_price" in patch ? (patch.compare_at_price as number | null) : current.compare_at_price;
            if (newCompare !== null && newPrice !== null && newCompare <= newPrice) {
                throw new McpToolError(`The compare-at price (${iqd(newCompare)}) must be higher than the price (${iqd(newPrice)}).`);
            }

            const summary = Object.entries(changes).map(([key, c]) =>
                key === "is_visible"
                    ? `  ${c.to ? "show in store" : "hide from store"}`
                    : `  ${key.replace(/_/g, " ")}: ${c.from === null ? "none" : iqd(Number(c.from))} → ${c.to === null ? "none" : iqd(Number(c.to))}`,
            );
            const jump =
                "price" in patch &&
                oldPrice !== null &&
                newPrice !== null &&
                oldPrice > 0 &&
                (newPrice === 0 || newPrice * PRICE_JUMP < oldPrice || newPrice > oldPrice * PRICE_JUMP);
            if (jump && !input.confirm) {
                return [`Preview — nothing changed yet. ${label(product, variant)}:`, ...summary, "⚠ This is a large price change. Call again with confirm: true to apply."].join("\n");
            }

            const { data: changed, error } = await caller.db
                .from(variant ? "product_variants" : "products")
                .update(patch)
                .eq("tenant_id", caller.tenantId)
                .eq("id", current.id)
                .select("id");
            if (error) throw error;
            if (!changed || changed.length === 0) throw new McpToolError("Your role in this store cannot edit products.");

            // The product page's own trail: price history and the product activity log.
            const warnings: string[] = [];
            if ("price" in patch) {
                const { error: historyError } = await caller.db.from("product_price_history").insert({
                    tenant_id: caller.tenantId,
                    product_id: product.id,
                    old_price: oldPrice,
                    new_price: newPrice,
                    changed_by: actorName(caller),
                    reason: variant ? `Variant ${variant.name} price, via Claude` : "Price changed via Claude",
                });
                if (historyError) warnings.push(`price history not recorded (${historyError.message})`);
            }
            const { error: logError } = await caller.db.from("product_activity_log").insert({
                tenant_id: caller.tenantId,
                product_id: product.id,
                action: "price" in patch ? "price_changed" : "updated",
                changes_json: { ...changes, ...(variant ? { variant: variant.name } : {}), source: "claude" },
                user_id: caller.userId,
            });
            if (logError) warnings.push(`product activity not recorded (${logError.message})`);

            return [`Updated ${label(product, variant)}:`, ...summary, ...warnings.map((w) => `Warning: ${w}`)].join("\n");
        },
    });

    registerTool(server, {
        name: "adjust_stock",
        title: "Add or remove stock",
        kind: "write",
        description:
            "Add stock (positive change, e.g. a delivery received) or remove it (negative, e.g. damaged), with a reason. " +
            "The change applies to the current stock, exactly like the products page. For a shelf count use set_stock_count. " +
            "A change that would leave stock below zero returns a preview first.",
        input: z.object({
            product: productRefSchema,
            variant: variantRefSchema.optional(),
            change: z.number().int().min(-100_000).max(100_000).refine((n) => n !== 0, "The change cannot be zero"),
            reason: z.enum(STOCK_REASONS),
            notes: z.string().trim().max(300).optional(),
            confirm: z.boolean().default(false),
        }),
        async run(caller, input) {
            requireWriter(caller);
            const { product, variants } = await findProduct(caller, input.product);
            const variant = pickVariant(product, variants, input.variant);
            const before = (variant ?? product).stock_quantity ?? 0;
            const after = before + input.change;
            if (after < 0 && !input.confirm) {
                return [
                    `Preview — nothing changed yet. ${label(product, variant)}: stock ${before} → ${after}.`,
                    "⚠ Stock would go below zero. Call again with confirm: true to apply anyway.",
                ].join("\n");
            }

            const { data, error } = await caller.db.rpc("adjust_product_stock", {
                p_product_id: product.id,
                p_variant_id: variant?.id ?? null,
                p_delta: input.change,
                p_reason: input.reason,
                p_notes: [input.notes, "via Claude"].filter(Boolean).join(" — "),
            });
            if (error) throw stockError(error);
            return `${label(product, variant)}: stock ${input.change > 0 ? "+" : ""}${input.change} (${input.reason}), now ${data}.`;
        },
    });

    registerTool(server, {
        name: "set_stock_count",
        title: "Set stock from a shelf count",
        kind: "write",
        description:
            "Set stock to the number counted on the shelf, exactly like the products page; the difference is logged as a count. " +
            "`pile` picks new units (default) or open-box units. Count every box on the shelf, including ones held by confirmed " +
            "orders that have not shipped; for open box the app subtracts those itself.",
        input: z.object({
            product: productRefSchema,
            variant: variantRefSchema.optional(),
            pile: z.enum(["new", "open_box"]).default("new"),
            counted: z.number().int().min(0).max(1_000_000),
            notes: z.string().trim().max(300).optional(),
        }),
        async run(caller, input) {
            requireWriter(caller);
            const { product, variants } = await findProduct(caller, input.product);
            const variant = pickVariant(product, variants, input.variant);
            const notes = [input.notes, "via Claude"].filter(Boolean).join(" — ");

            if (input.pile === "open_box") {
                const before = (variant ?? product).open_box_quantity ?? 0;
                const { data, error } = await caller.db.rpc("set_counted_open_box", {
                    p_product_id: product.id,
                    p_variant_id: variant?.id ?? null,
                    p_counted: input.counted,
                    p_notes: notes,
                });
                if (error) throw stockError(error);
                const after = data as number;
                const held = input.counted - after;
                return (
                    `${label(product, variant)}: open box ${input.counted} on the shelf` +
                    (held > 0 ? `, ${held} held by confirmed orders` : "") +
                    `. Open box left ${before} → ${after}.`
                );
            }

            const before = (variant ?? product).stock_quantity ?? 0;
            if (before === input.counted) return `${label(product, variant)} already has ${before} in stock; nothing changed.`;

            const { error } = await caller.db.rpc("set_counted_stock", {
                p_product_id: product.id,
                p_variant_id: variant?.id ?? null,
                p_counted: input.counted,
                p_notes: notes,
            });
            if (error) throw stockError(error);
            return `${label(product, variant)}: stock ${before} → ${input.counted} (counted).`;
        },
    });

    registerTool(server, {
        name: "blacklist_customer",
        title: "Blacklist a customer",
        kind: "write",
        description:
            "Add a phone number to the store's blacklist with a reason, so new orders from it are flagged. Claude cannot remove a number; do that in the app.",
        input: z.object({
            phone: z.string().trim().min(7).max(30),
            reason: z.string().trim().min(2).max(200),
            notes: z.string().trim().max(500).optional(),
        }),
        async run(caller, input) {
            requireWriter(caller);
            const phone = orderPhone(input.phone, "Phone");
            const { data: existing, error: findError } = await caller.db
                .from("blacklist")
                .select("phone, reason")
                .eq("tenant_id", caller.tenantId)
                .like("phone", `%${phone.slice(-10)}`)
                .limit(1);
            if (findError) throw findError;
            if (existing && existing.length > 0) return `${phone} is already blacklisted: ${existing[0].reason}`;

            const { error } = await caller.db.from("blacklist").insert({
                tenant_id: caller.tenantId,
                phone,
                reason: input.reason,
                notes: input.notes ?? null,
                added_by: actorName(caller),
            });
            if (error) throw error;
            return `Blacklisted ${phone}: ${input.reason}.`;
        },
    });
}
