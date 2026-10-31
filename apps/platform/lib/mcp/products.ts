import { z } from "zod";
import type { McpCaller } from "@/lib/mcp/caller";
import { McpToolError } from "@/lib/mcp/tool";

/** A product as merchants refer to it: its id, its SKU, or its exact name. */
export const productRefSchema = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("The product id, its SKU, or its exact name (list_products shows all three).");

export const variantRefSchema = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("For a product with variants: the variant id, SKU or exact name.");

export type CatalogProduct = {
    id: string;
    name: string;
    sku: string | null;
    price: number | null;
    compare_at_price: number | null;
    stock_quantity: number | null;
    reserved_quantity: number | null;
    open_box_quantity: number | null;
    is_visible: boolean | null;
};

export type CatalogVariant = {
    id: string;
    product_id: string;
    name: string;
    sku: string | null;
    price: number | null;
    compare_at_price: number | null;
    stock_quantity: number | null;
    reserved_quantity: number | null;
    open_box_quantity: number | null;
    is_enabled: boolean | null;
};

const PRODUCT_COLUMNS = "id, name, sku, price, compare_at_price, stock_quantity, reserved_quantity, open_box_quantity, is_visible";
const VARIANT_COLUMNS = "id, product_id, name, sku, price, compare_at_price, stock_quantity, reserved_quantity, open_box_quantity, is_enabled";
const UUID = z.string().uuid();

const sameText = (a: string | null, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/**
 * One live, non-supply product of the caller's store, with its variants. The
 * tenant filter is explicit on top of RLS: the stock RPCs take the tenant from
 * the product row, so this is what keeps Claude inside the active store.
 */
export async function findProduct(
    caller: McpCaller,
    ref: string,
): Promise<{ product: CatalogProduct; variants: CatalogVariant[] }> {
    const base = () =>
        caller.db
            .from("products")
            .select(PRODUCT_COLUMNS)
            .eq("tenant_id", caller.tenantId)
            .eq("is_archived", false)
            .or("is_supply.is.null,is_supply.eq.false");

    let matches: CatalogProduct[];
    if (UUID.safeParse(ref).success) {
        const { data, error } = await base().eq("id", ref);
        if (error) throw error;
        matches = (data ?? []) as CatalogProduct[];
    } else {
        const { data, error } = await base().or(`sku.eq.${quoted(ref)},name.ilike.${quoted(ref)}`);
        if (error) throw error;
        const rows = (data ?? []) as CatalogProduct[];
        const bySku = rows.filter((p) => sameText(p.sku, ref));
        matches = bySku.length > 0 ? bySku : rows.filter((p) => sameText(p.name, ref));
    }

    if (matches.length === 0) throw new McpToolError(`No product "${ref}" in this store. Use list_products to find it.`);
    if (matches.length > 1) {
        throw new McpToolError(
            `More than one product matches "${ref}": ${matches.map((p) => `${p.name} (id ${p.id})`).join(", ")}. Use the id.`,
        );
    }

    const product = matches[0];
    const { data: variants, error } = await caller.db
        .from("product_variants")
        .select(VARIANT_COLUMNS)
        .eq("tenant_id", caller.tenantId)
        .eq("product_id", product.id);
    if (error) throw error;
    return { product, variants: (variants ?? []) as CatalogVariant[] };
}

/** The variant a stock or price change applies to, or null for a product without variants. */
export function pickVariant(product: CatalogProduct, variants: CatalogVariant[], ref: string | undefined): CatalogVariant | null {
    if (ref === undefined) {
        if (variants.length > 0) {
            throw new McpToolError(
                `${product.name} has variants; say which one: ${variants.map((v) => `${v.name} (id ${v.id})`).join(", ")}.`,
            );
        }
        return null;
    }
    const matches = variants.filter((v) => v.id === ref || sameText(v.sku, ref) || sameText(v.name, ref));
    if (matches.length !== 1) {
        throw new McpToolError(
            matches.length === 0
                ? `${product.name} has no variant "${ref}".`
                : `More than one variant of ${product.name} matches "${ref}"; use the variant id.`,
        );
    }
    return matches[0];
}

/** A PostgREST filter value in double quotes, so commas and dots in names stay literal. */
function quoted(value: string): string {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
