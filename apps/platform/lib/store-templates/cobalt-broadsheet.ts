// =====================================================================
// Store template — Cobalt Broadsheet
// =====================================================================
// Bone paper, square corners, no shadows anywhere, serif display carrying
// the page, and one saturated cobalt used sparingly. Whitespace is the
// loudest element — which means this direction punishes weak photography.
// =====================================================================

import type { StoreTemplate } from "./types";
import { commercePages, makeSectionFactory, TRUST_MESSAGES, WHATSAPP_CTA } from "./common";

const s = makeSectionFactory("cobalt_broadsheet");

export const cobaltBroadsheetTemplate: StoreTemplate = {
    id: "cobalt_broadsheet",
    name_i18n: { en: "Cobalt Broadsheet", ar: "صحيفة كوبالت" },
    description_i18n: {
        en: "Editorial paper layout: serif headlines, hairline rules, no shadows, one cobalt accent.",
        ar: "تصميم تحريري: عناوين كلاسيكية، خطوط رفيعة، بلا ظلال، ولون كوبالت واحد.",
    },
    brand_kit: {
        colors: {
            primary: "#1e3ef0",
            secondary: "#131519",
            accent: "#1e3ef0",
            surface: "#f4f2ec",
            surface_alt: "#eae7de",
            ink: "#131519",
            success: "#2f6f4e",
            danger: "#a13030",
        },
        typography: {
            display: "Playfair Display",
            body: "Inter Tight",
            display_ar: "El Messiri",
            body_ar: "IBM Plex Sans Arabic",
            scale: "spacious",
        },
        shape: {
            radius: "none",
            border_thickness: "thin",
            shadow_style: "flat",
            rotation_intensity: "none",
        },
        motion: { enabled: true, speed: "slow" },
        voice: { formality: "formal" },
    },
    globals: {
        header: s("site_header"),
        footer: s("site_footer"),
    },
    pages: {
        home: [
            s("announcement_bar"),
            s("hero_image", WHATSAPP_CTA),
            s("marquee_strip", { messages_i18n: TRUST_MESSAGES }),
            s("category_grid"),
            s("brand_story"),
            s("product_grid"),
            s("press_quotes"),
            s("newsletter_inline"),
        ],
        category: [s("category_grid"), s("product_grid")],
        product: [
            s("pdp_gallery"),
            s("pdp_variants"),
            s("pdp_buy_box"),
            s("pdp_info_block"),
            s("delivery_promise"),
            s("product_reviews"),
            s("pdp_related_products"),
            s("sticky_cta_bar"),
        ],
        about: [s("brand_story"), s("founder_note"), s("press_quotes")],
        faq: [s("faq_accordion")],
        ...commercePages(s),
    },
};
