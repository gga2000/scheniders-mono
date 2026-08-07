// =====================================================================
// Store template — Sunbleach
// =====================================================================
// High chroma without the sticker-and-outline neobrutalism everyone
// ships: a tangerine-to-magenta hero, ink-black buttons, generous radii,
// and a hard-working offer block. Price and offer land in the first
// thumb-scroll, which is what high-volume COD sellers actually need.
//
// Guardrail: tangerine owns surfaces, magenta owns discounts, and at most
// two urgency devices (countdown, free gift, promo) are enabled at once.
// The cart is where the free-gift strip lives — it is not valid on home.
// =====================================================================

import type { StoreTemplate } from "./types";
import { commercePages, makeSectionFactory, TRUST_MESSAGES, WHATSAPP_CTA } from "./common";

const s = makeSectionFactory("sunbleach");

export const sunbleachTemplate: StoreTemplate = {
    id: "sunbleach",
    name_i18n: { en: "Sunbleach", ar: "شمس" },
    description_i18n: {
        en: "Bright, price-first and built to convert: bold hero, countdown, offers above the fold.",
        ar: "ألوان قوية والسعر أولاً: غلاف جريء، عدّاد تنازلي، وعروض بأول الصفحة.",
    },
    brand_kit: {
        colors: {
            primary: "#ff5a1f",
            secondary: "#e6007a",
            accent: "#ffd9a8",
            surface: "#fcfaf5",
            surface_alt: "#ffffff",
            ink: "#17141a",
            success: "#12874a",
            danger: "#e6007a",
        },
        typography: {
            display: "Bricolage Grotesque",
            body: "DM Sans",
            display_ar: "Baloo Bhaijaan 2",
            body_ar: "Cairo",
            scale: "comfortable",
        },
        shape: {
            radius: "pill",
            border_thickness: "thin",
            shadow_style: "flat",
            rotation_intensity: "subtle",
        },
        motion: { enabled: true, speed: "snappy" },
        voice: { formality: "playful" },
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
            s("countdown_card"),
            s("category_grid"),
            s("product_grid"),
            s("promo_banner"),
            s("trust_strip"),
            s("testimonials_carousel"),
        ],
        category: [s("promo_banner"), s("category_grid"), s("product_grid"), s("trust_strip")],
        product: [
            s("pdp_gallery"),
            s("pdp_variants"),
            s("pdp_add_to_cart"),
            s("trust_strip"),
            s("delivery_promise"),
            s("product_bundles"),
            s("product_reviews"),
            s("pdp_related_products"),
            s("sticky_cta_bar"),
        ],
        about: [s("about_block"), s("founder_note")],
        faq: [s("faq_accordion")],
        ...commercePages(s),
    },
};
