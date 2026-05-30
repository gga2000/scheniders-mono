#!/usr/bin/env tsx
// =====================================================================
// seed-scheniders-store — full StoreConfigV2 seed for the pilot tenant
// =====================================================================
// Writes a complete 16-page candy-bento storefront config for the
// tenant with slug = "scheniders-store". Mirrors the Stitch "candy
// bento playful pastels" design reference. Always idempotent: section
// ids are derived from a stable FNV-1a hash of `<page_id>:<slot>` so
// re-running the seed re-uses the same ids.
//
// Flags:
//   --apply        Actually write to Supabase. Without this flag the
//                  script prints the plan only (DRY RUN).
//   --dry-run      Default — no writes; print summary.
//
// Env: loads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
// apps/platform/.env.local using dotenv (same convention as
// scripts/migrate-store-config-v2 + scripts/cutover-store-config-v2).
//
// Writes:
//   - tenants.store_config_v2          (live config)
//   - tenants.store_config_v2_draft    (editor opens clean off this)
// Does NOT touch config_version (cutover script's job).
// =====================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";

import {
    emptyStoreConfigV2,
    type BrandKit,
    type GlobalSections,
    type I18nString,
    type PageConfig,
    type PageId,
    type SectionInstance,
    type StoreConfigV2,
} from "@scheniders/shared/types";

/* ─────────────────────────────────────────────────────────────────── */
/* Env loading                                                         */
/* ─────────────────────────────────────────────────────────────────── */

function loadEnv(): void {
    const candidates = [
        path.resolve(process.cwd(), "apps/platform/.env.local"),
        path.resolve(process.cwd(), ".env.local"),
        path.resolve(process.cwd(), ".env"),
        path.resolve(__dirname, "../apps/platform/.env.local"),
        path.resolve(__dirname, "../.env.local"),
        path.resolve(__dirname, "../.env"),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
    }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Stable id (FNV-1a 32-bit, hex) — idempotent per (page_id, slot)     */
/* ─────────────────────────────────────────────────────────────────── */

function fnv1a(input: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}

function sectionId(page: string, slot: string): string {
    return `sec_${fnv1a(`${page}:${slot}`)}`;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Section instance helper                                             */
/* ─────────────────────────────────────────────────────────────────── */

function s<T extends Record<string, unknown>>(
    page: string,
    slot: string,
    type: string,
    base: T,
    label?: string,
): SectionInstance {
    return {
        id: sectionId(page, slot),
        type,
        enabled: true,
        base,
        label,
    };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Brand kit                                                           */
/* ─────────────────────────────────────────────────────────────────── */

const brandKit: BrandKit = {
    identity: {
        name: "Schneiders",
        tagline: { en: "Shop with joy.", ar: "تسوّق بفرح." },
    },
    colors: {
        primary: "#ff5a8a",
        secondary: "#c5b6ff",
        accent: "#ffd84a",
        surface: "#fff7ed",
        surface_alt: "#ffffff",
        ink: "#1a1a1a",
        success: "#7cf0bd",
        danger: "#ff4d4d",
    },
    typography: {
        display: "Bricolage Grotesque",
        body: "DM Sans",
        scale: "comfortable",
    },
    shape: {
        radius: "round",
        border_thickness: "chunky",
        shadow_style: "hard-offset",
        rotation_intensity: "playful",
    },
    motion: { enabled: true, speed: "snappy" },
    voice: { formality: "playful" },
};

/* ─────────────────────────────────────────────────────────────────── */
/* Globals — promo bar + newsletter popup                              */
/* ─────────────────────────────────────────────────────────────────── */

const globalPromoBar: SectionInstance = s(
    "_global",
    "promo_bar",
    "marquee_strip",
    {
        messages_i18n: [
            { en: "✨ 24h delivery in Baghdad", ar: "✨ توصيل 24 ساعة في بغداد" },
            { en: "Cash on delivery — pay only after inspection", ar: "الدفع عند الاستلام — افحص قبل ما تدفع" },
            { en: "15% off your first order 🎉", ar: "خصم 15٪ على أول طلب 🎉" },
            { en: "Free shipping over 75,000 IQD", ar: "شحن مجاني للطلبات فوق 75,000 د.ع" },
        ],
        bg: "pink",
        speed: "normal",
    },
    "Promo bar",
);

// Analytics pixels — globals slot. v1 just hard-codes a TikTok pixel
// placeholder so the storefront actually emits the `<script>` tag and we
// can verify the wiring end-to-end. Production tenants will edit this
// inside Builder v2 like any other section.
const globalAnalyticsPixels: SectionInstance = s(
    "_global",
    "analytics_pixels",
    "analytics_pixels",
    {
        tiktok_pixel_id: "CABCDEF",
    },
    "Analytics pixels",
);

const globals: GlobalSections = {
    promo_bar: globalPromoBar,
    analytics_pixels: globalAnalyticsPixels,
};

/* ─────────────────────────────────────────────────────────────────── */
/* Page builders                                                        */
/* ─────────────────────────────────────────────────────────────────── */

const i18n = (en: string, ar: string): I18nString => ({ en, ar });

function buildHome(): PageConfig {
    const page: PageId = "home";
    return {
        page_id: page,
        meta: {
            title: i18n("Schneiders — Shop with joy", "شنايدرز — تسوّق بفرح"),
            description: i18n(
                "Big things, delivered fast. Cash on delivery across all 18 governorates of Iraq.",
                "أشياء كبيرة بتوصيل سريع. الدفع عند الاستلام لكل المحافظات العراقية الـ18.",
            ),
        },
        sections: [
            s(page, "hero", "hero_image", {
                title_i18n: i18n("SHOP WITH JOY", "تسوّق بفرح"),
                subtitle_i18n: i18n(
                    "Big things, delivered fast. Cash on delivery across Iraq — pay only when it's in your hands.",
                    "أشياء كبيرة بتوصيل سريع. الدفع عند الاستلام بكل العراق — ادفع لمّا توصلك القطعة.",
                ),
                cta_label_i18n: i18n("Shop the drop", "تسوّق الآن"),
                cta_href: "/products",
                eyebrow_i18n: i18n("✨ New season — 2026", "✨ موسم جديد — 2026"),
                image_url: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1600&q=80",
                secondary_cta_kind: "whatsapp",
                secondary_cta_value: "9647700000000",
                secondary_cta_label_i18n: i18n("WhatsApp us", "تواصل واتساب"),
            }),
            s(page, "trust", "trust_strip", {
                pills: [
                    {
                        label_i18n: i18n("Cash on delivery", "الدفع عند الاستلام"),
                        icon: "payments",
                        bg: "mint",
                    },
                    {
                        label_i18n: i18n("24h Baghdad delivery", "توصيل بغداد 24 ساعة"),
                        icon: "local_shipping",
                        bg: "butter",
                    },
                    {
                        label_i18n: i18n("Free shipping > 75K IQD", "شحن مجاني فوق 75 ألف"),
                        icon: "redeem",
                        bg: "sky",
                    },
                    {
                        label_i18n: i18n("Easy 7-day returns", "إرجاع سهل خلال 7 أيام"),
                        icon: "undo",
                        bg: "lilac",
                    },
                ],
            }),
            s(page, "categories", "category_grid", {
                heading_i18n: i18n("Shop by category", "تسوّق حسب الفئة"),
                mode: "auto",
                manual_category_ids: [],
                columns: 3,
                limit: 9,
            }),
            s(page, "products", "product_grid", {
                heading_i18n: i18n("Just dropped 🎉", "وصل حديثاً 🎉"),
                mode: "auto",
                query: { sort: "newest", limit: 8 },
                manual_product_ids: [],
                pinned_product_ids: [],
                scribble_color: "butter",
            }),
            {
                ...s(page, "delivery_promise", "delivery_promise", {
                    heading_i18n: i18n("Delivery promise", "وعد التوصيل"),
                    baghdad_hours: 24,
                    provinces_hours: 72,
                    governorates_covered: [
                        "Baghdad",
                        "Basra",
                        "Erbil",
                        "Sulaymaniyah",
                        "Duhok",
                        "Najaf",
                        "Karbala",
                        "Babil",
                        "Anbar",
                        "Ninawa",
                        "Kirkuk",
                        "Diwaniyah",
                        "Wasit",
                        "Maysan",
                        "Dhi Qar",
                        "Muthanna",
                        "Saladin",
                        "Diyala",
                    ],
                    inspection_text_i18n: i18n(
                        "Free inspection on delivery — pay only if you're happy.",
                        "افحص قبل ما تدفع — ما تعجبك، ما تأخذها.",
                    ),
                }),
                // Base copy is "24h Baghdad, 2-3d nationwide" via
                // heading_i18n; governorate variants below swap the
                // heading per-visitor when their geo-IP / cart address
                // matches a covered governorate.
                // Governorate-aware delivery copy — proves the variant
                // engine can swap a single section's headline based on
                // the visitor's governorate. The existing variant editor
                // already supports the `governorate` condition; the seed
                // here is the working reference.
                variants: [
                    {
                        id: "delivery_bg",
                        label: "Baghdad",
                        priority: 30,
                        conditions: [{ kind: "governorate", values: ["BG"] }],
                        override: {
                            heading_i18n: i18n(
                                "Deliver today, in 2h!",
                                "تسليم اليوم بعد ساعتين فقط!",
                            ),
                        },
                    },
                    {
                        id: "delivery_ba",
                        label: "Basra",
                        priority: 20,
                        conditions: [{ kind: "governorate", values: ["BA"] }],
                        override: {
                            heading_i18n: i18n(
                                "1-2 days to Basra",
                                "1-2 يوم للبصرة",
                            ),
                        },
                    },
                    {
                        id: "delivery_other",
                        label: "Other governorates",
                        priority: 10,
                        conditions: [
                            {
                                kind: "governorate",
                                values: ["KE", "NA", "ER", "SU"],
                            },
                        ],
                        override: {
                            heading_i18n: i18n(
                                "2-3 days to your governorate",
                                "2-3 أيام لمحافظتك",
                            ),
                        },
                    },
                ],
            },
            s(page, "testimonials", "testimonials_carousel", {
                heading_i18n: i18n("Real Iraqis. Real reviews.", "آراء عراقية حقيقية."),
                items: [
                    {
                        author_name: "Mariam H.",
                        author_city: "Baghdad",
                        rating: 5,
                        verified: true,
                        quote_i18n: i18n(
                            "Same-day in Baghdad like they promised. The packaging is so cute I almost can't open it.",
                            "وصلني بنفس اليوم في بغداد. التغليف حلو لدرجة ما أردت أفتحه!",
                        ),
                    },
                    {
                        author_name: "Hussein A.",
                        author_city: "Basra",
                        rating: 5,
                        verified: true,
                        quote_i18n: i18n(
                            "Delivery was super fast — and the cash on delivery option made my mom comfortable.",
                            "التوصيل كان سريع جداً، والدفع عند الاستلام راحة كاملة.",
                        ),
                    },
                    {
                        author_name: "Lara K.",
                        author_city: "Erbil",
                        rating: 5,
                        verified: true,
                        quote_i18n: i18n(
                            "Quality is way beyond the price. I'm ordering again this week.",
                            "الجودة أكبر بكثير من السعر. راح أطلب مرة ثانية هذا الأسبوع.",
                        ),
                    },
                ],
            }),
            s(page, "story", "brand_story", {
                eyebrow_i18n: i18n("Since 2024", "منذ 2024"),
                title_i18n: i18n(
                    "A studio in Karrada with big ideas.",
                    "ستوديو في الكرّادة بأفكار كبيرة.",
                ),
                paragraphs_i18n: i18n(
                    "Schneiders started in a one-room studio in Baghdad with one rule: ship only what we'd happily wear ourselves.\n\nToday we deliver to all 18 governorates — 24h in Baghdad, 1–3 days everywhere else. Cash on delivery, always.",
                    "بدأت شنايدرز من غرفة صغيرة في بغداد بقاعدة واحدة: ما نشحن إلا الشي اللي نلبسه نحن.\n\nاليوم نوصل لكل المحافظات الـ18 — 24 ساعة في بغداد و1-3 أيام في باقي المدن. الدفع عند الاستلام، دائماً.",
                ),
                link_label_i18n: i18n("Read our story", "اقرأ قصّتنا"),
                link_href: "/about",
            }),
            s(page, "newsletter", "newsletter_inline", {
                heading_i18n: i18n("Get the drops first", "كن أول من يعرف"),
                body_i18n: i18n(
                    "Subscribe and we'll send you 15% off your first order.",
                    "اشترك واحصل على خصم 15٪ على أول طلب.",
                ),
                placeholder_i18n: i18n("you@email.com", "your@email.com"),
                cta_label_i18n: i18n("Sign me up", "اشترك"),
                bg: "butter",
            }),
        ],
    };
}

function buildCategory(): PageConfig {
    const page: PageId = "category";
    return {
        page_id: page,
        meta: {
            title: i18n("Shop the category", "تسوّق الفئة"),
        },
        sections: [
            s(page, "products", "product_grid", {
                heading_i18n: i18n("In this category", "في هذه الفئة"),
                mode: "auto",
                query: { sort: "newest", limit: 24 },
                manual_product_ids: [],
                pinned_product_ids: [],
                scribble_color: "mint",
            }),
            s(page, "perks", "feature_grid", {
                heading_i18n: i18n("Why shop with us", "ليش تتسوّق معنا"),
                columns: 3,
                items: [
                    {
                        icon: "local_shipping",
                        title_i18n: i18n("24h Baghdad", "بغداد 24 ساعة"),
                        body_i18n: i18n(
                            "Order today, get it tomorrow inside Baghdad.",
                            "اطلب اليوم واستلم باجر داخل بغداد.",
                        ),
                    },
                    {
                        icon: "payments",
                        title_i18n: i18n("Cash on delivery", "الدفع عند الاستلام"),
                        body_i18n: i18n(
                            "Inspect first, pay later. That's it.",
                            "افحص أولاً، ادفع بعدها. هيج.",
                        ),
                    },
                    {
                        icon: "undo",
                        title_i18n: i18n("7-day returns", "إرجاع 7 أيام"),
                        body_i18n: i18n(
                            "Not your vibe? Return it within a week.",
                            "ما عجبتك؟ رجّعها خلال أسبوع.",
                        ),
                    },
                ],
            }),
        ],
    };
}

function buildProduct(): PageConfig {
    const page: PageId = "product";
    return {
        page_id: page,
        sections: [
            s(page, "gallery", "pdp_gallery", {
                layout: "stacked",
                show_zoom: true,
                show_thumbnails: true,
            }),
            s(page, "buy_box", "pdp_buy_box", {
                add_to_cart_label_i18n: i18n("Add to bag", "أضف للسلة"),
                cod_badge_label_i18n: i18n("Cash on delivery", "الدفع عند الاستلام"),
                show_compare_price: true,
                show_variant_picker: true,
                show_qty_stepper: true,
            }),
            s(page, "trust", "trust_strip", {
                pills: [
                    {
                        label_i18n: i18n("COD across Iraq", "الدفع عند الاستلام بكل العراق"),
                        icon: "payments",
                        bg: "mint",
                    },
                    {
                        label_i18n: i18n("24h Baghdad", "بغداد 24 ساعة"),
                        icon: "local_shipping",
                        bg: "butter",
                    },
                    {
                        label_i18n: i18n("Easy returns", "إرجاع سهل"),
                        icon: "undo",
                        bg: "lilac",
                    },
                ],
            }),
            s(page, "info_tabs", "pdp_info_tabs", {
                tabs: [
                    {
                        key: "description",
                        label_i18n: i18n("Description", "الوصف"),
                        body_i18n: undefined,
                    },
                    {
                        key: "specs",
                        label_i18n: i18n("Specs", "المواصفات"),
                        body_i18n: i18n(
                            "Material, fit, dimensions, and care info — check the product details above.",
                            "المواد، القياس، الأبعاد، والعناية — تحقّق من تفاصيل المنتج أعلاه.",
                        ),
                    },
                    {
                        key: "shipping",
                        label_i18n: i18n("Shipping", "الشحن"),
                        body_i18n: i18n(
                            "24h delivery inside Baghdad on orders placed before 4pm.\n\nOther governorates: 1–3 working days.\n\nFree shipping on orders over 75,000 IQD.",
                            "توصيل 24 ساعة داخل بغداد للطلبات قبل الرابعة عصراً.\n\nبقية المحافظات: 1-3 أيام عمل.\n\nشحن مجاني للطلبات فوق 75,000 د.ع.",
                        ),
                    },
                    {
                        key: "returns",
                        label_i18n: i18n("Returns", "الإرجاع"),
                        body_i18n: i18n(
                            "7-day returns on unworn items in original packaging. Contact us on WhatsApp to start a return.",
                            "إرجاع خلال 7 أيام للقطع غير المستعملة بتغليفها الأصلي. تواصل معنا عبر واتساب لبدء الإرجاع.",
                        ),
                    },
                ],
            }),
            s(page, "delivery_promise", "delivery_promise", {
                heading_i18n: i18n("When will I get it?", "متى راح يوصلني؟"),
                baghdad_hours: 24,
                provinces_hours: 72,
                governorates_covered: [
                    "Baghdad",
                    "Basra",
                    "Erbil",
                    "Sulaymaniyah",
                    "Duhok",
                    "Najaf",
                    "Karbala",
                    "Babil",
                    "Anbar",
                    "Ninawa",
                    "Kirkuk",
                    "Diwaniyah",
                    "Wasit",
                    "Maysan",
                    "Dhi Qar",
                    "Muthanna",
                    "Saladin",
                    "Diyala",
                ],
                inspection_text_i18n: i18n(
                    "Free inspection on delivery — pay only if you're happy.",
                    "افحص قبل ما تدفع — ما تعجبك، ما تأخذها.",
                ),
            }),
            s(page, "related", "pdp_related_products", {
                heading_i18n: i18n("You might also like", "قد يعجبك أيضاً"),
                layout: "carousel",
                limit: 8,
            }),
        ],
    };
}

function buildSearch(): PageConfig {
    const page: PageId = "search";
    return {
        page_id: page,
        sections: [
            s(page, "results", "search_results_grid", {
                empty_state_message_i18n: i18n(
                    "Nothing matched — try a different word.",
                    "ما وجدنا نتائج — جرّب كلمة ثانية.",
                ),
                cols_mobile: 2,
                cols_desktop: 4,
            }),
        ],
    };
}

function buildCart(): PageConfig {
    const page: PageId = "cart";
    return {
        page_id: page,
        sections: [
            s(page, "lines", "cart_line_items", {
                show_thumbnails: true,
                empty_state_message_i18n: i18n(
                    "Your bag is empty — let's fix that.",
                    "سلتك فارغة — خلّينا نملاها.",
                ),
            }),
            s(page, "summary", "cart_summary", {
                heading_i18n: i18n("Order summary", "ملخّص الطلب"),
                checkout_label_i18n: i18n("Continue to checkout", "متابعة الدفع"),
                show_promo_input: true,
            }),
            s(page, "delivery_promise", "delivery_promise", {
                heading_i18n: i18n("Delivery promise", "وعد التوصيل"),
                baghdad_hours: 24,
                provinces_hours: 72,
                governorates_covered: ["Baghdad", "Basra", "Erbil", "Sulaymaniyah", "Najaf", "Karbala"],
                inspection_text_i18n: i18n(
                    "Inspect before you pay — that's our promise.",
                    "افحص قبل ما تدفع — هذا وعدنا.",
                ),
            }),
            s(page, "trust", "trust_strip", {
                pills: [
                    {
                        label_i18n: i18n("Cash on delivery", "الدفع عند الاستلام"),
                        icon: "payments",
                        bg: "mint",
                    },
                    {
                        label_i18n: i18n("Easy 7-day returns", "إرجاع سهل خلال 7 أيام"),
                        icon: "undo",
                        bg: "lilac",
                    },
                ],
            }),
        ],
    };
}

function buildCheckout(): PageConfig {
    const page: PageId = "checkout";
    return {
        page_id: page,
        sections: [
            s(page, "form", "checkout_form", {
                require_email: false,
                require_notes: false,
                payment_methods: ["cod"],
                reassurance_text_i18n: i18n(
                    "Pay cash on delivery — inspect first, then decide.",
                    "ادفع نقداً عند الاستلام — افحص أولاً ثم قرّر.",
                ),
            }),
            s(page, "summary", "checkout_order_summary", {
                heading_i18n: i18n("Your order", "طلبك"),
                cod_note_i18n: i18n(
                    "Cash on delivery — pay only after inspection.",
                    "الدفع عند الاستلام — افحص قبل ما تدفع.",
                ),
                sticky: true,
                show_thumbnails: true,
            }),
            s(page, "trust", "trust_strip", {
                pills: [
                    {
                        label_i18n: i18n("Cash on delivery", "الدفع عند الاستلام"),
                        icon: "payments",
                        bg: "mint",
                    },
                    {
                        label_i18n: i18n("Secure checkout", "دفع آمن"),
                        icon: "lock",
                        bg: "sky",
                    },
                    {
                        label_i18n: i18n("WhatsApp support", "دعم واتساب"),
                        icon: "support_agent",
                        bg: "butter",
                    },
                ],
            }),
        ],
    };
}

function buildCheckoutSuccess(): PageConfig {
    const page: PageId = "checkout_success";
    return {
        page_id: page,
        meta: {
            title: i18n("Order received 🎉", "تم استلام الطلب 🎉"),
        },
        sections: [
            s(page, "hero_cta", "cta_banner", {
                heading_i18n: i18n("Order received 🎉", "تم استلام طلبك 🎉"),
                sub_i18n: i18n(
                    "We're packing it now. You'll get a WhatsApp confirmation in minutes.",
                    "نحضّر طلبك الآن. راح يوصلك تأكيد واتساب خلال دقائق.",
                ),
                eyebrow_i18n: i18n("Confirmed", "مؤكّد"),
                cta_label_i18n: i18n("Keep shopping", "تابع التسوّق"),
                cta_href: "/products",
                bg_tint: "mint",
                align: "center",
            }),
            s(page, "next_steps", "feature_grid", {
                heading_i18n: i18n("What happens next", "الخطوات القادمة"),
                columns: 3,
                items: [
                    {
                        icon: "inventory_2",
                        title_i18n: i18n("We pack it", "نحضّر الطلب"),
                        body_i18n: i18n(
                            "Within 1 hour — you'll get a WhatsApp confirmation.",
                            "خلال ساعة — راح يوصلك تأكيد واتساب.",
                        ),
                    },
                    {
                        icon: "local_shipping",
                        title_i18n: i18n("We deliver", "نوصّل لك"),
                        body_i18n: i18n(
                            "24h in Baghdad, 1–3 days elsewhere.",
                            "24 ساعة في بغداد، 1-3 أيام في باقي المحافظات.",
                        ),
                    },
                    {
                        icon: "payments",
                        title_i18n: i18n("You pay cash", "ادفع نقداً"),
                        body_i18n: i18n(
                            "Inspect, then pay the driver. Easy.",
                            "افحص، وادفع للسائق. سهلة.",
                        ),
                    },
                ],
            }),
            s(page, "delivery_promise", "delivery_promise", {
                heading_i18n: i18n("Tracking your order", "تتبّع طلبك"),
                baghdad_hours: 24,
                provinces_hours: 72,
                governorates_covered: ["Baghdad", "Basra", "Erbil", "Sulaymaniyah"],
                inspection_text_i18n: i18n(
                    "You can also track via WhatsApp at any time.",
                    "تقدر تتبع الطلب عبر واتساب بأي وقت.",
                ),
            }),
            s(page, "related", "product_grid", {
                heading_i18n: i18n("Add to your next order", "أضف لطلبك القادم"),
                mode: "auto",
                query: { sort: "bestsellers", limit: 4 },
                manual_product_ids: [],
                pinned_product_ids: [],
                scribble_color: "lilac",
            }),
        ],
    };
}

function buildTrack(): PageConfig {
    const page: PageId = "track";
    return {
        page_id: page,
        meta: { title: i18n("Track your order", "تتبّع طلبك") },
        sections: [
            s(page, "lookup", "track_order_lookup", {
                heading_i18n: i18n("Where's my order?", "وين طلبي؟"),
                subheading_i18n: i18n(
                    "Enter your phone and order number — we'll show you the latest.",
                    "أدخل رقم هاتفك ورقم الطلب — وراح نعرض لك الحالة.",
                ),
                submit_label_i18n: i18n("Track it", "تتبّع"),
                redirect_path: "/track",
            }),
            s(page, "expect", "feature_grid", {
                heading_i18n: i18n("What to expect", "ماذا تتوقع"),
                columns: 3,
                items: [
                    {
                        icon: "schedule",
                        title_i18n: i18n("Baghdad: 24h", "بغداد: 24 ساعة"),
                        body_i18n: i18n(
                            "Order before 4pm and we ship the same day.",
                            "اطلب قبل الرابعة وراح نشحن نفس اليوم.",
                        ),
                    },
                    {
                        icon: "map",
                        title_i18n: i18n("Provinces: 1–3 days", "المحافظات: 1-3 أيام"),
                        body_i18n: i18n(
                            "We cover every governorate in Iraq.",
                            "نوصل لكل محافظة في العراق.",
                        ),
                    },
                    {
                        icon: "support_agent",
                        title_i18n: i18n("WhatsApp support", "دعم واتساب"),
                        body_i18n: i18n(
                            "Need help? Message us any time.",
                            "تحتاج مساعدة؟ راسلنا بأي وقت.",
                        ),
                    },
                ],
            }),
            s(page, "trust", "trust_strip", {
                pills: [
                    {
                        label_i18n: i18n("COD always", "الدفع عند الاستلام دائماً"),
                        icon: "payments",
                        bg: "mint",
                    },
                    {
                        label_i18n: i18n("WhatsApp 24/7", "واتساب 24/7"),
                        icon: "support_agent",
                        bg: "butter",
                    },
                ],
            }),
        ],
    };
}

function buildAbout(): PageConfig {
    const page: PageId = "about";
    return {
        page_id: page,
        meta: {
            title: i18n("About Schneiders", "عن شنايدرز"),
            description: i18n(
                "Made in Iraq, for Iraq. The story behind Schneiders.",
                "صُنع في العراق، من أجل العراق. قصة شنايدرز.",
            ),
        },
        sections: [
            s(page, "story", "brand_story", {
                eyebrow_i18n: i18n("Since 2024", "منذ 2024"),
                title_i18n: i18n(
                    "Made in Iraq, for Iraq.",
                    "صُنع في العراق، من أجل العراق.",
                ),
                paragraphs_i18n: i18n(
                    "Schneiders began with a simple idea: Iraqi shoppers deserve products that feel made for them — fast delivery, cash on delivery, and a real human on WhatsApp when they need one.\n\nWe started in a one-room studio in Karrada, Baghdad, sketching ideas between cups of cardamom tea. Today we ship to every governorate — 24h in Baghdad, 1–3 days elsewhere.\n\nEvery piece passes one test: would we use it ourselves? If the answer's no, it doesn't ship.",
                    "بدأت شنايدرز من فكرة بسيطة: المتسوّق العراقي يستحق منتجات مصمّمة له — توصيل سريع، دفع عند الاستلام، وإنسان حقيقي على واتساب عند الحاجة.\n\nبدأنا من غرفة واحدة في الكرّادة ببغداد، نرسم أفكاراً بين أكواب الشاي بالهيل. اليوم نشحن لكل محافظة — 24 ساعة في بغداد و1-3 أيام في باقي المدن.\n\nكل قطعة تخضع لاختبار واحد: هل سنستخدمها نحن؟ إذا كان الجواب لا، فلا تُشحَن.",
                ),
                link_label_i18n: i18n("Shop the collection", "تسوّق المجموعة"),
                link_href: "/products",
            }),
            s(page, "founder", "founder_note", {
                quote_i18n: i18n(
                    "Every order is a small promise we make to a stranger. We don't break promises.",
                    "كل طلب هو وعد صغير لشخص لا نعرفه. ونحن لا نخلف الوعود.",
                ),
                founder_name_i18n: i18n("Yara Al-Shammari", "يارا الشمري"),
                founder_role_i18n: i18n(
                    "Founder & Creative Director",
                    "المؤسِّسة والمديرة الإبداعية",
                ),
            }),
            s(page, "numbers", "numbers_stat_strip", {
                heading_i18n: i18n("By the numbers", "بالأرقام"),
                bg: "butter",
                items: [
                    { value: "12K+", label_i18n: i18n("Orders shipped", "طلب تم شحنه") },
                    { value: "18", label_i18n: i18n("Governorates served", "محافظة نخدمها") },
                    { value: "4.9★", label_i18n: i18n("Average rating", "متوسط التقييم") },
                    { value: "24h", label_i18n: i18n("Baghdad delivery", "توصيل بغداد") },
                ],
            }),
            s(page, "testimonials", "testimonials_carousel", {
                heading_i18n: i18n("Loved by Iraqis", "محبوبة من العراقيين"),
                items: [
                    {
                        author_name: "Mariam H.",
                        author_city: "Baghdad",
                        rating: 5,
                        verified: true,
                        quote_i18n: i18n(
                            "It's the first store I trust completely. They actually show up when they say they will.",
                            "أول متجر أثق به كلياً. يلتزمون بكل وعودهم بالتوصيل.",
                        ),
                    },
                    {
                        author_name: "Hussein A.",
                        author_city: "Basra",
                        rating: 5,
                        verified: true,
                        quote_i18n: i18n(
                            "I love that I can inspect before I pay. That's how it should be.",
                            "أحب إني أقدر أفحص قبل ما أدفع. هكذا المفروض يكون.",
                        ),
                    },
                    {
                        author_name: "Lara K.",
                        author_city: "Erbil",
                        rating: 5,
                        verified: true,
                        quote_i18n: i18n(
                            "From order to door in 2 days. Beautifully packaged.",
                            "من الطلب للباب خلال يومين. تغليف جميل جداً.",
                        ),
                    },
                ],
            }),
        ],
    };
}

function buildFaq(): PageConfig {
    const page: PageId = "faq";
    return {
        page_id: page,
        meta: { title: i18n("Quick answers — FAQ", "أسئلة شائعة") },
        sections: [
            s(page, "faqs", "faq_accordion", {
                heading_i18n: i18n("Quick answers", "أسئلة شائعة"),
                items: [
                    {
                        q_i18n: i18n(
                            "How does Cash on Delivery work?",
                            "كيف يعمل الدفع عند الاستلام؟",
                        ),
                        a_i18n: i18n(
                            "Place your order, we deliver, you inspect the package, then you pay the driver in cash. No deposit, no upfront payment.",
                            "أطلب، نوصل لك، تفحص الطلب، وتدفع للسائق نقداً. بدون عربون أو دفع مسبق.",
                        ),
                    },
                    {
                        q_i18n: i18n(
                            "How fast is delivery?",
                            "كم تستغرق مدة التوصيل؟",
                        ),
                        a_i18n: i18n(
                            "24 hours inside Baghdad if you order before 4pm. 1–3 working days for all other governorates.",
                            "24 ساعة داخل بغداد للطلبات قبل الرابعة. 1-3 أيام عمل لباقي المحافظات.",
                        ),
                    },
                    {
                        q_i18n: i18n(
                            "Do you ship to all 18 governorates?",
                            "هل توصلون لكل المحافظات الـ18؟",
                        ),
                        a_i18n: i18n(
                            "Yes — every governorate in Iraq, from Duhok to Basra.",
                            "نعم — كل المحافظات العراقية، من دهوك إلى البصرة.",
                        ),
                    },
                    {
                        q_i18n: i18n(
                            "What's the return policy?",
                            "ما هي سياسة الإرجاع؟",
                        ),
                        a_i18n: i18n(
                            "7-day returns on unworn items in original packaging. Message us on WhatsApp and we'll arrange pickup.",
                            "إرجاع خلال 7 أيام للقطع غير المستعملة بتغليفها الأصلي. راسلنا واتساب ونرتّب الاستلام.",
                        ),
                    },
                    {
                        q_i18n: i18n(
                            "Can I exchange a size?",
                            "هل يمكن تبديل المقاس؟",
                        ),
                        a_i18n: i18n(
                            "Yes — exchanges are free within 7 days as long as the item is unworn and tags are attached.",
                            "نعم — التبديل مجاني خلال 7 أيام بشرط أن تكون القطعة غير مستعملة والتاغ موجود.",
                        ),
                    },
                    {
                        q_i18n: i18n(
                            "Is there a free shipping minimum?",
                            "هل يوجد حد أدنى للشحن المجاني؟",
                        ),
                        a_i18n: i18n(
                            "Free shipping on orders over 75,000 IQD. Below that, delivery is a flat 5,000 IQD in Baghdad.",
                            "شحن مجاني للطلبات فوق 75,000 د.ع. أقل من ذلك، التوصيل 5,000 د.ع داخل بغداد.",
                        ),
                    },
                    {
                        q_i18n: i18n(
                            "How do I know my size?",
                            "كيف أعرف مقاسي؟",
                        ),
                        a_i18n: i18n(
                            "Each product page has a size chart. If you're stuck, message us on WhatsApp and we'll help in seconds.",
                            "كل صفحة منتج فيها جدول مقاسات. إذا محتار، راسلنا واتساب ونساعدك بثوان.",
                        ),
                    },
                    {
                        q_i18n: i18n(
                            "How do I contact support?",
                            "كيف أتواصل مع الدعم؟",
                        ),
                        a_i18n: i18n(
                            "WhatsApp is fastest — we usually reply in under 10 minutes. You can also email us.",
                            "واتساب هو الأسرع — عادةً نرد خلال أقل من 10 دقائق. تقدر تراسلنا إيميل أيضاً.",
                        ),
                    },
                    {
                        q_i18n: i18n(
                            "Do I need an account to order?",
                            "هل أحتاج حساب للطلب؟",
                        ),
                        a_i18n: i18n(
                            "Nope — just add to bag, give us your phone + address, and you're done.",
                            "لا — أضف للسلة، اعطنا رقمك والعنوان، وخلصت.",
                        ),
                    },
                    {
                        q_i18n: i18n(
                            "Is my information safe?",
                            "هل معلوماتي محفوظة؟",
                        ),
                        a_i18n: i18n(
                            "Yes. We only use your phone and address to deliver the order. We never share with anyone.",
                            "نعم. نستخدم رقمك وعنوانك فقط لتوصيل الطلب. لا نشاركها مع أحد أبداً.",
                        ),
                    },
                ],
            }),
        ],
    };
}

function buildContact(): PageConfig {
    const page: PageId = "contact";
    return {
        page_id: page,
        meta: { title: i18n("Talk to us", "تواصل معنا") },
        sections: [
            s(page, "cta", "cta_banner", {
                heading_i18n: i18n("Talk to us", "تواصل معنا"),
                sub_i18n: i18n(
                    "We're real humans on the other end. WhatsApp is fastest.",
                    "بشر حقيقيون على الطرف الثاني. واتساب هو الأسرع.",
                ),
                eyebrow_i18n: i18n("We reply fast", "نرد بسرعة"),
                cta_label_i18n: i18n("Open WhatsApp", "افتح واتساب"),
                cta_href: "https://wa.me/9647700000000",
                bg_tint: "mint",
                align: "center",
            }),
            s(page, "channels", "feature_grid", {
                heading_i18n: i18n("Ways to reach us", "طرق التواصل"),
                columns: 3,
                items: [
                    {
                        icon: "chat",
                        title_i18n: i18n("WhatsApp", "واتساب"),
                        body_i18n: i18n(
                            "+964 770 000 0000 — usually reply in under 10 minutes.",
                            "+964 770 000 0000 — نرد عادةً خلال 10 دقائق.",
                        ),
                    },
                    {
                        icon: "call",
                        title_i18n: i18n("Phone", "هاتف"),
                        body_i18n: i18n(
                            "+964 770 000 0000 — Sat–Thu, 9am to 8pm.",
                            "+964 770 000 0000 — السبت إلى الخميس، 9 ص إلى 8 م.",
                        ),
                    },
                    {
                        icon: "mail",
                        title_i18n: i18n("Email", "إيميل"),
                        body_i18n: i18n(
                            "hello@schneiders.iq — we reply within 24 hours.",
                            "hello@schneiders.iq — نرد خلال 24 ساعة.",
                        ),
                    },
                ],
            }),
            s(page, "details", "accordion_richtext", {
                heading_i18n: i18n("More info", "معلومات إضافية"),
                allow_multiple: false,
                items: [
                    {
                        title_i18n: i18n("Hours", "أوقات الدوام"),
                        body_i18n: i18n(
                            "Saturday to Thursday: 9am – 8pm.\nFriday: closed.",
                            "السبت إلى الخميس: 9 ص - 8 م.\nالجمعة: مغلق.",
                        ),
                    },
                    {
                        title_i18n: i18n("Location", "الموقع"),
                        body_i18n: i18n(
                            "Karrada, Baghdad, Iraq.\nVisits by appointment only — message us first.",
                            "الكرّادة، بغداد، العراق.\nالزيارة بموعد مسبق — راسلنا أولاً.",
                        ),
                    },
                    {
                        title_i18n: i18n("Business inquiries", "استفسارات الأعمال"),
                        body_i18n: i18n(
                            "Partnerships, wholesale, or press: email partners@schneiders.iq.",
                            "للشراكات والجملة والصحافة: partners@schneiders.iq.",
                        ),
                    },
                ],
            }),
        ],
    };
}

function buildPolicyShipping(): PageConfig {
    const page: PageId = "policy_shipping";
    return {
        page_id: page,
        meta: { title: i18n("Shipping & Delivery", "الشحن والتوصيل") },
        sections: [
            s(page, "content", "accordion_richtext", {
                heading_i18n: i18n("Shipping & Delivery", "الشحن والتوصيل"),
                allow_multiple: false,
                items: [
                    {
                        title_i18n: i18n("How fast we deliver", "كم وقت التوصيل"),
                        body_i18n: i18n(
                            "Baghdad: same-day or 24h on orders placed before 4pm.\n\nOther governorates: 1–3 working days.",
                            "بغداد: نفس اليوم أو خلال 24 ساعة للطلبات قبل الرابعة.\n\nباقي المحافظات: 1-3 أيام عمل.",
                        ),
                    },
                    {
                        title_i18n: i18n("Where we deliver", "إلى أين نوصل"),
                        body_i18n: i18n(
                            "All 18 Iraqi governorates. From Duhok to Basra and everywhere in between.",
                            "كل المحافظات الـ18 في العراق. من دهوك إلى البصرة وكل ما بينهم.",
                        ),
                    },
                    {
                        title_i18n: i18n("Shipping fees", "أجور الشحن"),
                        body_i18n: i18n(
                            "Baghdad: 5,000 IQD.\nOther governorates: 7,000 IQD.\n\nFree shipping on orders over 75,000 IQD anywhere in Iraq.",
                            "بغداد: 5,000 د.ع.\nباقي المحافظات: 7,000 د.ع.\n\nشحن مجاني للطلبات فوق 75,000 د.ع في أي مكان بالعراق.",
                        ),
                    },
                    {
                        title_i18n: i18n("Cash on delivery", "الدفع عند الاستلام"),
                        body_i18n: i18n(
                            "All orders ship Cash on Delivery. Inspect first, then pay the driver in cash. No card needed.",
                            "كل الطلبات بنظام الدفع عند الاستلام. افحص، وادفع للسائق نقداً. لا تحتاج بطاقة.",
                        ),
                    },
                    {
                        title_i18n: i18n("How we pack", "كيف نغلّف"),
                        body_i18n: i18n(
                            "Every order ships in branded packaging with care instructions inside. No plastic where we can avoid it.",
                            "كل طلب يُشحن بتغليف خاص بنا مع تعليمات العناية بالداخل. نتجنّب البلاستيك ما أمكن.",
                        ),
                    },
                ],
            }),
        ],
    };
}

function buildPolicyReturns(): PageConfig {
    const page: PageId = "policy_returns";
    return {
        page_id: page,
        meta: { title: i18n("Returns & Exchanges", "الإرجاع والتبديل") },
        sections: [
            s(page, "content", "accordion_richtext", {
                heading_i18n: i18n("Returns & Exchanges", "الإرجاع والتبديل"),
                allow_multiple: false,
                items: [
                    {
                        title_i18n: i18n("Return window", "مدة الإرجاع"),
                        body_i18n: i18n(
                            "You have 7 days from delivery to request a return.",
                            "لديك 7 أيام من تاريخ الاستلام لطلب الإرجاع.",
                        ),
                    },
                    {
                        title_i18n: i18n("What can be returned", "ما يمكن إرجاعه"),
                        body_i18n: i18n(
                            "Unworn items in their original packaging with all tags attached.\n\nFinal-sale items and intimates cannot be returned.",
                            "القطع غير المستعملة بتغليفها الأصلي وبجميع الباجات.\n\nالقطع المخفّضة بشكل نهائي والملابس الداخلية غير قابلة للإرجاع.",
                        ),
                    },
                    {
                        title_i18n: i18n("How to start a return", "كيف تبدأ الإرجاع"),
                        body_i18n: i18n(
                            "Message us on WhatsApp with your order number. We'll arrange a pickup within 24 hours.",
                            "راسلنا واتساب مع رقم طلبك. نرتّب لك الاستلام خلال 24 ساعة.",
                        ),
                    },
                    {
                        title_i18n: i18n("Refunds", "استرداد المبلغ"),
                        body_i18n: i18n(
                            "Cash refunds are handed back at pickup, after we confirm the item's condition.",
                            "يتم استرداد المبلغ نقداً عند الاستلام، بعد التأكد من حالة القطعة.",
                        ),
                    },
                    {
                        title_i18n: i18n("Exchanges", "التبديل"),
                        body_i18n: i18n(
                            "Need a different size or colour? Free exchanges within 7 days. Just message us.",
                            "تحتاج مقاس أو لون مختلف؟ التبديل مجاني خلال 7 أيام. راسلنا فقط.",
                        ),
                    },
                ],
            }),
        ],
    };
}

function buildPolicyPrivacy(): PageConfig {
    const page: PageId = "policy_privacy";
    return {
        page_id: page,
        meta: { title: i18n("Privacy", "الخصوصية") },
        sections: [
            s(page, "content", "accordion_richtext", {
                heading_i18n: i18n("Privacy Policy", "سياسة الخصوصية"),
                allow_multiple: false,
                items: [
                    {
                        title_i18n: i18n("What we collect", "ما نجمعه"),
                        body_i18n: i18n(
                            "Your name, phone number, delivery address, and order details. That's it.",
                            "اسمك، رقم هاتفك، عنوان التوصيل، وتفاصيل الطلب. هذا كل شيء.",
                        ),
                    },
                    {
                        title_i18n: i18n("How we use it", "كيف نستخدمها"),
                        body_i18n: i18n(
                            "Strictly to fulfil your order and send you delivery updates on WhatsApp or SMS.",
                            "فقط لتنفيذ طلبك وإرسال تحديثات التوصيل عبر واتساب أو الرسائل.",
                        ),
                    },
                    {
                        title_i18n: i18n("Who we share with", "مع من نشارك"),
                        body_i18n: i18n(
                            "Only the delivery partner who hands you the package. We never sell your data to anyone.",
                            "فقط مع شركة التوصيل التي تسلّمك الطلب. لا نبيع بياناتك لأي جهة.",
                        ),
                    },
                    {
                        title_i18n: i18n("Cookies", "ملفات الكوكيز"),
                        body_i18n: i18n(
                            "We use essential cookies to keep your cart between visits. No third-party advertising trackers.",
                            "نستخدم ملفات تعريف ارتباط أساسية لحفظ سلتك بين الزيارات. لا متتبّعات إعلانية خارجية.",
                        ),
                    },
                    {
                        title_i18n: i18n("Your rights", "حقوقك"),
                        body_i18n: i18n(
                            "Want us to delete your data? Message us on WhatsApp and we'll do it within 7 days.",
                            "تريد أن نحذف بياناتك؟ راسلنا واتساب وسنحذفها خلال 7 أيام.",
                        ),
                    },
                ],
            }),
        ],
    };
}

function buildPolicyTerms(): PageConfig {
    const page: PageId = "policy_terms";
    return {
        page_id: page,
        meta: { title: i18n("Terms of Service", "شروط الخدمة") },
        sections: [
            s(page, "content", "accordion_richtext", {
                heading_i18n: i18n("Terms of Service", "شروط الخدمة"),
                allow_multiple: false,
                items: [
                    {
                        title_i18n: i18n("Using our site", "استخدام موقعنا"),
                        body_i18n: i18n(
                            "By placing an order, you agree to these terms. They're short, we promise.",
                            "بإتمامك للطلب فإنك توافق على هذه الشروط. وهي مختصرة، نعدك.",
                        ),
                    },
                    {
                        title_i18n: i18n("Orders & payment", "الطلبات والدفع"),
                        body_i18n: i18n(
                            "All prices are in IQD. We accept Cash on Delivery only. Orders ship after we confirm by phone or WhatsApp.",
                            "كل الأسعار بالدينار العراقي. نقبل الدفع عند الاستلام فقط. الطلبات تُشحن بعد التأكيد عبر الهاتف أو واتساب.",
                        ),
                    },
                    {
                        title_i18n: i18n("Pricing & availability", "الأسعار والتوفّر"),
                        body_i18n: i18n(
                            "We do our best to keep prices and stock accurate. If something's out of stock after you order, we'll message you and refund instantly.",
                            "نبذل قصارى جهدنا لإبقاء الأسعار والمخزون دقيقة. إذا نفد منتج بعد طلبك، سنراسلك ونرتّب الاسترداد فوراً.",
                        ),
                    },
                    {
                        title_i18n: i18n("Intellectual property", "الملكية الفكرية"),
                        body_i18n: i18n(
                            "All photos, designs, and logos on this site belong to Schneiders. Please don't copy them — message us if you want to collaborate.",
                            "جميع الصور والتصاميم والشعارات في هذا الموقع ملك لشنايدرز. الرجاء عدم نسخها — راسلنا إذا كنت تريد التعاون.",
                        ),
                    },
                    {
                        title_i18n: i18n("Liability", "المسؤولية"),
                        body_i18n: i18n(
                            "We're responsible for the quality of what we ship. Beyond that, we're not liable for indirect or consequential damages.",
                            "نحن مسؤولون عن جودة ما نشحنه. وما عدا ذلك، لسنا مسؤولين عن أضرار غير مباشرة أو تبعية.",
                        ),
                    },
                    {
                        title_i18n: i18n("Governing law", "القانون المعمول به"),
                        body_i18n: i18n(
                            "These terms are governed by the laws of the Republic of Iraq.",
                            "تخضع هذه الشروط لقوانين جمهورية العراق.",
                        ),
                    },
                ],
            }),
        ],
    };
}

function buildNotFound(): PageConfig {
    const page: PageId = "not_found";
    return {
        page_id: page,
        meta: { title: i18n("Page not found", "الصفحة غير موجودة"), noindex: true },
        sections: [
            s(page, "cta", "cta_banner", {
                heading_i18n: i18n(
                    "Oops — this page wandered off.",
                    "أوبس — الصفحة ضاعت.",
                ),
                sub_i18n: i18n(
                    "But hey, you're here. Let's get you back to the good stuff.",
                    "بس وصلت لهون. خلّينا نرجّعك للأشياء الحلوة.",
                ),
                eyebrow_i18n: i18n("404", "404"),
                cta_label_i18n: i18n("Take me home", "ارجعني للرئيسية"),
                cta_href: "/",
                bg_tint: "lilac",
                align: "center",
            }),
        ],
    };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Assemble the config                                                 */
/* ─────────────────────────────────────────────────────────────────── */

function buildStoreConfig(): StoreConfigV2 {
    const cfg = emptyStoreConfigV2();
    cfg.brand_kit = brandKit;
    cfg.globals = globals;
    cfg.default_locale = "ar";
    cfg.enabled_locales = ["ar", "en"];

    const pageBuilders: Record<PageId, () => PageConfig> = {
        home: buildHome,
        category: buildCategory,
        product: buildProduct,
        search: buildSearch,
        cart: buildCart,
        checkout: buildCheckout,
        checkout_success: buildCheckoutSuccess,
        track: buildTrack,
        about: buildAbout,
        faq: buildFaq,
        contact: buildContact,
        policy_shipping: buildPolicyShipping,
        policy_returns: buildPolicyReturns,
        policy_privacy: buildPolicyPrivacy,
        policy_terms: buildPolicyTerms,
        not_found: buildNotFound,
    };

    // emptyStoreConfigV2 gives us all 16 page stubs in the right order;
    // we just swap in the populated versions.
    cfg.pages = cfg.pages.map((p) => pageBuilders[p.page_id]());
    return cfg;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Validation                                                          */
/* ─────────────────────────────────────────────────────────────────── */

const EXPECTED_PAGE_COUNT = 16;

function validate(cfg: StoreConfigV2): string[] {
    const issues: string[] = [];
    if (cfg.pages.length !== EXPECTED_PAGE_COUNT) {
        issues.push(`expected ${EXPECTED_PAGE_COUNT} pages, found ${cfg.pages.length}`);
    }
    if (!cfg.brand_kit?.colors?.primary) {
        issues.push("brand_kit.colors.primary missing");
    }
    const seen = new Set<string>();
    for (const page of cfg.pages) {
        for (const sec of page.sections) {
            if (seen.has(sec.id)) {
                issues.push(`duplicate section id ${sec.id} on ${page.page_id}`);
            }
            seen.add(sec.id);
            if (!sec.type) issues.push(`section without type on ${page.page_id}`);
        }
    }
    return issues;
}

/* ─────────────────────────────────────────────────────────────────── */
/* CLI / main                                                          */
/* ─────────────────────────────────────────────────────────────────── */

interface CliFlags {
    apply: boolean;
}

function parseFlags(argv: string[]): CliFlags {
    const flags: CliFlags = { apply: false };
    for (const arg of argv.slice(2)) {
        if (arg === "--apply") flags.apply = true;
        else if (arg === "--dry-run") {
            /* default — no-op */
        }
    }
    return flags;
}

function getSupabase(): SupabaseClient {
    const url =
        process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error(
            "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them in apps/platform/.env.local.",
        );
        process.exit(1);
    }
    return createClient(url, key, { auth: { persistSession: false } });
}

function printPlan(cfg: StoreConfigV2): void {
    console.log("\nPlan: candy-bento storefront config");
    console.log(`  brand_kit.primary   = ${cfg.brand_kit.colors.primary}`);
    console.log(`  brand_kit.secondary = ${cfg.brand_kit.colors.secondary}`);
    console.log(`  brand_kit.accent    = ${cfg.brand_kit.colors.accent}`);
    console.log(`  typography          = ${cfg.brand_kit.typography.display} / ${cfg.brand_kit.typography.body}`);
    console.log(`  shape               = radius:${cfg.brand_kit.shape.radius} border:${cfg.brand_kit.shape.border_thickness} shadow:${cfg.brand_kit.shape.shadow_style} rotation:${cfg.brand_kit.shape.rotation_intensity}`);
    console.log(`  default_locale      = ${cfg.default_locale}`);
    console.log(`  enabled_locales     = ${cfg.enabled_locales.join(", ")}`);

    const globalSlots = Object.keys(cfg.globals).filter(
        (k) => (cfg.globals as Record<string, unknown>)[k],
    );
    console.log(`  globals             = ${globalSlots.join(", ") || "(none)"}`);

    console.log(`\nPages (${cfg.pages.length}):`);
    for (const page of cfg.pages) {
        const types = page.sections.map((s) => s.type).join(" + ");
        console.log(`  ${page.page_id.padEnd(20)} → ${types || "(empty)"}`);
    }
}

async function main(): Promise<void> {
    loadEnv();
    const flags = parseFlags(process.argv);

    const cfg = buildStoreConfig();
    const issues = validate(cfg);

    if (issues.length > 0) {
        console.error("Config validation failed:");
        for (const i of issues) console.error(`  ! ${i}`);
        process.exit(1);
    }

    printPlan(cfg);

    const supabase = getSupabase();
    const { data: tenants, error: fetchErr } = await supabase
        .from("tenants")
        .select("id, slug, business_name, config_version")
        .eq("slug", "scheniders-store");

    if (fetchErr) {
        console.error(`\nFailed to fetch tenant: ${fetchErr.message}`);
        process.exit(1);
    }
    if (!tenants || tenants.length === 0) {
        console.error(`\nNo tenant found with slug "scheniders-store".`);
        process.exit(1);
    }
    const tenant = tenants[0]!;

    console.log("");
    console.log(`Tenant: ${tenant.business_name ?? "(no name)"} (${tenant.slug}) id=${tenant.id} config_version=${tenant.config_version}`);

    if (!flags.apply) {
        console.log("\nDRY RUN — no writes performed. Pass --apply to write to Supabase.");
        return;
    }

    console.log("\nApplying writes…");
    const { error: writeErr, count } = await supabase
        .from("tenants")
        .update({
            store_config_v2: cfg,
            store_config_v2_draft: cfg,
        })
        .eq("id", tenant.id)
        .select("id", { count: "exact", head: true });

    if (writeErr) {
        console.error(`x write failed: ${writeErr.message}`);
        process.exit(1);
    }

    console.log(`OK — updated ${count ?? "?"} row(s).`);
    console.log("  • tenants.store_config_v2        ← written");
    console.log("  • tenants.store_config_v2_draft  ← written");
    console.log("\nDone. config_version was not touched (cutover script's job).");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
