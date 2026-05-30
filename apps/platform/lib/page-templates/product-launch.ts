// =====================================================================
// Page template — Product launch
// =====================================================================
// Hero, brand story, product grid, testimonials, newsletter.
// =====================================================================

import { getManifestEntry } from "@/lib/sections-manifest";
import { tplId, type PageTemplate } from "./types";

function defaults(type: string): Record<string, unknown> {
    const e = getManifestEntry(type);
    if (!e) throw new Error(`Missing manifest entry: ${type}`);
    return JSON.parse(JSON.stringify(e.defaultProps));
}

export const productLaunchTemplate: PageTemplate = {
    id: "product_launch",
    name_i18n: { en: "Product launch", ar: "إطلاق منتج" },
    description_i18n: {
        en: "Hero, brand story, fresh product grid, testimonials, and a newsletter signup.",
        ar: "غلاف، قصة العلامة، شبكة منتجات، آراء الزبائن، وتسجيل النشرة.",
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
            type: "brand_story",
            enabled: true,
            base: defaults("brand_story"),
        },
        {
            id: tplId(3),
            type: "product_grid",
            enabled: true,
            base: defaults("product_grid"),
        },
        {
            id: tplId(4),
            type: "testimonials_carousel",
            enabled: true,
            base: defaults("testimonials_carousel"),
        },
        {
            id: tplId(5),
            type: "newsletter_inline",
            enabled: true,
            base: defaults("newsletter_inline"),
        },
    ],
};
