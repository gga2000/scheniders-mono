// =====================================================================
// Page template — Iraqi-market landing
// =====================================================================
// Hero (WhatsApp CTA), trust strip, delivery promise, marquee with COD
// + WhatsApp callouts, product grid.
// =====================================================================

import { getManifestEntry } from "@/lib/sections-manifest";
import { tplId, type PageTemplate } from "./types";

function defaults(type: string): Record<string, unknown> {
    const e = getManifestEntry(type);
    if (!e) throw new Error(`Missing manifest entry: ${type}`);
    return JSON.parse(JSON.stringify(e.defaultProps));
}

export const iraqiMarketLandingTemplate: PageTemplate = {
    id: "iraqi_market_landing",
    name_i18n: { en: "Iraqi-market landing", ar: "صفحة السوق العراقي" },
    description_i18n: {
        en: "Hero with WhatsApp CTA, trust pills, delivery promise, COD callout, and product grid.",
        ar: "غلاف بزر واتساب، شارات ثقة، وعد التوصيل، الدفع عند الاستلام، وشبكة منتجات.",
    },
    page_id: "home",
    sections: [
        {
            id: tplId(1),
            type: "hero_image",
            enabled: true,
            base: {
                ...defaults("hero_image"),
                // Wire the secondary CTA to a WhatsApp link by default
                // so the merchant just edits the phone number.
                secondary_cta_kind: "whatsapp",
                secondary_cta_value: "",
                secondary_cta_label_i18n: {
                    en: "Chat on WhatsApp",
                    ar: "تواصل عبر واتساب",
                },
            },
        },
        {
            id: tplId(2),
            type: "trust_strip",
            enabled: true,
            base: defaults("trust_strip"),
        },
        {
            id: tplId(3),
            type: "delivery_promise",
            enabled: true,
            base: defaults("delivery_promise"),
        },
        {
            id: tplId(4),
            type: "marquee_strip",
            enabled: true,
            base: {
                ...defaults("marquee_strip"),
                messages_i18n: [
                    { en: "Cash on delivery", ar: "الدفع عند الاستلام" },
                    { en: "WhatsApp us anytime", ar: "تواصل معنا على واتساب" },
                    { en: "Free returns", ar: "إرجاع مجاني" },
                ],
            },
        },
        {
            id: tplId(5),
            type: "product_grid",
            enabled: true,
            base: defaults("product_grid"),
        },
    ],
};
