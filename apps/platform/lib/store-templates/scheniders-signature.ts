// =====================================================================
// Store template — Scheniders Signature
// =====================================================================
// 1:1 port of the merchant's original funnel storefront
// (www.scheniders.com, LightFunnels): warm cream ground, butter-yellow
// CTAs, Cairo everywhere, floating pill header, funnel-style PDP with an
// inline COD order form, and a countdown promo bar. Copy and imagery are
// the merchant's own, re-hosted in tenant-assets.
// =====================================================================

import type { StoreTemplate } from "./types";
import { commercePages, makeSectionFactory } from "./common";

const s = makeSectionFactory("scheniders_signature");

/** Re-hosted originals from the merchant's LightFunnels asset library. */
const A =
    "https://sduvpgqwhxragxtxztur.supabase.co/storage/v1/object/public/tenant-assets/store-templates/scheniders/";

const ASSETS = {
    logo: `${A}da0471e3-4980-4e4d-80ef-4ea9e75bf2da.png`,
    heroBg: `${A}cc0006f8-a7d5-4c0e-b10d-e5f73253ca22.webp`,
    aboutBg: `${A}b6f25c2e-03d2-4c7a-9c81-76ba1abd6bcd.jpg`,
    trustFast: `${A}1be3edb0-56f8-4c0a-b3c9-88637ee49cd3.svg`,
    trustQuality: `${A}a04ab73b-1d8b-41f4-83fb-5b249bd68616.svg`,
    trustIraq: `${A}cc287ee8-2cc5-46bf-9354-d0a55d33ba1a.svg`,
    trustCod: `${A}ac7e449d-f570-4cfb-9e8d-d407fe573a89.svg`,
    catPicked: `${A}eb55eb3a-1955-4f85-8720-1fca98b8a394.webp`,
    catTop: `${A}8647a500-6a35-4302-afcb-d1271904b1fb.jpg`,
    sideArtLeft: `${A}d8f80617-73ac-4b2f-bc58-014da751de42.svg`,
    sideArtRight: `${A}08f20a22-335e-450a-86dd-4ee24a86204e.svg`,
    trioWork: `${A}a92ea4e4-b91a-4228-91ac-b3c2f327a35d.webp`,
    trioOutings: `${A}5968b404-8796-4449-94a6-91f598130d84.webp`,
    trioOccasions: `${A}09c277cd-17e1-4d23-a95d-bf02c83fafc2.webp`,
    pillarQuality: `${A}1059c16f-4311-4ceb-9365-ed7d3563d8dd.svg`,
    pillarValue: `${A}0eed8928-51d1-422b-89d0-edf7cb5c56e5.svg`,
    pillarEndurance: `${A}a018156e-4fe5-4010-ba33-90322ea745e1.svg`,
    faqRow: `${A}73c12b05-fbb5-4cc7-9a75-f61094855221.svg`,
    mic: `${A}66a2314b-371e-4474-ad0d-53a4cad055f9.svg`,
};

/** Customer chat-screenshot carousel shown on the original PDP (site-wide). */
const REVIEW_SCREENSHOTS = [
    `${A}reviews/1ebf499e-fb7d-4325-a2fe-0b98e8530932.jpeg`,
    `${A}reviews/cba26e5e-7ad0-4213-b804-d535b7c0d7e6.jpeg`,
    `${A}reviews/8f742152-1b1a-4d65-a543-331196fc6830.jpeg`,
    `${A}reviews/6bf95f17-026a-400d-9067-08894b88a4a0.jpeg`,
    `${A}reviews/536e8d88-e55a-49f0-a9b3-305b69cbfbf5.jpeg`,
    `${A}reviews/abf3f504-d358-4888-bd0f-eafd1136d248.jpeg`,
    `${A}reviews/2f8ae556-1a0c-4cdb-b4e2-b30c2808755e.jpeg`,
    `${A}reviews/13ec2385-384c-4d1f-af39-793949cce8df.jpeg`,
    `${A}reviews/8e208e9b-b896-430d-839d-44d2a010b588.jpeg`,
];

/** Top trust badges (hero strip) — original site order and labels. */
const TRUST_TOP = [
    { icon_url: ASSETS.trustFast, label_i18n: { ar: "توصيل سريع", en: "Fast delivery" } },
    { icon_url: ASSETS.trustQuality, label_i18n: { ar: "ضمان الجودة", en: "Quality guarantee" } },
    { icon_url: ASSETS.trustIraq, label_i18n: { ar: "متوفر بالعراق", en: "Available in Iraq" } },
    { icon_url: ASSETS.trustCod, label_i18n: { ar: "الدفع عند الاستلام", en: "Cash on delivery" } },
];

/** Bottom (pre-footer) trust badges — the original swaps the first two labels. */
const TRUST_BOTTOM = [
    { icon_url: ASSETS.trustFast, label_i18n: { ar: "توصيل مجاني", en: "Free delivery" } },
    { icon_url: ASSETS.trustQuality, label_i18n: { ar: "خدمة العملاء", en: "Customer care" } },
    { icon_url: ASSETS.trustIraq, label_i18n: { ar: "متوفر بالعراق", en: "Available in Iraq" } },
    { icon_url: ASSETS.trustCod, label_i18n: { ar: "الدفع عند الاستلام", en: "Cash on delivery" } },
];

const TESTIMONIALS = [
    {
        name_i18n: { ar: "نورين", en: "Noreen" },
        quote_i18n: {
            ar: "هاي ثاني مرة اشتري منكم، نوعية العطر والكوالتي مال تغليف حرفيا مشايفها مثلها بحياتي",
            en: "Second time ordering — the perfume quality and packaging are unlike anything I've seen.",
        },
    },
    {
        name_i18n: { ar: "وسام الدراجي", en: "Wissam Al-Darraji" },
        quote_i18n: {
            ar: "مصداقيتكم شي المفروض تنحمدون عليه, العطر وصلني وجان مثل الوصف ولا ولله الوصف ظالمه. كمت اخاف اطلب من النت من ورة الغش بس انتو عملة نادرة كلش شكراً",
            en: "Your honesty deserves praise — the perfume arrived exactly as described. I was wary of ordering online, but you are a rare find. Thank you.",
        },
    },
    {
        name_i18n: { ar: "محمد علي", en: "Mohammed Ali" },
        quote_i18n: {
            ar: "عطوركم وتغليفكم يفوزون صراحة",
            en: "Your perfumes and packaging honestly win.",
        },
    },
];

const FAQ_CONTACT_HOME = {
    icon_url: ASSETS.mic,
    title_i18n: { ar: "عندك استفسار", en: "Have a question?" },
    sub_i18n: { ar: "نورونا على الواتساب وسولفوا ويانا", en: "Message us on WhatsApp and let's talk" },
    cta_label_i18n: { ar: "التواصل على واتساب", en: "Chat on WhatsApp" },
    whatsapp_number: "",
};

const FAQ_CONTACT_MORE = {
    icon_url: ASSETS.mic,
    title_i18n: { ar: "لديك أسئلة أخرى؟", en: "More questions?" },
    sub_i18n: {
        ar: "إدا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
        en: "If you still need more information, you can always reach us.",
    },
    cta_label_i18n: { ar: "تواصل معنا", en: "Contact us" },
    whatsapp_number: "",
};

const FAQ_ITEMS_HOME = [
    {
        q_i18n: { ar: "الدفع عند الاستلام", en: "Cash on delivery" },
        a_i18n: {
            ar: "يتم الدفع حصراً بعد استلام العطر واختباره من خلال زجاجة الاختبار المرفقة مجاناً مع كل عطر",
            en: "Payment happens only after you receive the perfume and try it via the free tester bottle included with every order.",
        },
    },
    {
        q_i18n: { ar: "شكد يطول الشحن؟", en: "How long does delivery take?" },
        a_i18n: {
            ar: "جميع الطلبات يتم توصيلها خلال اقل من 18 ساعة من تاريخ تثبيت الحجز",
            en: "All orders are delivered within 18 hours of confirming the reservation.",
        },
    },
];

/** Product-page policy accordion — the five funnel accordions, verbatim. */
const PDP_POLICIES = [
    {
        title_i18n: { ar: "سياسة الدفع عند الاستلام", en: "Cash-on-delivery policy" },
        body_i18n: {
            ar: "يتم الدفع حصراً بعد استلام العطر واختباره من خلال العينة الزجاجية المرفقة مجاناُ مع كل طلب.",
            en: "Payment happens only after receiving the perfume and testing it via the free glass sample included with every order.",
        },
    },
    {
        title_i18n: { ar: "شحن فائق السرعة", en: "Ultra-fast shipping" },
        body_i18n: {
            ar: "يتم تسليم اغلب الطلبات في غضون 14 ساعة من تاريخ تثبيت الطلب",
            en: "Most orders are delivered within 14 hours of confirmation.",
        },
    },
    {
        title_i18n: {
            ar: "كرت الضمان المميز و سياسة الاسترجاع",
            en: "Premium warranty card & return policy",
        },
        body_i18n: {
            ar: "عند استلام المنتج يتم التأكد من الجودة والمواصفات والفوحان والثبات بحضور المندوب, اي اختلاف يحق للزبون رفض المنتج ويتم ارجاع قيمته كاملة.\n\nويحق للزبون استعمال العطر والاحتفاظ به لمدة اسبوع كامل من تاريخ استلام الطلب واختباره من راحة منزله. ان لم تعجبه التجربة العطرية او اكتشافه لفرق بالمواصفات المذكورة يحق له ارجاع العطر واستلام قيمته من قبلنا.",
            en: "On delivery, quality, projection and longevity are verified with the courier present — any mismatch entitles you to refuse the product for a full refund.\n\nYou may keep and test the perfume for a full week from delivery; if the experience disappoints or the specs differ, return it for a full refund.",
        },
    },
    {
        title_i18n: { ar: "عطور اصلية", en: "Authentic perfumes" },
        body_i18n: {
            ar: "جميع عطورنا مختارة يدوياً وبعناية من افخم المصادر العالمية, ومن اجود انواع العطور والخامات العطرية. لا نتعامل بالعطور التركية المصنعة بالجملة او العطور الصينية الرديئة",
            en: "Every perfume is hand-picked from premium global sources and the finest aromatic materials. We never deal in bulk-made or low-grade imitations.",
        },
    },
    {
        title_i18n: { ar: "خدمة العملاء", en: "Customer care" },
        body_i18n: {
            ar: "سولف ويانا ! احنا موجودين بأي وقت وبكل وقت حتى نجاوب بكل حب ع اسئلتكم واستفساراتكم من خلال الواتساب",
            en: "Talk to us! We are available around the clock to answer your questions with love, over WhatsApp.",
        },
    },
];

export const schenidersSignatureTemplate: StoreTemplate = {
    id: "scheniders_signature",
    name_i18n: { en: "Scheniders Signature", ar: "توقيع شنايدر" },
    description_i18n: {
        en: "Warm cream ground, butter-yellow CTAs, floating pill chrome and a funnel-style COD product page.",
        ar: "خلفية كريمية دافئة، أزرار صفراء، هيدر عائم وصفحة منتج بنمط الفنل مع الدفع عند الاستلام.",
    },
    brand_kit: {
        colors: {
            primary: "#f7db17",
            secondary: "#3e3129",
            accent: "#fbb82e",
            surface: "#fdf8ef",
            surface_alt: "#f8efdf",
            ink: "#483b36",
            success: "#3ecf8e",
            danger: "#e2574c",
        },
        typography: {
            display: "Cairo",
            body: "Cairo",
            display_ar: "Cairo",
            body_ar: "Cairo",
            scale: "comfortable",
        },
        shape: {
            radius: "round",
            border_thickness: "thin",
            shadow_style: "soft",
            rotation_intensity: "none",
        },
        motion: { enabled: true, speed: "normal" },
        voice: { formality: "casual" },
    },
    globals: {
        header: s("site_header", {
            layout: "floating_pill",
            wordmark_i18n: { ar: "شنايدر", en: "Scheniders" },
            logo_image_url: ASSETS.logo,
            nav_links: [
                { label_i18n: { ar: "الصفحة الرئيسية", en: "Home" }, href: "/" },
                { label_i18n: { ar: "منتجاتنا", en: "Our products" }, href: "/products" },
                { label_i18n: { ar: "معلومات عنا", en: "About us" }, href: "/about" },
                { label_i18n: { ar: "تواصل معنا", en: "Contact us" }, href: "/contact" },
            ],
            show_search: false,
            show_cart: false,
            sticky: true,
        }),
        footer: s("site_footer", {
            layout: "info_panel",
            tagline_i18n: {
                ar: "عطور فخمة فائقة الجودة بأسعار تنافسية",
                en: "Premium, top-quality perfumes at competitive prices",
            },
            links_heading_i18n: { ar: "معلومات عنا", en: "About us" },
            columns: [
                {
                    heading_i18n: { ar: "معلومات عنا", en: "About us" },
                    links: [
                        { label_i18n: { ar: "تواصل معنا", en: "Contact us" }, href: "/contact" },
                        { label_i18n: { ar: "من نحن", en: "Who we are" }, href: "/about" },
                        { label_i18n: { ar: "تتبع الطلب", en: "Track your order" }, href: "/track" },
                        {
                            label_i18n: {
                                ar: "سياسة الخصوصية - Privacy policy",
                                en: "Privacy policy",
                            },
                            href: "/policies/privacy",
                        },
                        {
                            label_i18n: {
                                ar: "الشروط والاحكام - Terms and conditions",
                                en: "Terms and conditions",
                            },
                            href: "/policies/terms",
                        },
                        {
                            label_i18n: {
                                ar: "سياسة الاسترجاع - Return and Refund policy",
                                en: "Return and refund policy",
                            },
                            href: "/policies/returns",
                        },
                        {
                            label_i18n: {
                                ar: "سياسة الشحن - Shipping policy",
                                en: "Shipping policy",
                            },
                            href: "/policies/shipping",
                        },
                    ],
                },
            ],
            show_cod_badge: false,
            contact: {
                phone: "+9647779703832",
                address_i18n: {
                    ar: "العراق - بغداد - زيونة",
                    en: "Iraq - Baghdad - Zayouna",
                },
            },
            legal: {
                company_name: "Schnieder - شنايدر",
                business_license: "310536983500003",
            },
            rights_i18n: {
                ar: "جميع الحقوق محفوظة لمجموعة شركات شنايدر",
                en: "All rights reserved to the Scheniders group",
            },
            // Live socials from the original footer (twitter/facebook icons
            // existed there but pointed nowhere — omitted on purpose).
            social_links: {
                tiktok: "https://www.tiktok.com/@kawkab.brand",
                instagram: "https://www.instagram.com/kawkab.brand/",
            },
            newsletter: {
                enabled: true,
                copy_i18n: {
                    ar: "كن أول من يعرف آخر الاخبار عن متجرنا، عند انضمامك ستحصل فورا على كوبون خصم 15% على منتجاتنا.",
                    en: "Be the first to hear our news — join and instantly get a 15% coupon.",
                },
                placeholder_i18n: {
                    ar: "ادخل بريدك الالكتروني هنا",
                    en: "Enter your email here",
                },
                button_i18n: { ar: "اشترك", en: "Subscribe" },
            },
        }),
        promo_bar: s("countdown_announcement", {
            label_i18n: { ar: "ينتهي عرض الخصم خلال:", en: "Discount offer ends in:" },
            // The original funnel runs a 150-minute evergreen urgency loop
            // (epoch-aligned, never sits at zero) rather than a daily reset.
            mode: "evergreen_minutes",
            duration_minutes: 150,
            bg: "secondary",
            show_flame: true,
        }),
    },
    pages: {
        home: [
            s("hero_card_float", {
                headline_i18n: { ar: "يا هلا ومرحبا!", en: "Welcome!" },
                sub_i18n: {
                    ar: "مستعد تجرب روائح عطرية من افخم الماركات العالمية؟",
                    en: "Ready to try fragrances from the world's finest houses?",
                },
                cta_label_i18n: { ar: "مجموعتنا", en: "Our collection" },
                cta_href: "/products",
                bg_image_url: ASSETS.heroBg,
                card_align: "end",
                badge_i18n: undefined,
                secondary_cta_kind: "whatsapp",
                secondary_cta_value: "",
                secondary_cta_label_i18n: { ar: "اطلب عبر واتساب", en: "Order on WhatsApp" },
            }),
            s("trust_badge_row", { items: TRUST_TOP, band_style: "plain" }),
            s("category_spotlight_pair", {
                eyebrow_i18n: { ar: "الفئات", en: "Categories" },
                title_i18n: { ar: "اختر حسب الفئة", en: "Shop by category" },
                side_image_left_url: ASSETS.sideArtLeft,
                side_image_right_url: ASSETS.sideArtRight,
                items: [
                    {
                        image_url: ASSETS.catPicked,
                        label_i18n: { ar: "عطور مختارة", en: "Curated perfumes" },
                        href: "/categories/picked",
                    },
                    {
                        image_url: ASSETS.catTop,
                        label_i18n: { ar: "الاكثر مبيعاً", en: "Best sellers" },
                        href: "/categories/topsellers",
                    },
                ],
            }),
            s("product_grid", {
                mode: "auto",
                query: { sort: "newest", limit: 8 },
                card_style: "price_pill",
                eyebrow_i18n: { ar: "الأكثر مبيعا", en: "Best sellers" },
                heading_i18n: { ar: "اكثر العطور مبيعاً", en: "Our best-selling perfumes" },
                subheading_i18n: {
                    ar: "تجميعة من اكثر العطور اللي حبوهم زبائنا",
                    en: "A lineup of the perfumes our customers loved most",
                },
                see_all_label_i18n: { ar: "شوفهم كلهم", en: "See them all" },
                see_all_href: "/products",
                show_stars: true,
            }),
            s("collection_trio", {
                eyebrow_i18n: { ar: "مختاراتنا", en: "Our picks" },
                title_i18n: { ar: "عطور مميزة على ذوقنا", en: "Perfumes picked to our taste" },
                items: [
                    {
                        image_url: ASSETS.trioWork,
                        title_i18n: { ar: "عطور للدوام", en: "Perfumes for work" },
                        sub_i18n: {
                            ar: "توازن يجنن بين الرسمية والشياكة",
                            en: "A stunning balance of formality and style",
                        },
                        cta_label_i18n: { ar: "شوفهم", en: "See them" },
                        href: "/products",
                    },
                    {
                        image_url: ASSETS.trioOutings,
                        title_i18n: { ar: "عطور للطلعات", en: "Perfumes for outings" },
                        sub_i18n: {
                            ar: "الجمع بين الفخامة والراحة",
                            en: "Luxury and comfort combined",
                        },
                        cta_label_i18n: { ar: "تعال نوريك", en: "Come see" },
                        href: "/products",
                    },
                    {
                        image_url: ASSETS.trioOccasions,
                        title_i18n: { ar: "عطور للمناسبات", en: "Perfumes for occasions" },
                        sub_i18n: {
                            ar: "للمناسبات الخاصة",
                            en: "For special occasions",
                        },
                        cta_label_i18n: { ar: "تألق هسة", en: "Shine now" },
                        href: "/products",
                    },
                ],
            }),
            s("testimonial_cards", {
                eyebrow_i18n: { ar: "آراء كشايخنا", en: "What our regulars say" },
                title_i18n: { ar: "ليش الناس تموت على عطور", en: "Why people are crazy about our perfumes" },
                side_image_left_url: ASSETS.sideArtLeft,
                side_image_right_url: ASSETS.sideArtRight,
                items: TESTIMONIALS,
            }),
            s("pillars_grid", {
                eyebrow_i18n: { ar: "ضمانات", en: "Guarantees" },
                title_i18n: { ar: "ليش شنايدر؟", en: "Why Scheniders?" },
                items: [
                    {
                        icon_url: ASSETS.pillarQuality,
                        title_i18n: { ar: "الجودة الفائقة", en: "Superior quality" },
                        body_i18n: {
                            ar: "عطورنا نختارهم فقط وحصرياً من اعلى جودة زيوت عطرية, اي شي دون الفئة العليا بالخامات العطرية ما نتقرب الها",
                            en: "We choose only the highest-grade fragrance oils — anything below the top tier never makes the cut.",
                        },
                    },
                    {
                        icon_url: ASSETS.pillarValue,
                        title_i18n: { ar: "القيمة مقابل السعر", en: "Value for money" },
                        body_i18n: {
                            ar: "على عكس بقية الشركات نحرص على تسعير عطورنا بارقام عادلة, مستحيل نخلي سعر على عطر احنا ما مستعدين ندفعها بيه",
                            en: "Unlike others we price fairly — we would never charge a price we would not pay ourselves.",
                        },
                    },
                    {
                        icon_url: ASSETS.pillarEndurance,
                        title_i18n: { ar: "الادامة", en: "Longevity" },
                        body_i18n: {
                            ar: "من اكثر الشروط الي معقدة عملنا هو حرصنا على اختبار العطور بصورة شخصية بانفسنا, ونعرضهم لمجموعة اختبارات سيطرة نوعية. العطر اللي ما يحافظ على اداءه وفوحانه اثناء اليوم يتم رفضه",
                            en: "We personally test every perfume through a battery of quality checks — any scent that fades through the day is rejected.",
                        },
                    },
                ],
            }),
            s("about_spotlight", {
                title_i18n: { ar: "منو احنا", en: "Who we are" },
                body_i18n: {
                    ar: "نقدم لك أفضل المنتجات التي تلبي احتياجاتك. نحن ملتزمون بتوفير خدمة عملاء ممتازة من خلال فريقنا المدرب والودود الذي يساعدك في تحقيق أهدافك الجمالية. تصفح موقعنا الآن واستمتع بتجربة تسوق سهلة ومريحة مع توصيل سريع وموثوق. اكتشف الجمال الحقيقي معنا!",
                    en: "We bring you the best products for your needs, backed by a friendly, trained team committed to excellent service. Browse now and enjoy easy shopping with fast, reliable delivery. Discover true beauty with us!",
                },
                cta_label_i18n: { ar: "تعرف أكثر", en: "Learn more" },
                cta_href: "/about",
                bg_image_url: ASSETS.aboutBg,
                overlay_opacity: 0.1,
            }),
            s("faq_contact_split", {
                eyebrow_i18n: { ar: "أسئلة و أجوبة", en: "Questions & answers" },
                title_i18n: { ar: "الأسئلة الأكثر شيوعا", en: "Frequently asked questions" },
                sub_i18n: {
                    ar: "اجوبة لاسئلتكم المشهورة من فريقنا",
                    en: "Answers to your most common questions, from our team",
                },
                row_icon_url: ASSETS.faqRow,
                items: FAQ_ITEMS_HOME,
                contact: FAQ_CONTACT_HOME,
            }),
            s("trust_badge_row", { items: TRUST_BOTTOM, band_style: "plain" }),
        ],
        category: [
            s("product_grid", {
                mode: "auto",
                query: { sort: "newest", limit: 24 },
                card_style: "price_pill",
                heading_i18n: { ar: "منتجاتنا", en: "Our products" },
                show_stars: true,
            }),
            s("trust_badge_row", { items: TRUST_BOTTOM, band_style: "plain" }),
        ],
        product: [
            s("pdp_direct_order", {
                rating_chip_i18n: {
                    ar: "أكثر من 134 تقييم إيجابي",
                    en: "Over 134 positive reviews",
                },
                stock_urgency_i18n: {
                    ar: "هذا العطر عليه طلب كبير ✨ سارع بالطلب — باقي {count} قطع فقط",
                    en: "This perfume is in high demand ✨ order fast — only {count} left",
                },
                show_gallery: true,
            }),
            s("accordion_richtext", {
                heading_i18n: undefined,
                items: PDP_POLICIES,
            }),
            s("trust_badge_row", { items: TRUST_BOTTOM, band_style: "tinted" }),
            // The original funnel shows a carousel of customer chat
            // screenshots on the PDP (site-wide, no names/text) — the named
            // testimonial trio lives on the home page only.
            s("image_gallery", {
                heading_i18n: { ar: "كلامهم مو كلامنا", en: "Their words, not ours" },
                layout: "carousel",
                images: REVIEW_SCREENSHOTS.map((url) => ({ url })),
            }),
            // Real per-product customer reviews + submission form.
            s("product_reviews"),
            s("faq_contact_split", {
                eyebrow_i18n: { ar: "أسئلة و أجوبة", en: "Questions & answers" },
                title_i18n: { ar: "الأسئلة الأكثر شيوعا", en: "Frequently asked questions" },
                sub_i18n: {
                    ar: "هنا تجد أجوبة عن الأسئلة الاكثر شيوعا، إدا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
                    en: "Answers to the most common questions — and you can always reach us for more.",
                },
                row_icon_url: ASSETS.faqRow,
                items: FAQ_ITEMS_HOME,
                contact: FAQ_CONTACT_MORE,
            }),
            s("product_grid", {
                mode: "auto",
                query: { sort: "newest", limit: 8 },
                card_style: "price_pill",
                eyebrow_i18n: { ar: "القطع المميزة لهذا الشهر", en: "This month's standouts" },
                heading_i18n: { ar: "اكثر منتجاتنا مبيعاً", en: "Our best sellers" },
                subheading_i18n: {
                    ar: "شوف تشكيلة من اكثر العطور اللي حبوها زبائنا",
                    en: "A selection of the perfumes our customers loved most",
                },
                see_all_label_i18n: { ar: "عرض المزيد", en: "Show more" },
                see_all_href: "/products",
                show_stars: true,
            }),
            s("sticky_cta_bar"),
        ],
        about: [
            s("hero_card_float", {
                headline_i18n: { ar: "مرحبا بك في متجرنا", en: "Welcome to our store" },
                sub_i18n: {
                    ar: "نقدم لك أفضل المنتجات التي تلبي احتياجاتك. نحن ملتزمون بتوفير خدمة عملاء ممتازة من خلال فريقنا المدرب والودود.",
                    en: "The best products for your needs, backed by a friendly, trained team committed to excellent service.",
                },
                cta_label_i18n: { ar: "منتجاتنا", en: "Our products" },
                cta_href: "/products",
                card_align: "center",
                secondary_cta_kind: "whatsapp",
                secondary_cta_value: "",
                secondary_cta_label_i18n: { ar: "اطلب عبر واتساب", en: "Order on WhatsApp" },
            }),
            s("pillars_grid", {
                eyebrow_i18n: { ar: "مميزات", en: "Highlights" },
                title_i18n: { ar: "لماذا متجرنا ؟", en: "Why our store?" },
                items: [
                    {
                        icon_url: ASSETS.pillarQuality,
                        title_i18n: { ar: "رضا العملاء", en: "Customer satisfaction" },
                        body_i18n: {
                            ar: "نولي أهمية كبيرة لرضا العملاء، ونسعى جاهدين لضمان رضاك التام وراحتك في عملية الشراء واستخدام المنتج.",
                            en: "Your satisfaction matters — we work hard to make buying and using our products a delight.",
                        },
                    },
                    {
                        icon_url: ASSETS.pillarValue,
                        title_i18n: { ar: "عروض وتخفيضات", en: "Offers & discounts" },
                        body_i18n: {
                            ar: "نقدم عروض وتخفيضات منتظمة على المنتجات لضمان جذب العملاء وتحقيق أفضل قيمة ممكنة لمشترياتهم.",
                            en: "Regular offers and discounts so every purchase delivers the best possible value.",
                        },
                    },
                    {
                        icon_url: ASSETS.pillarEndurance,
                        title_i18n: { ar: "كفاءة عالية", en: "High standards" },
                        body_i18n: {
                            ar: "نحرص على توفير منتجات عالية الجودة من مصادر موثوقة. نختار الماركات المشهورة والمعروفة بجودتها.",
                            en: "Quality products from trusted sources — only brands known for their excellence.",
                        },
                    },
                    {
                        icon_url: ASSETS.pillarQuality,
                        title_i18n: { ar: "تجربة تسوق سهلة ومريحة", en: "Easy, comfortable shopping" },
                        body_i18n: {
                            ar: "تصفح موقعنا الإلكتروني بسهولة وبساطة, لدينا واجهة مستخدم بسيطة ومرنة تجعل عملية الشراء ممتعة وسهلة بضغطة زر.",
                            en: "A simple, flexible storefront that makes buying enjoyable — one tap away.",
                        },
                    },
                    {
                        icon_url: ASSETS.pillarValue,
                        title_i18n: { ar: "العروض والتخفيضات", en: "Exclusive deals" },
                        body_i18n: {
                            ar: "نقدم عروضًا وتخفيضاتٍ مميزة للعملاء الذين يتسوقون من متجرنا. نوفر عروض حصرية لتشجيع العملاء على الشراء والعودة للتسوق مجددًا.",
                            en: "Exclusive deals for our shoppers — rewards that keep you coming back.",
                        },
                    },
                    {
                        icon_url: ASSETS.pillarEndurance,
                        title_i18n: { ar: "توصيل سريع وموثوق", en: "Fast, reliable delivery" },
                        body_i18n: {
                            ar: "سيتم توصيل طلبك بأمان وفي أقرب وقت ممكن، لتستمتع بمنتجاتك وتجربتها في أسرع وقت.",
                            en: "Your order arrives safely and as fast as possible, so you can enjoy it sooner.",
                        },
                    },
                ],
            }),
            s("testimonial_cards", {
                eyebrow_i18n: { ar: "آراء كشايخنا", en: "What our regulars say" },
                title_i18n: { ar: "ليش الناس تموت على عطور", en: "Why people are crazy about our perfumes" },
                side_image_left_url: ASSETS.sideArtLeft,
                side_image_right_url: ASSETS.sideArtRight,
                items: TESTIMONIALS,
            }),
            s("faq_contact_split", {
                eyebrow_i18n: { ar: "أسئلة و أجوبة", en: "Questions & answers" },
                title_i18n: { ar: "الأسئلة الأكثر شيوعا", en: "Frequently asked questions" },
                sub_i18n: {
                    ar: "هنا تجد أجوبة عن الأسئلة الاكثر شيوعا، إدا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
                    en: "Answers to the most common questions — and you can always reach us for more.",
                },
                row_icon_url: ASSETS.faqRow,
                items: [
                    {
                        q_i18n: { ar: "كيف يمكنني إلغاء طلب؟", en: "How can I cancel an order?" },
                        a_i18n: {
                            ar: "نحن قادرون فقط على إلغاء الطلبات في غضون الـ 12 ساعة الأولى بعد تقديم الطلب. وبعد ذلك تمت معالجة الطلب على الأرجح والاستعداد للشحن. نحن نعتذر عن أي إزعاج قد يسببه هذا الأمر، لكننا نفخر بتقديم الخدمة السريعة وهذا يشمل إخراج طلباتك في أسرع وقت ممكن.",
                            en: "Orders can only be cancelled within the first 12 hours — after that they are likely processed and being prepared for shipping. We apologise for any inconvenience; fast service means your order goes out as quickly as possible.",
                        },
                    },
                    {
                        q_i18n: {
                            ar: "كم تستغرق عملية الشحن من الوقت؟",
                            en: "How long does shipping take?",
                        },
                        a_i18n: {
                            ar: "جميع الطلبات داخل العراق يتم توصيلها خلال اقل من 18 ساعة من تاريخ تثبيت الحجز.",
                            en: "All orders inside Iraq are delivered within 18 hours of confirmation.",
                        },
                    },
                    {
                        q_i18n: { ar: "متى سوف يشحن طلبي؟", en: "When will my order ship?" },
                        a_i18n: {
                            ar: "تتم معالجة الطلبات وشحنها عادة في نفس يوم تثبيت الطلب.",
                            en: "Orders are usually processed and shipped the same day they are confirmed.",
                        },
                    },
                ],
                contact: FAQ_CONTACT_MORE,
            }),
        ],
        contact: [
            s("faq_contact_split", {
                eyebrow_i18n: { ar: "تواصل معنا", en: "Contact us" },
                title_i18n: {
                    ar: "لديك أية أسئلة ؟ دعنا نساعدك",
                    en: "Questions? Let us help",
                },
                sub_i18n: {
                    ar: "تواصل معنا إن كانت لديك أي أسئلة وسنعاود الاتصال بك في أقرب وقت ممكن. يمكنك أيضًا التحقق من قسم المساعدة والأسئلة الشائعة.",
                    en: "Reach out with any question and we'll get back to you as soon as possible — the FAQ section may help too.",
                },
                row_icon_url: ASSETS.faqRow,
                items: FAQ_ITEMS_HOME,
                contact: FAQ_CONTACT_HOME,
            }),
            s("trust_badge_row", { items: TRUST_BOTTOM, band_style: "plain" }),
        ],
        faq: [
            s("faq_contact_split", {
                eyebrow_i18n: { ar: "أسئلة و أجوبة", en: "Questions & answers" },
                title_i18n: { ar: "الأسئلة الأكثر شيوعا", en: "Frequently asked questions" },
                sub_i18n: {
                    ar: "اجوبة لاسئلتكم المشهورة من فريقنا",
                    en: "Answers to your most common questions, from our team",
                },
                row_icon_url: ASSETS.faqRow,
                items: FAQ_ITEMS_HOME,
                contact: FAQ_CONTACT_HOME,
            }),
        ],
        ...commercePages(s),
    },
};
