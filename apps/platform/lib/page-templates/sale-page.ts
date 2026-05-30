// =====================================================================
// Page template — Sale page
// =====================================================================
// Promo banner + hero + sale-tagged product grid + countdown + trust.
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
        en: "Promo banner, hero, sale product grid, countdown, and trust strip.",
        ar: "بانر، غلاف، منتجات بالتخفيض، عدّاد تنازلي، وشريط ثقة.",
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
            type: "countdown_card",
            enabled: true,
            base: defaults("countdown_card"),
        },
        {
            id: tplId(5),
            type: "trust_strip",
            enabled: true,
            base: defaults("trust_strip"),
        },
    ],
};
