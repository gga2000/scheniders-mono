import type { OrderItem } from "@/types/order";

/**
 * F-001: an order line names its product / variant by id, and those ids come
 * from the caller (the order form, the Telegram bot). Stock moves follow the
 * ids, so a line naming another tenant's product would move that tenant's
 * stock. The database refuses such an order (trigger
 * trg_orders_items_tenant_guard, migration 20261020150000); this check runs
 * first on the trusted server path so the caller gets a clear error instead
 * of a raw Postgres one.
 *
 * Ids that match no row are not judged here: a line may name a product that
 * was since deleted, and the database treats those the same way.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CatalogTable = "products" | "product_variants";

export type CatalogOwnerLookup = (
    table: CatalogTable,
    ids: string[],
) => Promise<{ id: string; tenant_id: string | null }[]>;

function uuidsOf(items: readonly Pick<OrderItem, "product_id" | "variant_id">[], key: "product_id" | "variant_id"): string[] {
    const ids = new Set<string>();
    for (const item of items) {
        const id = item[key];
        if (id && UUID_RE.test(id)) ids.add(id);
    }
    return [...ids];
}

/** Ids among the items' product_id / variant_id that belong to another tenant. */
export async function findForeignCatalogRefs(
    lookup: CatalogOwnerLookup,
    tenantId: string,
    items: readonly Pick<OrderItem, "product_id" | "variant_id">[],
): Promise<string[]> {
    const checks: [CatalogTable, string[]][] = [
        ["products", uuidsOf(items, "product_id")],
        ["product_variants", uuidsOf(items, "variant_id")],
    ];
    const foreign: string[] = [];
    for (const [table, ids] of checks) {
        if (ids.length === 0) continue;
        const rows = await lookup(table, ids);
        for (const row of rows) {
            if (row.tenant_id !== tenantId) foreign.push(row.id);
        }
    }
    return foreign;
}

/** Lines with a negative quantity (they would invert the stock movement). */
export function hasNegativeQuantity(items: readonly Pick<OrderItem, "quantity">[]): boolean {
    return items.some((item) => item.quantity < 0);
}
