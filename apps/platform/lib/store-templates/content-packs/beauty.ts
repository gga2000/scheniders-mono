// Beauty content pack — copy, starter categories and the
// attributes shoppers filter by. No invented reviews: testimonials stay
// empty until the merchant has real ones (the section then renders nothing).
import type { ContentPack } from "./types";

export const beautyPack: ContentPack = {
    id: "beauty",
    name_i18n: {
        ar: "تجميل",
        en: "Beauty",
    },
    description_i18n: {
        ar: "عناية ومكياج أصلي من موزّعين معتمدين.",
        en: "Original skincare and makeup from authorised distributors.",
    },
    match: [/beauty|cosmetic|skincare|makeup|جمال|تجميل|عناية/i],
    hero: {
        headline_i18n: {
            ar: "منتجات أصلية لبشرتك",
            en: "Original products for your skin",
        },
        sub_i18n: {
            ar: "عناية ومكياج من موزّعين معتمدين، مختومة ومفحوصة الدفعة، توصل لبابك.",
            en: "Skincare and makeup from authorised distributors, sealed and batch-checked, delivered to your door.",
        },
        cta_label_i18n: {
            ar: "تسوّقي هسة",
            en: "Shop now",
        },
    },
    story: {
        title_i18n: {
            ar: "منو احنا؟",
            en: "Who we are",
        },
        body_i18n: {
            ar: "تعبنا من التخمين أي منتج أصلي، فسوّينا متجراً كل منتج فيه من موزّع معتمد، مفحوص الدفعة ومخزّن صح. لا تقليد ولا منتجات قريبة الانتهاء.",
            en: "We got tired of guessing which products are original, so we built a store where every item comes from an authorised distributor, batch-checked and stored properly. No fakes, no near-expiry stock.",
        },
    },
    about: {
        title_i18n: {
            ar: "أصلي حصراً",
            en: "Original only",
        },
        body_i18n: {
            ar: "كل منتج مختوم ومن موزّع معتمد، وتفتحينه وتتأكدين قبل ما تدفعين.",
            en: "Every product is sealed and from an authorised distributor — open and check before you pay.",
        },
    },
    founder: {
        quote_i18n: {
            ar: "إذا ما أحطّه على بشرتي، ما يدخل المتجر.",
            en: "If I would not put it on my own skin, it does not go in the store.",
        },
        role_i18n: {
            ar: "المؤسِّسة",
            en: "Founder",
        },
    },
    pillars: [
        {
            title_i18n: {
                ar: "أصلي ومختوم",
                en: "Original and sealed",
            },
            body_i18n: {
                ar: "من موزّعين معتمدين، والدفعة مفحوصة وتاريخ الانتهاء بعيد.",
                en: "From authorised distributors, batch-checked, far from expiry.",
            },
        },
        {
            title_i18n: {
                ar: "لكل نوع بشرة",
                en: "For every skin type",
            },
            body_i18n: {
                ar: "نكتب نوع البشرة والمكوّنات الفعّالة على كل منتج حتى تختارين صح.",
                en: "We list skin type and active ingredients on every product so you choose right.",
            },
        },
        {
            title_i18n: {
                ar: "تفتحين وتتأكدين",
                en: "Open and check",
            },
            body_i18n: {
                ar: "تفحصين الختم والمنتج بحضور المندوب قبل ما تدفعين.",
                en: "Check the seal and the product with the courier present before you pay.",
            },
        },
    ],
    trust: [
        {
            ar: "أصلي ومختوم",
            en: "Original and sealed",
        },
        {
            ar: "الدفع عند الاستلام",
            en: "Cash on delivery",
        },
        {
            ar: "افتح وتأكد قبل ما تدفع",
            en: "Check before you pay",
        },
        {
            ar: "توصيل لكل المحافظات",
            en: "Delivery everywhere",
        },
    ],
    faq: [
        {
            q_i18n: {
                ar: "شلون أتأكد إنه أصلي؟",
                en: "How do I know it is original?",
            },
            a_i18n: {
                ar: "كل منتج مختوم ومن موزّع معتمد، وتكدرين تفحصين الباركود والختم بحضور المندوب.",
                en: "Every product is sealed and from an authorised distributor; check the barcode and seal with the courier present.",
            },
        },
        {
            q_i18n: {
                ar: "أي منتج يناسب بشرتي؟",
                en: "Which product suits my skin?",
            },
            a_i18n: {
                ar: "راسلينا على واتساب بنوع بشرتك ونرشّحلج.",
                en: "Message us on WhatsApp with your skin type and we will recommend.",
            },
        },
        {
            q_i18n: {
                ar: "أكدر أدفع عند الاستلام؟",
                en: "Can I pay on delivery?",
            },
            a_i18n: {
                ar: "نعم — تدفع كاش للمندوب بعد ما تفتح الطلب وتتأكد منه.",
                en: "Yes — you pay the courier in cash after opening and checking the order.",
            },
        },
    ],
    faq_orders: [
        {
            q_i18n: {
                ar: "كيف ألغي طلبي؟",
                en: "How do I cancel an order?",
            },
            a_i18n: {
                ar: "تكدر تلغي خلال أول ١٢ ساعة من الطلب عبر واتساب. بعدها الطلب غالباً انشحن.",
                en: "You can cancel within the first 12 hours over WhatsApp. After that the order has usually shipped.",
            },
        },
        {
            q_i18n: {
                ar: "متى يوصل طلبي؟",
                en: "When will my order arrive?",
            },
            a_i18n: {
                ar: "بغداد عادة خلال يوم، وبقية المحافظات خلال ١–٣ أيام من تثبيت الطلب.",
                en: "Baghdad usually within a day; other governorates within 1–3 days of confirmation.",
            },
        },
        {
            q_i18n: {
                ar: "شلون أتابع طلبي؟",
                en: "How do I track my order?",
            },
            a_i18n: {
                ar: "من صفحة تتبع الطلب برقم هاتفك ورقم الطلب، أو راسلنا على واتساب.",
                en: "From the order-tracking page with your phone and order number, or message us on WhatsApp.",
            },
        },
    ],
    delivery: {
        sla_i18n: {
            ar: "بغداد خلال يوم، وبقية المحافظات خلال ١–٣ أيام",
            en: "Baghdad within a day, other governorates in 1–3 days",
        },
        inspection_i18n: {
            ar: "افتح الطلب وتأكد قبل ما تدفع",
            en: "Open and check your order before you pay",
        },
        reassurance_i18n: {
            ar: "تفتح وتتأكد قبل ما تدفع — الدفع عند الاستلام",
            en: "Open and check before you pay — cash on delivery",
        },
    },
    pdp_policies: [
        {
            title_i18n: {
                ar: "الدفع عند الاستلام",
                en: "Cash on delivery",
            },
            body_i18n: {
                ar: "تدفع كاش للمندوب بعد ما تفتح المنتج وتتأكد منه. ما ندفع ولا دينار مقدماً.",
                en: "Pay the courier in cash after you open and check the المنتج. Nothing is paid up front.",
            },
        },
        {
            title_i18n: {
                ar: "التوصيل",
                en: "Delivery",
            },
            body_i18n: {
                ar: "بغداد خلال يوم، وبقية المحافظات خلال ١–٣ أيام من تثبيت الطلب. أجرة التوصيل تنعرض قبل ما تأكد.",
                en: "Baghdad within a day, other governorates in 1–3 days of confirmation. The delivery fee shows before you confirm.",
            },
        },
        {
            title_i18n: {
                ar: "الاستبدال والإرجاع",
                en: "Exchange and returns",
            },
            body_i18n: {
                ar: "لأسباب صحية، المنتجات المفتوحة ما ترجع. إذا وصل مختوم وغير مطابق أو فيه عيب، راسلنا خلال ٣ أيام.",
                en: "For hygiene reasons, opened products cannot be returned. If it arrives sealed but wrong or faulty, message us within 3 days.",
            },
        },
        {
            title_i18n: {
                ar: "خدمة الزبائن",
                en: "Customer care",
            },
            body_i18n: {
                ar: "راسلنا على واتساب بأي وقت — نرد بسرعة ونتابع طلبك لحد ما يوصل.",
                en: "Message us on WhatsApp any time — we answer fast and follow your order until it arrives.",
            },
        },
    ],
    pdp: {
        urgency_i18n: {
            ar: "عليه طلب كبير — باقي {count} فقط",
            en: "In high demand — only {count} left",
        },
        feature_title_i18n: {
            ar: "ليش هذا المنتج؟",
            en: "Why this product?",
        },
    },
    bestsellers: {
        eyebrow_i18n: {
            ar: "الأكثر مبيعاً",
            en: "Best sellers",
        },
        heading_i18n: {
            ar: "أكثر منتجاتنا مبيعاً",
            en: "Our best sellers",
        },
        sub_i18n: {
            ar: "اللي رجعت له زبوناتنا",
            en: "What our customers came back for",
        },
    },
    spotlights: [
        {
            slug: "skincare",
            name_i18n: {
                ar: "العناية بالبشرة",
                en: "Skincare",
            },
        },
        {
            slug: "makeup",
            name_i18n: {
                ar: "مكياج",
                en: "Makeup",
            },
        },
    ],
    collections: [
        {
            slug: "hair",
            title_i18n: {
                ar: "العناية بالشعر",
                en: "Hair care",
            },
            sub_i18n: {
                ar: "شامبو وزيوت وماسكات",
                en: "Shampoo, oils and masks",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "fragrance",
            title_i18n: {
                ar: "عطور",
                en: "Fragrance",
            },
            sub_i18n: {
                ar: "عطور أصلية",
                en: "Original fragrances",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "sets",
            title_i18n: {
                ar: "أطقم وهدايا",
                en: "Sets and gifts",
            },
            sub_i18n: {
                ar: "مجموعات جاهزة للإهداء",
                en: "Ready-to-gift sets",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
    ],
    tagline_i18n: {
        ar: "عناية ومكياج أصلي، توصل لبابك",
        en: "Original skincare and makeup, delivered to your door",
    },
    testimonials: [],
    categories: [
        {
            slug: "skincare",
            name_i18n: {
                ar: "العناية بالبشرة",
                en: "Skincare",
            },
        },
        {
            slug: "makeup",
            name_i18n: {
                ar: "مكياج",
                en: "Makeup",
            },
        },
        {
            slug: "hair",
            name_i18n: {
                ar: "العناية بالشعر",
                en: "Hair care",
            },
        },
        {
            slug: "fragrance",
            name_i18n: {
                ar: "عطور",
                en: "Fragrance",
            },
        },
        {
            slug: "sets",
            name_i18n: {
                ar: "أطقم وهدايا",
                en: "Sets and gifts",
            },
        },
        {
            slug: "tools",
            name_i18n: {
                ar: "أدوات",
                en: "Tools",
            },
        },
    ],
    attributes: [
        {
            key: "skin_type",
            name_i18n: {
                ar: "نوع البشرة",
                en: "Skin type",
            },
            kind: "enum",
            display_order: 1,
            options: [
                {
                    value: "dry",
                    label_i18n: {
                        ar: "جافة",
                        en: "Dry",
                    },
                },
                {
                    value: "oily",
                    label_i18n: {
                        ar: "دهنية",
                        en: "Oily",
                    },
                },
                {
                    value: "combination",
                    label_i18n: {
                        ar: "مختلطة",
                        en: "Combination",
                    },
                },
                {
                    value: "sensitive",
                    label_i18n: {
                        ar: "حساسة",
                        en: "Sensitive",
                    },
                },
                {
                    value: "all",
                    label_i18n: {
                        ar: "كل الأنواع",
                        en: "All types",
                    },
                },
            ],
        },
        {
            key: "concern",
            name_i18n: {
                ar: "الهدف",
                en: "Concern",
            },
            kind: "enum",
            display_order: 2,
            options: [
                {
                    value: "hydration",
                    label_i18n: {
                        ar: "ترطيب",
                        en: "Hydration",
                    },
                },
                {
                    value: "acne",
                    label_i18n: {
                        ar: "حب الشباب",
                        en: "Acne",
                    },
                },
                {
                    value: "brightening",
                    label_i18n: {
                        ar: "تفتيح",
                        en: "Brightening",
                    },
                },
                {
                    value: "anti_aging",
                    label_i18n: {
                        ar: "تجاعيد",
                        en: "Anti-ageing",
                    },
                },
                {
                    value: "sun",
                    label_i18n: {
                        ar: "حماية من الشمس",
                        en: "Sun protection",
                    },
                },
            ],
        },
        {
            key: "brand",
            name_i18n: {
                ar: "الماركة",
                en: "Brand",
            },
            kind: "enum",
            display_order: 3,
            options: [
                {
                    value: "other",
                    label_i18n: {
                        ar: "أخرى",
                        en: "Other",
                    },
                },
            ],
        },
        {
            key: "volume_ml",
            name_i18n: {
                ar: "الحجم (مل)",
                en: "Volume (ml)",
            },
            kind: "range",
            range_min: 5,
            range_max: 1000,
            display_order: 4,
            unit_i18n: {
                ar: "مل",
                en: "ml",
            },
        },
        {
            key: "fragrance_free",
            name_i18n: {
                ar: "بدون عطر",
                en: "Fragrance-free",
            },
            kind: "boolean",
            display_order: 5,
        },
    ],
};
