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

/**
 * The smaller tables a vault carries beside products, customers and orders.
 * Each has its own column list for the same reason as above: a column that is
 * not named is never written. Foreign keys that must point into the same
 * store (category parent, assignment tag, expense order, note author) are
 * checked by the restore action, not here.
 */
export const EXTRA_TABLES = ["categories", "expenses", "customer_tags", "customer_tag_assignments", "customer_notes"] as const;
export type ExtraTable = (typeof EXTRA_TABLES)[number];

/** `parent_id` is set in a second pass, after every category of the file exists. `brand_id` is not restored. */
export const EXTRA_RESTORE_COLUMNS: Record<ExtraTable, readonly string[]> = {
    categories: [
        "id", "name", "slug", "description", "image_url", "display_order", "is_visible", "created_at", "status",
        "published_at", "unpublish_at", "archived_at", "banner_url", "accent_color", "icon", "name_ar", "name_en",
        "description_ar", "description_en", "meta_title", "meta_description", "og_image_url", "canonical_url",
        "show_in_main_nav", "show_in_mega_menu", "show_in_mobile_drawer", "nav_variant", "page_config",
        "page_config_draft", "landing_page_url", "scope",
    ],
    expenses: ["id", "expense_date", "category", "description", "amount", "order_id", "notes", "is_recurring", "recurring_period", "created_at"],
    customer_tags: ["id", "name", "color", "created_at"],
    customer_tag_assignments: ["id", "customer_phone", "tag_id", "created_at"],
    customer_notes: ["id", "customer_phone", "note", "created_at", "created_by"],
};

/** Order the extras go back in: categories before products, tags before their assignments, orders before expenses. */
export const EXTRAS_BEFORE_PRODUCTS: readonly ExtraTable[] = ["categories"];
export const EXTRAS_AFTER_CUSTOMERS: readonly ExtraTable[] = ["customer_tags", "customer_tag_assignments", "customer_notes"];
export const EXTRAS_AFTER_ORDERS: readonly ExtraTable[] = ["expenses"];

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

export function pickExtraWrite(table: ExtraTable, row: Record<string, unknown>, tenantId: string): Record<string, unknown> {
    return { ...pick(row, EXTRA_RESTORE_COLUMNS[table]), tenant_id: tenantId };
}

/** Rows per restore call; server action bodies are capped at 1 MB. */
export const RESTORE_ROWS_BATCH_SIZE = 100;
