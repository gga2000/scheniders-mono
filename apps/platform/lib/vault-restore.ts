/**
 * What a vault restore may write into `products` and `customer_metadata`.
 *
 * The restore runs with the service role, so these lists are the whole write
 * boundary: a column that is not named here is never written, whatever the
 * backup file carries. Cost is left out on purpose (it lives behind the
 * product cost RPCs and a backup row may hold a stale or hidden value), and so
 * are the stock counters of a product that already exists: a snapshot's
 * quantities are older than every sale since, and writing them back would
 * undo those sales.
 */

/** Written for every restored product, new or existing. */
export const PRODUCT_RESTORE_COLUMNS: readonly string[] = [
    "id", "name", "description", "short_description", "price", "compare_at_price", "website_price",
    "low_stock_threshold", "reorder_point", "image_url", "gallery_urls", "feature_cards", "is_archived",
    "status", "status_before_archive", "tag_color", "sku", "barcode", "slug", "is_visible", "display_order",
    "category_id", "lightfunnels_aliases", "is_supply", "product_type", "weight", "dimensions_json",
    "duration_minutes", "booking_enabled", "download_url", "file_size", "license_key_pattern",
    "short_name", "bestseller_rank", "is_filler", "brand", "size_ml", "display_name", "gender", "created_at",
];

/** Written only when the product does not exist yet; an existing product keeps its live count. */
export const PRODUCT_NEW_ONLY_COLUMNS: readonly string[] = ["stock_quantity", "open_box_quantity"];

export const CUSTOMER_RESTORE_COLUMNS: readonly string[] = [
    "customer_phone", "birthday", "manual_status", "ai_summary", "ai_summary_generated_at", "created_at",
];

function pick(row: Record<string, unknown>, columns: readonly string[]): Record<string, unknown> {
    const picked: Record<string, unknown> = {};
    for (const name of columns) {
        if (name in row) picked[name] = row[name];
    }
    return picked;
}

export function pickProductWrite(row: Record<string, unknown>, tenantId: string, exists: boolean): Record<string, unknown> {
    return {
        ...pick(row, exists ? PRODUCT_RESTORE_COLUMNS : [...PRODUCT_RESTORE_COLUMNS, ...PRODUCT_NEW_ONLY_COLUMNS]),
        tenant_id: tenantId,
    };
}

export function pickCustomerWrite(row: Record<string, unknown>, tenantId: string): Record<string, unknown> {
    return { ...pick(row, CUSTOMER_RESTORE_COLUMNS), tenant_id: tenantId };
}

/** Rows per restore call; server action bodies are capped at 1 MB. */
export const RESTORE_ROWS_BATCH_SIZE = 100;
