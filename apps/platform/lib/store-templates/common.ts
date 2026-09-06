// =====================================================================
// Store template — shared page builders
// =====================================================================
// Cart, checkout, order-tracking and the four policy pages are functional
// rather than expressive: every direction needs the same sections there,
// and the visual difference comes from the brand kit, not the stack. They
// live here so the five template files stay focused on the pages that
// actually carry the direction (home, category, product, about, faq).
// =====================================================================

import type { PageId, SectionInstance } from "@scheniders/shared";
import { section } from "./types";

/**
 * Per-template section factory with an auto-incrementing placeholder id,
 * so a template file never has to hand-number its sections.
 */
export function makeSectionFactory(
    templateId: string,
): (type: string, overrides?: Record<string, unknown>) => SectionInstance {
    let n = 0;
    return (type, overrides) => section(templateId, ++n, type, overrides);
}

export type SectionFactory = ReturnType<typeof makeSectionFactory>;

/** Trust marquee copy shared by the directions that use a marquee. */
export const TRUST_MESSAGES = [
    { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
    { en: "Delivery to every governorate", ar: "توصيل لكل المحافظات" },
    { en: "Free returns within 14 days", ar: "إرجاع مجاني خلال ١٤ يوم" },
];

/** WhatsApp-wired secondary CTA for hero sections. */
export const WHATSAPP_CTA = {
    secondary_cta_kind: "whatsapp",
    secondary_cta_value: "",
    secondary_cta_label_i18n: {
        en: "Order on WhatsApp",
        ar: "اطلب عبر واتساب",
    },
};

/**
 * Cart, checkout, order-tracking and policy pages. Identical across every
 * direction — the brand kit is what makes them look different.
 */
export function commercePages(
    s: SectionFactory,
): Partial<Record<PageId, SectionInstance[]>> {
    return {
        search: [s("search_results_grid")],
        // No free_gift_strip by default: it promises "spend X to unlock a
        // gift" that nothing in commerce config backs, so a fresh store made
        // a false offer to every COD shopper. Merchants who run a real gift
        // threshold add the section deliberately.
        cart: [
            s("cart_line_items"),
            s("cart_summary"),
            s("trust_strip"),
            s("sticky_cta_bar"),
        ],
        checkout: [
            s("checkout_form"),
            s("checkout_order_summary"),
            s("trust_strip"),
        ],
        checkout_success: [s("order_tracker"), s("product_grid")],
        // order_tracker ships its own lookup form — seeding
        // track_order_lookup beside it rendered two lookup forms on /track.
        track: [s("order_tracker")],
        policy_shipping: [s("policy_content")],
        policy_returns: [s("policy_content")],
        policy_privacy: [s("policy_content")],
        policy_terms: [s("policy_content")],
    };
}
