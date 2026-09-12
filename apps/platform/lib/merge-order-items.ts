// =============================================
// MERGE DUPLICATE ORDER LINES
//
// LightFunnels' order payload lists one entry per unit and carries no quantity
// field, so an order for three of the same perfume arrives as three separate
// lines of quantity 1. The card then shows "بيرسيفيرون ×1" three times instead of
// "بيرسيفيرون ×3", which reads like three different products and makes packers
// pick the wrong thing.
//
// Merging happens at ingestion for new orders and again at display, so the
// thousands of orders already stored with split lines read correctly too.
// =============================================

import type { OrderItem } from "@/types/order";

function norm(value: string | undefined | null): string {
    return (value ?? "").trim().toLowerCase();
}

/**
 * Are these two lines the same product at the same price?
 *
 * Written as a comparison rather than a hash key on purpose. A key built from
 * "variant_id else product_id else sku else name" hashes the *same* product
 * differently depending on which fields happen to be populated — one line with a
 * SKU and one without would never merge, which is exactly the intermittent
 * "sometimes it does not catch it" behaviour this fixes.
 *
 * Price is part of the comparison deliberately: the same product sold twice at
 * different prices (a bump, a one-unit discount) is genuinely two lines, and
 * collapsing them would misstate what the customer agreed to pay.
 */
function isSameLine(a: OrderItem, b: OrderItem): boolean {
    if ((Number(a.price) || 0) !== (Number(b.price) || 0)) return false;
    if (!!a.is_open_box !== !!b.is_open_box) return false;
    if ((a.tag_color ?? null) !== (b.tag_color ?? null)) return false;

    // When both sides name a variant, that is authoritative in both directions:
    // two variants of one product are different lines even under one title.
    const variantA = norm(a.variant_id);
    const variantB = norm(b.variant_id);
    if (variantA && variantB) return variantA === variantB;

    // Same for the product id, then the SKU. Each is only consulted when BOTH
    // lines carry it, so a missing field never forces a false negative.
    const productA = norm(a.product_id);
    const productB = norm(b.product_id);
    if (productA && productB && productA !== productB) return false;

    const skuA = norm(a.sku);
    const skuB = norm(b.sku);
    if (skuA && skuB && skuA !== skuB) return false;
    if (skuA && skuB && skuA === skuB) return true;

    if (productA && productB) return true;

    return norm(a.name) === norm(b.name);
}

/**
 * Collapse repeated lines into one line per product, summing quantities.
 *
 * Order is preserved by first appearance, and the first occurrence keeps its
 * image and metadata — later duplicates only contribute quantity.
 */
export function mergeOrderItems(items: OrderItem[] | null | undefined): OrderItem[] {
    if (!Array.isArray(items) || items.length < 2) {
        return Array.isArray(items) ? items : [];
    }

    const merged: OrderItem[] = [];

    for (const item of items) {
        if (!item) continue;
        const quantity = Number(item.quantity) || 1;
        const existing = merged.find(candidate => isSameLine(candidate, item));

        if (!existing) {
            merged.push({ ...item, quantity });
            continue;
        }

        existing.quantity += quantity;
        // Fill gaps from later duplicates rather than dropping information: the
        // first line may lack the image or SKU that the second one carries.
        if (!existing.image_url && item.image_url) existing.image_url = item.image_url;
        if (!existing.sku && item.sku) existing.sku = item.sku;
        if (!existing.product_id && item.product_id) existing.product_id = item.product_id;
        if (!existing.variant_id && item.variant_id) existing.variant_id = item.variant_id;
    }

    return merged;
}

/** True when merging would actually change the list — useful for backfills. */
export function hasDuplicateItems(items: OrderItem[] | null | undefined): boolean {
    if (!Array.isArray(items) || items.length < 2) return false;
    return mergeOrderItems(items).length !== items.length;
}
