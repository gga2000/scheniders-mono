// =====================================================================
// Merchant guide — the foundation phase, read from the real shop
// =====================================================================
// Phase 1 of the guide has three steps, and each one is "done" only when the
// shop itself says so. Nothing here is a button the merchant pressed:
//
//   shop      the store has a name and a logo
//   product   at least one live product has a photo, a price and stock
//   open      the store is published, and the published store passes
//             `shop` too, so what shoppers see has a name and a logo
//
// Delivery prices are not part of it (Ali, 28 Nov: not important at the
// start). Until a shop sets them, checkout charges the platform's default
// fee; the follow-up delivery tour shows where to set them (tours.ts).
//
// `shop` reads the draft, because the editor saves there as the merchant
// types; `open` reads what is live.
// =====================================================================

import type { StoreConfigV2 } from "@scheniders/shared";

export const FOUNDATION_STEPS = ["shop", "product", "open"] as const;
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

export function foundationStatus(input: FoundationInput): FoundationStatus {
    return {
        shop: hasShopDetails(input.working),
        product: input.readyProducts > 0,
        open: input.published !== null && hasShopDetails(input.published),
    };
}

/**
 * The order the steps come in. A merchant with no logo yet can put the shop
 * step off («بعدين», Ali 28 Nov): the product comes first, and the logo
 * comes back before the shop opens, since opening needs it.
 */
export function foundationOrder(logoLater: boolean): readonly FoundationStep[] {
    return logoLater ? ["product", "shop", "open"] : FOUNDATION_STEPS;
}

/** The first step still to do, or null when the foundation is finished. */
export function nextFoundationStep(status: FoundationStatus, logoLater = false): FoundationStep | null {
    return foundationOrder(logoLater).find((step) => !status[step]) ?? null;
}

export function foundationDoneCount(status: FoundationStatus): number {
    return FOUNDATION_STEPS.filter((step) => status[step]).length;
}
