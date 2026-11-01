import { supabase } from "@/lib/supabase";
import { withRetry, NonRetryableError } from "./with-retry";
import type { Product, ProductSupplier, ProductVariant, ProductPriceHistory } from "@/types/product";
import { diag } from "@/lib/diag";
import type { Json } from "@scheniders/supabase";
import { fetchAllPages } from "./fetch-all-pages";
import { PRODUCT_READ_COLUMNS, PRODUCT_WITH_VARIANTS_COLUMNS, VARIANT_READ_COLUMNS, SUPPLIER_READ_COLUMNS } from "./product-columns";

/**
 * Stock is never part of a generic update. A product edit carries the stock it
 * loaded, which can be minutes old; writing it back would undo every order
 * that shipped since. Stock moves through adjustStock (a delta) or
 * setCountedStock / setCountedOpenBox (shelf counts), applied to the row's current value.
 */
/** A product to insert: only name and price are required, the database defaults the rest. */
export type NewProduct = Partial<Omit<Product, "id" | "created_at" | "updated_at" | "variants">> & Pick<Product, "name" | "price">;

export type ProductUpdate = Omit<Partial<Product>, "stock_quantity">;
export type VariantUpdate = Omit<Partial<ProductVariant>, "stock_quantity">;

/** A product as the top-bar search lists it. */
export type ProductSearchMatch = Pick<Product, "id" | "name" | "price">;

/**
 * The rows that replace a product's extras, by table. A table that is left out
 * is not touched; an empty array clears it.
 */
export interface ProductChildren {
    product_options?: { name: string; values: string[]; display_order: number; option_type: string; values_metadata: unknown }[];
    product_tiered_pricing?: { min_quantity: number; max_quantity: number | null; price: number }[];
    product_order_bumps?: { bump_product_id: string; discount_percentage: number; headline?: string | null; description?: string | null; display_order: number; is_active: boolean }[];
    product_related?: { related_product_id: string; relation_type: string; display_order: number }[];
    product_suppliers?: { supplier_name: string; supplier_contact?: string; supplier_email?: string; lead_time_days?: number | null; minimum_order_quantity?: number | null; unit_cost?: number | null; notes?: string; is_primary: boolean }[];
    product_bundle_items?: { child_product_id: string; quantity: number; display_order: number }[];
}

/**
 * A product write that RLS filtered out. Postgres reports an UPDATE or DELETE
 * whose rows the policy hides as "0 rows affected", not as an error, so a
 * write the user's role may not make would otherwise look like a success.
 */
export class ProductWriteDeniedError extends NonRetryableError {
    constructor(operation: string) {
        super(`${operation}: no row was changed (not permitted for this role)`);
        this.name = "ProductWriteDeniedError";
    }
}

/** Stock in a generic update is a programming error, not a value to drop. */
function assertNoStock(operation: string, data: object): void {
    if ("stock_quantity" in data) {
        throw new NonRetryableError(`${operation}: stock_quantity must be written with adjustStock or setCountedStock`);
    }
}

/**
 * The product's details changed after the editor loaded it (another tab, a
 * teammate, Claude). Saving would silently undo their change.
 */
export class ProductChangedElsewhereError extends NonRetryableError {
    constructor() {
        super("product changed since it was loaded");
        this.name = "ProductChangedElsewhereError";
    }
}

/**
 * Inserts and the guarded update run once. withRetry's timeout does not abort
 * the request, so a retry after a slow-but-successful attempt would insert a
 * second row, or report "changed elsewhere" against its own write.
 */
const WRITE_ONCE = { maxRetries: 0 } as const;

/** Postgres insufficient_privilege: the database function refused the caller. */
const INSUFFICIENT_PRIVILEGE = "42501";

function assertChanged(operation: string, rows: unknown[] | null, expected: number): void {
    if ((rows?.length ?? 0) < expected) throw new ProductWriteDeniedError(operation);
}

type ProductCostRow = { product_id: string; variant_id: string | null; cost: number | null; cost_breakdown_json: Json | null };

function costMaps(rows: ProductCostRow[]) {
    const productCost = new Map<string, { cost: number | null; cost_breakdown_json: Json | null }>();
    const variantCost = new Map<string, number | null>();
    for (const row of rows) {
        if (row.variant_id) variantCost.set(row.variant_id, row.cost);
        else productCost.set(row.product_id, { cost: row.cost, cost_breakdown_json: row.cost_breakdown_json });
    }
    return { productCost, variantCost };
}

/**
 * A bulk write names its rows in the URL (`id=in.(...)`), and a thousand uuids
 * is a ~37 KB URL the API refuses. Run in chunks; each chunk is one statement.
 */
const BULK_ID_CHUNK = 100;

async function inChunks(
    op: string,
    ids: string[],
    run: (chunk: string[]) => PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>,
): Promise<void> {
    let changed = 0;
    for (let i = 0; i < ids.length; i += BULK_ID_CHUNK) {
        const { data, error } = await run(ids.slice(i, i + BULK_ID_CHUNK));
        if (error) throw error;
        changed += data?.length ?? 0;
    }
    if (changed < ids.length) throw new ProductWriteDeniedError(op);
}

/**
 * ProductRepository — Centralized data access for products.
 */
export const productRepository = {
    /** Fetch the tenant's products with variants, newest first. */
    async findAll(tenantId: string): Promise<Product[]> {
        return withRetry('productRepository.findAll', async () => {
            const _t = performance.now();
            diag.log(`[Diag:ProductRepo] findAll query START`);

            // Cost is not a readable column: product_costs returns it, and only
            // what this member may see (everything for admins, supplies only
            // for other editors, nothing otherwise).
            // Every read is paged: the API silently stops at 1000 rows.
            const [data, costs, supplierRows, supplierCosts] = await Promise.all([
                fetchAllPages<Product>((from, to) =>
                    supabase
                        .from("products")
                        .select(PRODUCT_WITH_VARIANTS_COLUMNS)
                        .eq("tenant_id", tenantId)
                        .order("created_at", { ascending: false })
                        .order("id")
                        .range(from, to),
                ),
                fetchAllPages<ProductCostRow>((from, to) =>
                    // The functions have no ORDER BY: a stable order keeps pages from skipping or repeating rows.
                    supabase.rpc("product_costs", { p_tenant_id: tenantId }).order("product_id").order("variant_id").range(from, to),
                ),
                // The Supplies tab and reorder drawer group by supplier; without
                // these rows every supply lands in "no supplier" and cannot get a PO.
                fetchAllPages<ProductSupplier>((from, to) =>
                    supabase
                        .from("product_suppliers")
                        .select(SUPPLIER_READ_COLUMNS)
                        .eq("tenant_id", tenantId)
                        .order("is_primary", { ascending: false })
                        .order("created_at", { ascending: true })
                        .order("id")
                        .range(from, to),
                ),
                // Supplier unit cost only for members who may see cost.
                fetchAllPages<{ id: string; unit_cost: number | null }>((from, to) =>
                    supabase.rpc("supplier_unit_costs", { p_tenant_id: tenantId }).order("id").range(from, to),
                ),
            ]);

            diag.log(`[Diag:ProductRepo] findAll query DONE took=${(performance.now() - _t).toFixed(1)}ms rows=${data.length}`);
            const { productCost, variantCost } = costMaps(costs);
            const unitCostBySupplier = new Map(supplierCosts.map((row) => [row.id, row.unit_cost]));
            const suppliersByProduct = new Map<string, ProductSupplier[]>();
            for (const row of supplierRows) {
                if (!row.product_id) continue;
                const withCost = { ...row, unit_cost: row.id ? unitCostBySupplier.get(row.id) ?? null : null };
                const list = suppliersByProduct.get(row.product_id);
                if (list) list.push(withCost);
                else suppliersByProduct.set(row.product_id, [withCost]);
            }
            return data.map((product) => ({
                ...product,
                suppliers: suppliersByProduct.get(product.id) ?? [],
                cost: productCost.get(product.id)?.cost ?? null,
                cost_breakdown_json: productCost.get(product.id)?.cost_breakdown_json ?? null,
                variants: (product.variants ?? []).map((variant) => ({
                    ...variant,
                    cost: variantCost.get(variant.id) ?? null,
                })),
            })) as Product[];
        });
    },

    /**
     * Product cost by product id for the products of `tenantId` this member may
     * see cost of (all for admins, supplies for other editors). Missing = hidden.
     */
    async getProductCosts(tenantId: string): Promise<Map<string, number | null>> {
        const { data, error } = await supabase.rpc("product_costs", { p_tenant_id: tenantId });
        if (error) throw error;
        return new Map([...costMaps(data ?? []).productCost].map(([id, c]) => [id, c.cost]));
    },

    /**
     * Products of `tenantId` whose name contains `term`, for the top-bar search.
     * Only the columns a result row shows, and at most `limit` of them, so a
     * keystroke never pulls the whole catalogue with its variants.
     *
     * `*` and `%` are LIKE wildcards (PostgREST's and Postgres's) and `\` escapes
     * the next character; none means anything in a product name, so they are
     * dropped rather than escaped. An empty remainder searches nothing.
     */
    async searchByName(tenantId: string, term: string, limit: number): Promise<ProductSearchMatch[]> {
        // Dropped: LIKE wildcards, and the quote / backslash that would end or
        // escape the double-quoted values below. Quoting keeps ',', '.', ':'
        // and parentheses in a term from breaking the `or` filter apart.
        const text = term.replace(/[*%"\\]/g, "").trim();
        if (!text) return [];
        // A product is searched by every name it goes by, not only the
        // catalogue name: order cards show the short name or the name the
        // order arrived with (e.g. "بيرسيفيرون" for "عطر برسيفيرون الفاخر…"),
        // and that is what a merchant types. The aliases are the names
        // imported orders used; an alias matches when typed in full.
        const like = `"*${text}*"`;
        const { data, error } = await supabase
            .from("products")
            .select("id, name, price")
            .eq("tenant_id", tenantId)
            .or(
                `name.ilike.${like},display_name.ilike.${like},short_name.ilike.${like},sku.ilike.${like},` +
                `lightfunnels_aliases.cs.{"${text}"}`,
            )
            .order("name", { ascending: true })
            .limit(limit);
        if (error) throw error;
        return (data ?? []) as ProductSearchMatch[];
    },

    /**
     * Recompute reserved_quantity for all products in the tenant from active
     * (RESERVED-phase) orders. Run after manual data fixes to re-sync.
     */
    async recomputeInventory(tenantId: string | null): Promise<void> {
        return withRetry('productRepository.recomputeInventory', async () => {
            const { error } = await supabase.rpc('recompute_inventory', { p_tenant_id: tenantId });
            if (error) throw error;
        });
    },

    /**
     * Add (positive) or remove (negative) units of a product or variant. The
     * database applies the delta to the current stock and logs who and why.
     * Returns the new stock. Not retried: a retry after a lost response would
     * apply the delta twice.
     */
    async adjustStock(args: { productId: string; variantId?: string | null; delta: number; reason: string; notes?: string }): Promise<number> {
        const { data, error } = await supabase.rpc("adjust_product_stock", {
            p_product_id: args.productId,
            p_variant_id: args.variantId ?? undefined,
            p_delta: args.delta,
            p_reason: args.reason,
            p_notes: args.notes,
        });
        if (error) throw error;
        return data;
    },

    /**
     * Set stock to what was counted on the shelf. The difference from the
     * current stock is logged as a count. Returns the new stock.
     */
    async setCountedStock(args: { productId: string; variantId?: string | null; counted: number; notes?: string }): Promise<number> {
        const { data, error } = await supabase.rpc("set_counted_stock", {
            p_product_id: args.productId,
            p_variant_id: args.variantId ?? undefined,
            p_counted: args.counted,
            p_notes: args.notes,
        });
        if (error) throw error;
        return data;
    },

    /**
     * Set the open-box pile from a shelf count. The database subtracts the
     * open-box units confirmed orders still hold and logs the difference.
     * Returns the open box left to sell.
     */
    async setCountedOpenBox(args: { productId: string; variantId?: string | null; counted: number; notes?: string }): Promise<number> {
        const { data, error } = await supabase.rpc("set_counted_open_box", {
            p_product_id: args.productId,
            p_variant_id: args.variantId ?? undefined,
            p_counted: args.counted,
            p_notes: args.notes,
        });
        if (error) throw error;
        return data;
    },

    /** Insert a new product. Returns the created product. */
    async create(productData: NewProduct, tenantId: string | null): Promise<Product> {
        return withRetry('productRepository.create', async () => {
            // Strip computed/joined fields that have no column on `products`.
            // NOTE: `sku` is a real, writable column (used by LightFunnels order
            // matching) — it must stay in the payload, not be stripped here.
            const { variants: _variants, times_sold: _ts, total_revenue: _tr, times_sold_30d: _ts30, revenue_30d: _r30, profit_margin: _pm, average_order_value: _aov, ...data } = productData as Record<string, unknown>;
            const { data: newProduct, error } = await supabase
                .from("products")
                .insert([{ ...data, is_archived: false, tenant_id: tenantId }])
                .select(PRODUCT_READ_COLUMNS)
                .single();

            if (error) throw error;
            return newProduct;
        }, WRITE_ONCE);
    },

    /**
     * Update a product by ID and return its new updated_at. With
     * `expectedUpdatedAt`, the write applies only if the row still carries
     * that value (updated_at moves on every detail change, not on stock
     * movements); otherwise ProductChangedElsewhereError.
     */
    async update(id: string, data: ProductUpdate, opts: { expectedUpdatedAt?: string } = {}): Promise<string | null> {
        return withRetry('productRepository.update', async () => {
            // Strip computed/joined fields and immutable keys. `sku` is a real,
            // writable column (LightFunnels order matching depends on it) — keep it.
            assertNoStock("productRepository.update", data);
            const { variants: _variants, times_sold: _ts, total_revenue: _tr, times_sold_30d: _ts30, revenue_30d: _r30, profit_margin: _pm, average_order_value: _aov, id: _id, created_at: _ca, ...updateData } = data as Record<string, unknown>;
            let query = supabase.from("products").update(updateData).eq("id", id);
            if (opts.expectedUpdatedAt) query = query.eq("updated_at", opts.expectedUpdatedAt);
            const { data: changed, error } = await query.select("id, updated_at");

            if (error) throw error;
            if ((changed?.length ?? 0) === 0 && opts.expectedUpdatedAt) {
                // Zero rows is either "someone saved first" or "not allowed":
                // a still-readable row with a different updated_at is the first.
                const { data: current } = await supabase.from("products").select("updated_at").eq("id", id).maybeSingle();
                if (current && current.updated_at !== opts.expectedUpdatedAt) throw new ProductChangedElsewhereError();
            }
            assertChanged("productRepository.update", changed, 1);
            return (changed?.[0] as { updated_at: string | null } | undefined)?.updated_at ?? null;
        }, WRITE_ONCE);
    },

    /** Archive a product. */
    async archive(id: string): Promise<void> {
        return withRetry('productRepository.archive', async () => {
            const { data: changed, error } = await supabase
                .from("products")
                .update({ is_archived: true })
                .eq("id", id)
                .select("id");

            if (error) throw error;
            assertChanged("productRepository.archive", changed, 1);
        });
    },

    /** Restore an archived product. */
    async restore(id: string): Promise<void> {
        return withRetry('productRepository.restore', async () => {
            const { data: changed, error } = await supabase
                .from("products")
                .update({ is_archived: false })
                .eq("id", id)
                .select("id");

            if (error) throw error;
            assertChanged("productRepository.restore", changed, 1);
        });
    },

    /** Hard-delete a product. */
    async delete(id: string): Promise<void> {
        return withRetry('productRepository.delete', async () => {
            const { data: changed, error } = await supabase
                .from("products")
                .delete()
                .eq("id", id)
                .select("id");

            if (error) throw error;
            assertChanged("productRepository.delete", changed, 1);
        }, WRITE_ONCE);
    },

    /**
     * Bulk price change with its side effects, in one database transaction
     * (set_product_prices): a compare-at ("was") price that is no longer above
     * the new price is cleared, and each changed price lands in the price
     * history. Either everything applies or nothing does.
     */
    async bulkChangePrice(
        changes: { id: string; oldPrice: number; clearCompareAt: boolean }[],
        price: number,
    ): Promise<void> {
        return withRetry('productRepository.bulkChangePrice', async () => {
            const { error } = await supabase.rpc("set_product_prices", {
                p_changes: changes.map((c) => ({
                    id: c.id,
                    price,
                    set_compare_at: c.clearCompareAt,
                    compare_at_price: null,
                })),
                p_reason: "Bulk price change",
            });
            if (error?.code === INSUFFICIENT_PRIVILEGE) throw new ProductWriteDeniedError("productRepository.bulkChangePrice");
            if (error) throw error;
        }, WRITE_ONCE);
    },

    /** Undo of a bulk price change: each product gets its own previous price and "was" price back. */
    async restorePrices(
        previous: { id: string; price: number; compare_at_price: number | null; currentPrice: number }[],
    ): Promise<void> {
        return withRetry('productRepository.restorePrices', async () => {
            const { error } = await supabase.rpc("set_product_prices", {
                p_changes: previous.map((p) => ({
                    id: p.id,
                    price: p.price,
                    // Refuse (40001) if someone edited the price since the bulk change.
                    expected_price: p.currentPrice,
                    set_compare_at: true,
                    compare_at_price: p.compare_at_price,
                })),
                p_reason: "Bulk price change undone",
            });
            if (error?.code === INSUFFICIENT_PRIVILEGE) throw new ProductWriteDeniedError("productRepository.restorePrices");
            if (error) throw error;
        }, WRITE_ONCE);
    },

    /** Bulk-archive multiple products. */
    async bulkArchive(ids: string[]): Promise<void> {
        return withRetry('productRepository.bulkArchive', async () => {
            await inChunks("productRepository.bulkArchive", ids, (chunk) =>
                supabase
                    .from("products")
                    .update({ is_archived: true })
                    .in("id", chunk)
                    .select("id"),
            );
        });
    },

    /** Bulk-restore multiple archived products. */
    async bulkRestore(ids: string[]): Promise<void> {
        return withRetry('productRepository.bulkRestore', async () => {
            await inChunks("productRepository.bulkRestore", ids, (chunk) =>
                supabase
                    .from("products")
                    .update({ is_archived: false })
                    .in("id", chunk)
                    .select("id"),
            );
        });
    },

    /** Bulk-delete multiple products permanently. */
    async bulkDelete(ids: string[]): Promise<void> {
        return withRetry('productRepository.bulkDelete', async () => {
            await inChunks("productRepository.bulkDelete", ids, (chunk) =>
                supabase
                    .from("products")
                    .delete()
                    .in("id", chunk)
                    .select("id"),
            );
        }, WRITE_ONCE);
    },

    /** Bulk-update storefront visibility for multiple products. */
    async bulkUpdateVisibility(ids: string[], isVisible: boolean): Promise<void> {
        return withRetry('productRepository.bulkUpdateVisibility', async () => {
            await inChunks("productRepository.bulkUpdateVisibility", ids, (chunk) =>
                supabase
                    .from("products")
                    .update({ is_visible: isVisible })
                    .in("id", chunk)
                    .select("id"),
            );
        });
    },

    /** Bulk-update category for multiple products. Pass null to clear category. */
    async bulkUpdateCategory(ids: string[], categoryId: string | null): Promise<void> {
        return withRetry('productRepository.bulkUpdateCategory', async () => {
            await inChunks("productRepository.bulkUpdateCategory", ids, (chunk) =>
                supabase
                    .from("products")
                    .update({ category_id: categoryId })
                    .in("id", chunk)
                    .select("id"),
            );
        });
    },

    /** Bulk-update display_order for multiple products. */
    async bulkUpdateDisplayOrder(updates: { id: string; display_order: number }[]): Promise<void> {
        return withRetry('productRepository.bulkUpdateDisplayOrder', async () => {
            // One statement: a failure leaves the list as it was, never half-reordered.
            const { error } = await supabase.rpc("set_product_display_order", { p_orders: updates });
            if (error?.code === INSUFFICIENT_PRIVILEGE) throw new ProductWriteDeniedError("productRepository.bulkUpdateDisplayOrder");
            if (error) throw error;
        }, WRITE_ONCE);
    },

    /** Fetch price history for a product. */
    async getPriceHistory(productId: string): Promise<ProductPriceHistory[]> {
        return withRetry('productRepository.getPriceHistory', async () => {
            const { data, error } = await supabase
                .from("product_price_history")
                .select("*")
                .eq("product_id", productId)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data || [];
        });
    },

    // =============================================
    // VARIANT OPERATIONS
    // =============================================

    /** Add a variant to a product. */
    async addVariant(productId: string, data: Partial<ProductVariant>, tenantId: string | null): Promise<ProductVariant> {
        return withRetry('productRepository.addVariant', async () => {
            const { data: newVariant, error } = await supabase
                .from("product_variants")
                .insert([{ product_id: productId, ...data, tenant_id: tenantId }])
                .select(VARIANT_READ_COLUMNS)
                .single();

            if (error) throw error;
            return newVariant;
        }, WRITE_ONCE);
    },

    /** Update a variant. */
    async updateVariant(id: string, data: VariantUpdate): Promise<void> {
        return withRetry('productRepository.updateVariant', async () => {
            assertNoStock("productRepository.updateVariant", data);
            const { data: changed, error } = await supabase
                .from("product_variants")
                .update(data)
                .eq("id", id)
                .select("id");

            if (error) throw error;
            assertChanged("productRepository.updateVariant", changed, 1);
        });
    },

    /** Delete a variant. */
    async deleteVariant(id: string): Promise<void> {
        return withRetry('productRepository.deleteVariant', async () => {
            const { data: changed, error } = await supabase
                .from("product_variants")
                .delete()
                .eq("id", id)
                .select("id");

            if (error) throw error;
            assertChanged("productRepository.deleteVariant", changed, 1);
        });
    },

    // =============================================
    // PRODUCT OPTIONS
    // =============================================

    /**
     * Replace a product's options, price tiers, order bumps, related products,
     * suppliers and bundle items in one transaction (save_product_children):
     * either every table given is replaced or none is.
     */
    async saveChildren(productId: string, children: ProductChildren): Promise<void> {
        const { error } = await supabase.rpc("save_product_children", {
            p_product_id: productId,
            p_children: children as unknown as Json,
        });
        if (error) throw error;
    },

    /** Fetch all options for a product, ordered by display_order. */
    async getProductOptions(productId: string): Promise<any[]> {
        return withRetry('productRepository.getProductOptions', async () => {
            const { data, error } = await supabase
                .from("product_options")
                .select("*")
                .eq("product_id", productId)
                .order("display_order", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },


    // =============================================
    // TIERED PRICING
    // =============================================

    /** Fetch tiered pricing for a product, ordered by min_quantity. */
    async getTieredPrices(productId: string): Promise<any[]> {
        return withRetry('productRepository.getTieredPrices', async () => {
            const { data, error } = await supabase
                .from("product_tiered_pricing")
                .select("*")
                .eq("product_id", productId)
                .order("min_quantity", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },


    // =============================================
    // ORDER BUMPS
    // =============================================

    /** Fetch order bumps for a product, ordered by display_order. */
    async getOrderBumps(productId: string): Promise<any[]> {
        return withRetry('productRepository.getOrderBumps', async () => {
            const { data, error } = await supabase
                .from("product_order_bumps")
                .select("*")
                .eq("product_id", productId)
                .order("display_order", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },


    // =============================================
    // RELATED PRODUCTS
    // =============================================

    /** Fetch related products, ordered by display_order. */
    async getRelatedProducts(productId: string): Promise<any[]> {
        return withRetry('productRepository.getRelatedProducts', async () => {
            const { data, error } = await supabase
                .from("product_related")
                .select("*")
                .eq("product_id", productId)
                .order("display_order", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },


    // =============================================
    // INVENTORY HISTORY (immutable log — insert only)
    // =============================================

    /** Fetch inventory history for a product, newest first. */
    async getInventoryHistory(productId: string): Promise<any[]> {
        return withRetry('productRepository.getInventoryHistory', async () => {
            const { data, error } = await supabase
                .from("inventory_history")
                .select("*")
                .eq("product_id", productId)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data || [];
        });
    },

    /** Add a single inventory history entry (immutable log). */
    async addInventoryEntry(productId: string, entry: { change_type: string; quantity_change: number; quantity_before: number; quantity_after: number; reference_id?: string; notes?: string; changed_by?: string }, tenantId: string | null): Promise<void> {
        return withRetry('productRepository.addInventoryEntry', async () => {
            const { error } = await supabase
                .from("inventory_history")
                .insert([{ product_id: productId, tenant_id: tenantId, ...entry }]);

            if (error) throw error;
        }, WRITE_ONCE);
    },

    // =============================================
    // SUPPLIERS
    // =============================================

    /** Fetch suppliers for a product, primary first then by created_at. */
    async getSuppliers(productId: string): Promise<any[]> {
        return withRetry('productRepository.getSuppliers', async () => {
            const [{ data, error }, { data: costs, error: costError }] = await Promise.all([
                supabase
                    .from("product_suppliers")
                    .select(SUPPLIER_READ_COLUMNS)
                    .eq("product_id", productId)
                    .order("is_primary", { ascending: false })
                    .order("created_at", { ascending: true }),
                // Unit cost only for members who may see cost.
                supabase.rpc("product_supplier_costs", { p_product_id: productId }),
            ]);

            if (error) throw error;
            if (costError) throw costError;
            const unitCost = new Map((costs ?? []).map((row: { id: string; unit_cost: number | null }) => [row.id, row.unit_cost]));
            return (data ?? []).map((supplier) => ({ ...supplier, unit_cost: unitCost.get(supplier.id) ?? null }));
        });
    },


    // =============================================
    // ACTIVITY LOG (immutable log — insert only)
    // =============================================

    /** Fetch recent activity log entries for a product (max 50). */
    async getActivityLog(productId: string): Promise<any[]> {
        return withRetry('productRepository.getActivityLog', async () => {
            const { data, error } = await supabase
                .from("product_activity_log")
                .select("*")
                .eq("product_id", productId)
                .order("created_at", { ascending: false })
                .limit(50);

            if (error) throw error;
            return data || [];
        });
    },

    /** Add a single activity log entry (immutable log). */
    async addActivityLogEntry(productId: string, entry: { action: string; changes_json?: Json; user_id?: string }, tenantId: string | null): Promise<void> {
        return withRetry('productRepository.addActivityLogEntry', async () => {
            const { error } = await supabase
                .from("product_activity_log")
                .insert([{ product_id: productId, tenant_id: tenantId, ...entry }]);

            if (error) throw error;
        }, WRITE_ONCE);
    },

    // =============================================
    // PRICE HISTORY (immutable log — insert only)
    // =============================================

    /** Add a single price history entry. */
    async addPriceHistoryEntry(productId: string, entry: { old_price?: number; new_price: number; changed_by?: string; reason?: string }, tenantId: string | null): Promise<void> {
        return withRetry('productRepository.addPriceHistoryEntry', async () => {
            const { error } = await supabase
                .from("product_price_history")
                .insert([{ product_id: productId, tenant_id: tenantId, ...entry }]);

            if (error) throw error;
        }, WRITE_ONCE);
    },

    // =============================================
    // BUNDLE ITEMS
    // =============================================

    /** Fetch bundle items for a product, ordered by display_order. */
    async getBundleItems(productId: string): Promise<any[]> {
        return withRetry('productRepository.getBundleItems', async () => {
            const { data, error } = await supabase
                .from("product_bundle_items")
                .select("*")
                .eq("product_id", productId)
                .order("display_order", { ascending: true });

            if (error) throw error;
            return data || [];
        });
    },

};
