// =====================================================================
// Store template — Kinetic Ink
// =====================================================================
// Deep indigo-black ground, one signal-orange accent, oversized Arabic
// display type. A lit gradient hero, a running trust marquee, dense dark
// product tiles. Confident and current without the neon-on-black cliché.
// =====================================================================

import type { StoreTemplate } from "./types";
import { commercePages, makeSectionFactory, TRUST_MESSAGES, WHATSAPP_CTA } from "./common";

const s = makeSectionFactory("kinetic_ink");

export const kineticInkTemplate: StoreTemplate = {
    id: "kinetic_ink",
    version: 1,
    name_i18n: { en: "Kinetic Ink", ar: "حبر متحرك" },
    description_i18n: {
        en: "Dark indigo ground, one orange accent, oversized headlines and a running trust marquee.",
        ar: "خلفية داكنة، لون برتقالي واحد، عناوين كبيرة وشريط ثقة متحرك.",
    },
    brand_kit: {
        colors: {
            primary: "#ff6a2b",
            secondary: "#405cff",
            accent: "#ff9f1c",
            surface: "#0a0c12",
            surface_alt: "#151925",
            ink: "#f3f4f8",
            success: "#3ecf8e",
            danger: "#ff5a5a",
        },
        typography: {
            display: "Space Grotesk",
            body: "Manrope",
            display_ar: "Alexandria",
            body_ar: "Cairo",
            scale: "comfortable",
        },
        shape: {
            radius: "pill",
            border_thickness: "none",
            shadow_style: "elevated",
            rotation_intensity: "none",
        },
        motion: { enabled: true, speed: "snappy" },
        voice: { formality: "casual" },
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
            s("product_grid"),
            s("delivery_promise"),
            s("testimonials_carousel"),
            s("newsletter_inline"),
        ],
        category: [s("promo_banner"), s("category_grid"), s("product_grid"), s("trust_strip")],
        product: [
            s("pdp_gallery"),
            s("pdp_variants"),
            s("pdp_buy_box"),
            s("trust_strip"),
            s("delivery_promise"),
            s("pdp_info_tabs"),
            s("product_reviews"),
            s("pdp_related_products"),
            s("sticky_cta_bar"),
        ],
        about: [s("brand_story"), s("numbers_stat_strip"), s("founder_note")],
        faq: [s("faq_accordion")],
        ...commercePages(s),
    },
};
