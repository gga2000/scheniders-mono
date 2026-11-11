// =====================================================================
// Page template — Sale page
// =====================================================================
// Promo banner + hero + sale-tagged product grid + trust. No countdown: a
// template cannot know the merchant's real sale end date.
// =====================================================================

import { getManifestEntry } from "@/lib/sections-manifest";
import { tplId, type PageTemplate } from "./types";

function defaults(type: string): Record<string, unknown> {
    const e = getManifestEntry(type);
    if (!e) throw new Error(`Missing manifest entry: ${type}`);
    return JSON.parse(JSON.stringify(e.defaultProps));
}

export const salePageTemplate: PageTemplate = {
    id: "sale_page",
    name_i18n: { en: "Sale page", ar: "صفحة تخفيضات" },
    description_i18n: {
        en: "Promo banner, hero, sale product grid, and trust strip.",
        ar: "لافتة عرض، غلاف، شبكة منتجات، وشريط الثقة.",
    },
    page_id: "home",
    sections: [
        {
            id: tplId(1),
            type: "promo_banner",
            enabled: true,
            base: defaults("promo_banner"),
        },
        {
            id: tplId(2),
            type: "hero_image",
            enabled: true,
            base: defaults("hero_image"),
        },
        {
            id: tplId(3),
            type: "product_grid",
            enabled: true,
            base: {
                ...defaults("product_grid"),
                mode: "auto",
                query: { sort: "sale", limit: 12 },
                heading_i18n: { en: "On sale now", ar: "تخفيضات الآن" },
            },
        },
        {
            id: tplId(4),
            type: "trust_strip",
            enabled: true,
            base: defaults("trust_strip"),
        },
    ],
};
