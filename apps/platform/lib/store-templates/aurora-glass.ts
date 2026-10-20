// =====================================================================
// Store template — Aurora Glass
// =====================================================================
// A light page where the background is the artwork: teal and coral
// gradient blooms with frosted panels floating on top. No hard borders.
// The founder note sits above the catalogue, so a store with zero reviews
// still has something to earn trust with.
// =====================================================================

import type { StoreTemplate } from "./types";
import { commercePages, makeSectionFactory, WHATSAPP_CTA } from "./common";

const s = makeSectionFactory("aurora_glass");

export const auroraGlassTemplate: StoreTemplate = {
    id: "aurora_glass",
    version: 1,
    name_i18n: { en: "Aurora Glass", ar: "زجاج الشفق" },
    description_i18n: {
        en: "Light gradient blooms behind frosted panels. Trust-first: the founder note comes before the catalogue.",
        ar: "تدرّجات فاتحة خلف بطاقات زجاجية. الثقة أولاً: كلمة المؤسِّس قبل المنتجات.",
    },
    brand_kit: {
        colors: {
            primary: "#0f141c",
            secondary: "#0e9e96",
            accent: "#ff7a66",
            surface: "#f2f4f8",
            surface_alt: "#ffffff",
            ink: "#0f141c",
            success: "#0e9e96",
            danger: "#e5484d",
        },
        typography: {
            display: "Outfit",
            body: "Manrope",
            display_ar: "Readex Pro",
            // Not Almarai: it ships only 400/700/800, so the 500 and 600 that
            // body copy and labels use would be synthesised, and faux-bold
            // Arabic looks broken. Noto Sans Arabic ships 400-900.
            body_ar: "Noto Sans Arabic",
            scale: "spacious",
        },
        shape: {
            radius: "round",
            border_thickness: "none",
            shadow_style: "soft",
            rotation_intensity: "subtle",
        },
        motion: { enabled: true, speed: "normal" },
        voice: { formality: "casual" },
    },
    globals: {
        header: s("site_header"),
        footer: s("site_footer"),
    },
    pages: {
        home: [
            s("announcement_bar"),
            s("hero_split", WHATSAPP_CTA),
            s("trust_strip"),
            s("founder_note"),
            s("category_grid"),
            s("product_grid"),
            s("feature_grid"),
            s("faq_accordion"),
            s("newsletter_inline"),
        ],
        category: [s("category_grid"), s("product_grid"), s("newsletter_inline")],
        product: [
            s("pdp_gallery"),
            s("pdp_variants"),
            s("pdp_buy_box"),
            s("delivery_promise"),
            s("pdp_info_block"),
            s("product_reviews"),
            s("faq_accordion"),
            s("pdp_related_products"),
            s("sticky_cta_bar"),
        ],
        about: [s("founder_note"), s("brand_story"), s("image_gallery")],
        faq: [s("faq_accordion")],
        ...commercePages(s),
    },
};
