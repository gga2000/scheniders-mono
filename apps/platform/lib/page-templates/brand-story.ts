// =====================================================================
// Page template — Brand story
// =====================================================================
// About block, founder note, image gallery, press quotes (as stats
// proof), testimonials.
// =====================================================================

import { getManifestEntry } from "@/lib/sections-manifest";
import { tplId, type PageTemplate } from "./types";

function defaults(type: string): Record<string, unknown> {
    const e = getManifestEntry(type);
    if (!e) throw new Error(`Missing manifest entry: ${type}`);
    return JSON.parse(JSON.stringify(e.defaultProps));
}

export const brandStoryTemplate: PageTemplate = {
    id: "brand_story",
    name_i18n: { en: "Brand story", ar: "قصة العلامة" },
    description_i18n: {
        en: "About block, founder note, gallery, stats, and customer testimonials.",
        ar: "بطاقة تعريف، كلمة المؤسس، ألبوم، أرقام، وآراء الزبائن.",
    },
    page_id: "home",
    sections: [
        {
            id: tplId(1),
            type: "about_block",
            enabled: true,
            base: defaults("about_block"),
        },
        {
            id: tplId(2),
            type: "founder_note",
            enabled: true,
            base: defaults("founder_note"),
        },
        {
            id: tplId(3),
            type: "image_gallery",
            enabled: true,
            base: defaults("image_gallery"),
        },
        {
            id: tplId(4),
            type: "press_quotes",
            enabled: true,
            base: defaults("press_quotes"),
        },
        {
            id: tplId(5),
            type: "testimonials_carousel",
            enabled: true,
            base: defaults("testimonials_carousel"),
        },
    ],
};
