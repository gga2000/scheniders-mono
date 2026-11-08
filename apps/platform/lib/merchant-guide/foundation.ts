// =====================================================================
// Merchant guide — the foundation phase, read from the real shop
// =====================================================================
// Phase 1 of the guide has four steps, and each one is "done" only when the
// shop itself says so. Nothing here is a button the merchant pressed:
//
//   shop      the store has a name and a logo
//   product   at least one live product has a photo, a price and stock
//   delivery  every governorate has a delivery price (one price for all, or
//             a default plus per-governorate prices)
//   open      the store is published, and the published store passes
//             `shop` and `delivery` too, so what shoppers see is complete
//
// `shop` and `delivery` read the draft, because the editor saves there as the
// merchant types; `open` reads what is live.
// =====================================================================

import { IRAQ_GOVERNORATES, type StoreConfigV2 } from "@scheniders/shared";
import { shippingModeOf } from "@/lib/shipping-mode";

export const FOUNDATION_STEPS = ["shop", "product", "delivery", "open"] as const;
export type FoundationStep = (typeof FOUNDATION_STEPS)[number];

export type FoundationStatus = Record<FoundationStep, boolean>;

export interface FoundationInput {
    /** What the editor holds now (draft, else the live config). */
    working: StoreConfigV2 | null;
    /** What shoppers see. Null until the first publish. */
    published: StoreConfigV2 | null;
    /** Live products that have a photo, a price above zero and stock. */
    readyProducts: number;
}

export function hasShopDetails(config: StoreConfigV2 | null): boolean {
    const identity = config?.brand_kit?.identity;
    return Boolean(identity?.name?.trim()) && Boolean(identity?.logo_url?.trim());
}

/**
 * True when checkout prices every governorate from the merchant's own config
 * instead of the platform's fallback fee. A per-governorate config with no
 * default rate only counts when every governorate has its own price.
 */
export function hasDeliveryPrices(config: StoreConfigV2 | null): boolean {
    const shipping = config?.commerce?.shipping;
    if (shippingModeOf(shipping) === "unset") return false;
    if (shipping?.default_rate) return true;
    const rates = shipping?.rates ?? {};
    return IRAQ_GOVERNORATES.every((g) => rates[g.code] !== undefined);
}

export function foundationStatus(input: FoundationInput): FoundationStatus {
    return {
        shop: hasShopDetails(input.working),
        product: input.readyProducts > 0,
        delivery: hasDeliveryPrices(input.working),
        open:
            input.published !== null &&
            hasShopDetails(input.published) &&
            hasDeliveryPrices(input.published),
    };
}

/** The first step still to do, or null when the foundation is finished. */
export function nextFoundationStep(status: FoundationStatus): FoundationStep | null {
    return FOUNDATION_STEPS.find((step) => !status[step]) ?? null;
}

export function foundationDoneCount(status: FoundationStatus): number {
    return FOUNDATION_STEPS.filter((step) => status[step]).length;
}
