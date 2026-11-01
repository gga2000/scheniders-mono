/**
 * The columns a signed-in member may read on products, product_variants and
 * product_suppliers: every column except cost (products.cost,
 * products.cost_breakdown_json, product_variants.cost,
 * product_suppliers.unit_cost). Migration 20261031004000 grants exactly these,
 * so a `select("*")` on those tables is refused for every caller; cost comes
 * from the product_costs / product_supplier_costs RPCs, which return it only to
 * members who may see it. product-select-guard.test.ts keeps reads on these
 * lists.
 */
export const PRODUCT_READ_COLUMNS =
    "id, created_at, updated_at, name, description, price, stock_quantity, low_stock_threshold, image_url, is_archived, tag_color, compare_at_price, sku, lightfunnels_aliases, reserved_quantity, is_supply, tenant_id, slug, is_visible, display_order, website_price, storefront_stock, short_description, category_id, barcode, reorder_point, status, product_type, weight, dimensions_json, duration_minutes, booking_enabled, download_url, file_size, license_key_pattern, open_box_quantity, gallery_urls, feature_cards, short_name, bestseller_rank, is_filler, brand, size_ml, display_name, gender, status_before_archive";

export const VARIANT_READ_COLUMNS =
    "id, product_id, created_at, updated_at, name, price, stock_quantity, sku, tenant_id, reserved_quantity, compare_at_price, weight, dimensions_json, barcode, low_stock_threshold, display_order, option_values, image_url, is_enabled, open_box_quantity";

export const SUPPLIER_READ_COLUMNS =
    "id, product_id, tenant_id, supplier_name, supplier_contact, supplier_email, lead_time_days, minimum_order_quantity, notes, is_primary, created_at";

/** A product row with its variants, as the products list reads it. */
export const PRODUCT_WITH_VARIANTS_COLUMNS =
    `${PRODUCT_READ_COLUMNS}, variants:product_variants(${VARIANT_READ_COLUMNS})` as const;
