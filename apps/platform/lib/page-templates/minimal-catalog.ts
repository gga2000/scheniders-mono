// =====================================================================
// Page template — Minimal catalog
// =====================================================================
// Hero, product grid, FAQ, newsletter.
// =====================================================================

import { getManifestEntry } from "@/lib/sections-manifest";
import { tplId, type PageTemplate } from "./types";

function defaults(type: string): Record<string, unknown> {
    const e = getManifestEntry(type);
    if (!e) throw new Error(`Missing manifest entry: ${type}`);
    return JSON.parse(JSON.stringify(e.defaultProps));
}

export const minimalCatalogTemplate: PageTemplate = {
    id: "minimal_catalog",
    name_i18n: { en: "Minimal catalog", ar: "كتالوج بسيط" },
    description_i18n: {
        en: "Just the essentials — hero, product grid, FAQ, and newsletter signup.",
        ar: "الأساسيات فقط — غلاف، شبكة منتجات، أسئلة شائعة، وتسجيل النشرة.",
    },
    page_id: "home",
    sections: [
        {
            id: tplId(1),
            type: "hero_image",
            enabled: true,
            base: defaults("hero_image"),
        },
        {
            id: tplId(2),
            type: "product_grid",
            enabled: true,
            base: defaults("product_grid"),
        },
        {
            id: tplId(3),
            type: "faq_accordion",
            enabled: true,
            base: defaults("faq_accordion"),
        },
        {
            id: tplId(4),
            type: "newsletter_inline",
            enabled: true,
            base: defaults("newsletter_inline"),
        },
    ],
};
