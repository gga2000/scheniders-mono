// =====================================================================
// Store template — Chrome Night
// =====================================================================
// Cold luxury instead of the usual black-and-gold: graphite ground,
// brushed-silver accent, thin hairlines, slow motion. Built for perfume,
// jewellery, watches and gifting without reading as costume heritage.
// =====================================================================

import type { StoreTemplate } from "./types";
import { commercePages, makeSectionFactory, WHATSAPP_CTA } from "./common";

const s = makeSectionFactory("chrome_night");

export const chromeNightTemplate: StoreTemplate = {
    id: "chrome_night",
    name_i18n: { en: "Chrome Night", ar: "ليل معدني" },
    description_i18n: {
        en: "Graphite and brushed silver. Quiet, slow and expensive-looking, for premium and gifting stores.",
        ar: "رمادي معدني وفضي. هادئ وفخم، مناسب للمتاجر الراقية والهدايا.",
    },
    brand_kit: {
        colors: {
            primary: "#d6dce4",
            secondary: "#878e98",
            accent: "#eceef1",
            surface: "#141619",
            surface_alt: "#1d2126",
            ink: "#eceef1",
            success: "#4fbf8b",
            danger: "#e5645d",
        },
        typography: {
            display: "Jost",
            body: "Manrope",
            display_ar: "Reem Kufi",
            body_ar: "Tajawal",
            scale: "comfortable",
        },
        shape: {
            radius: "soft",
            border_thickness: "thin",
            shadow_style: "elevated",
            rotation_intensity: "none",
        },
        motion: { enabled: true, speed: "slow" },
        voice: { formality: "luxe" },
    },
    globals: {
        header: s("site_header"),
        footer: s("site_footer"),
    },
    pages: {
        home: [
            s("announcement_bar"),
            s("hero_video", WHATSAPP_CTA),
            s("logo_strip"),
            s("category_grid"),
            s("product_grid"),
            s("numbers_stat_strip"),
            s("brand_story"),
            s("cta_banner"),
        ],
        category: [s("category_grid"), s("product_grid"), s("trust_strip")],
        product: [
            s("pdp_gallery"),
            s("pdp_variants"),
            s("pdp_buy_box"),
            s("pdp_info_tabs"),
            s("trust_strip"),
            s("delivery_promise"),
            s("product_reviews"),
            s("pdp_related_products"),
            s("sticky_cta_bar"),
        ],
        about: [s("brand_story"), s("numbers_stat_strip"), s("press_quotes")],
        faq: [s("faq_accordion")],
        ...commercePages(s),
    },
};
