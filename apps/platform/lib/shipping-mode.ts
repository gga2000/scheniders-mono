// Which of the delivery screen's answers a stored shipping config represents.
// Shared by the store editor's delivery screen and the merchant guide, so both
// read "has this shop set its delivery prices?" the same way.
import type { GovernorateShippingConfig } from "@scheniders/shared";

export type ShippingMode = "unset" | "free" | "flat" | "by_governorate";

/**
 * Which of the three answers the stored config represents.
 *
 * Derived rather than stored: a `mode` field would be a second source of
 * truth that could disagree with the rates underneath it, and every store
 * configured before this screen existed has no such field anyway.
 */
export function shippingModeOf(
    shipping: GovernorateShippingConfig | undefined,
): ShippingMode {
    const def = shipping?.default_rate;
    const overrides = Object.keys(shipping?.rates ?? {}).length > 0;
    if (!def && !overrides) return "unset";
    if (overrides) return "by_governorate";
    if (def?.fee_iqd === 0 && def.free_threshold_iqd === undefined) return "free";
    return "flat";
}
