// Coffee content pack — copy, starter categories and the
// attributes shoppers filter by. No invented reviews: testimonials stay
// empty until the merchant has real ones (the section then renders nothing).
import type { ContentPack } from "./types";

export const coffeePack: ContentPack = {
    id: "coffee",
    name_i18n: {
        ar: "قهوة",
        en: "Coffee",
    },
    description_i18n: {
        ar: "حبوب محمصة طازج، تحميص ومطحنة على كيفك.",
        en: "Fresh-roasted beans, roast and grind your way.",
    },
    match: [/coffee|roast|cafe|قهوة|بن/i],
    hero: {
        headline_i18n: {
            ar: "قهوتك، محمصة هذا الأسبوع",
            en: "Your coffee, roasted this week",
        },
        sub_i18n: {
            ar: "حبوب مختارة من مزارع معروفة، نحمّصها بكميات صغيرة ونطحنها على طريقتك.",
            en: "Beans from named farms, roasted in small batches and ground your way.",
        },
        cta_label_i18n: {
            ar: "شوف الحبوب",
            en: "See the beans",
        },
    },
    story: {
        title_i18n: {
            ar: "منو احنا؟",
            en: "Who we are",
        },
        body_i18n: {
            ar: "محمصة صغيرة نشتري الحبوب الخضراء بأنفسنا ونحمّص كل أسبوع. تاريخ التحميص مكتوب على كل كيس.",
            en: "A small roastery that buys its own green beans and roasts every week. The roast date is on every bag.",
        },
    },
    about: {
        title_i18n: {
            ar: "محمصة صغيرة",
            en: "A small roastery",
        },
        body_i18n: {
            ar: "نحمّص كل أسبوع بكميات صغيرة حتى توصلك القهوة بأحسن حالها.",
            en: "We roast every week in small batches so your coffee arrives at its best.",
        },
    },
    founder: {
        quote_i18n: {
            ar: "القهوة اللي ما نشربها بأنفسنا ما تنباع.",
            en: "Coffee we would not drink ourselves is not for sale.",
        },
        role_i18n: {
            ar: "المحمّص",
            en: "Roaster",
        },
    },
    pillars: [
        {
            title_i18n: {
                ar: "تحميص طازج",
                en: "Fresh roast",
            },
            body_i18n: {
                ar: "كل كيس عليه تاريخ التحميص، وما نشحن حبوب عمرها أكثر من أسبوعين.",
                en: "Every bag carries its roast date; we never ship beans older than two weeks.",
            },
        },
        {
            title_i18n: {
                ar: "مطحنة على كيفك",
                en: "Ground your way",
            },
            body_i18n: {
                ar: "حبوب كاملة، أو مطحونة لطريقتك: إسبريسو، فرنش برس، فلتر أو تركي.",
                en: "Whole bean, or ground for your method: espresso, French press, filter or Turkish.",
            },
        },
        {
            title_i18n: {
                ar: "من مزارع معروفة",
                en: "From named farms",
            },
            body_i18n: {
                ar: "نكتب البلد والمزرعة والارتفاع لكل حبوب.",
                en: "We name the country, farm and altitude for every bean.",
            },
        },
    ],
    trust: [
        {
            ar: "محمصة هذا الأسبوع",
            en: "Roasted this week",
        },
        {
            ar: "الدفع عند الاستلام",
            en: "Cash on delivery",
        },
        {
            ar: "مطحنة على طلبك",
            en: "Ground to order",
        },
        {
            ar: "توصيل لكل المحافظات",
            en: "Delivery everywhere",
        },
    ],
    faq: [
        {
            q_i18n: {
                ar: "شكد تظل القهوة طازجة؟",
                en: "How long does the coffee stay fresh?",
            },
            a_i18n: {
                ar: "أحسن طعم خلال شهر من التحميص. خلي الكيس مسكر وبعيد عن الحرارة.",
                en: "Best within a month of roasting. Keep the bag sealed and away from heat.",
            },
        },
        {
            q_i18n: {
                ar: "أي طحنة أختار؟",
                en: "Which grind should I choose?",
            },
            a_i18n: {
                ar: "إسبريسو: ناعمة. فلتر: متوسطة. فرنش برس: خشنة. تركي: ناعمة جداً. إذا مو متأكد اطلب حبوب كاملة.",
                en: "Espresso: fine. Filter: medium. French press: coarse. Turkish: extra fine. Not sure? Order whole bean.",
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
                ar: "تدفع كاش للمندوب بعد ما تفتح الكيس وتتأكد منه. ما ندفع ولا دينار مقدماً.",
                en: "Pay the courier in cash after you open and check the الكيس. Nothing is paid up front.",
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
                ar: "إذا وصل المنتج غير مطابق أو فيه عيب، راسلنا خلال 3 أيام ونستبدله أو نرجع المبلغ.",
                en: "If the المنتج arrives not as described or faulty, message us within 3 days and we exchange it or refund you.",
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
            ar: "دفعة هذا الأسبوع خلصت تقريباً — باقي {count} كيس",
            en: "This week's batch is almost gone — {count} bags left",
        },
        feature_title_i18n: {
            ar: "شنو مميز بهذي الحبوب؟",
            en: "What is special about these beans?",
        },
    },
    bestsellers: {
        eyebrow_i18n: {
            ar: "الأكثر طلباً",
            en: "Most ordered",
        },
        heading_i18n: {
            ar: "أكثر حبوبنا طلباً",
            en: "Our most-ordered beans",
        },
        sub_i18n: {
            ar: "اللي يرجعون له زبائننا",
            en: "What our customers come back for",
        },
    },
    spotlights: [
        {
            slug: "single-origin",
            name_i18n: {
                ar: "أصل واحد",
                en: "Single origin",
            },
        },
        {
            slug: "blends",
            name_i18n: {
                ar: "خلطات",
                en: "Blends",
            },
        },
    ],
    collections: [
        {
            slug: "espresso",
            title_i18n: {
                ar: "للإسبريسو",
                en: "For espresso",
            },
            sub_i18n: {
                ar: "تحميص أغمق وجسم ثقيل",
                en: "Darker roast, heavy body",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "filter",
            title_i18n: {
                ar: "للفلتر",
                en: "For filter",
            },
            sub_i18n: {
                ar: "تحميص أفتح ونكهات واضحة",
                en: "Lighter roast, clear flavours",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "turkish",
            title_i18n: {
                ar: "تركي",
                en: "Turkish",
            },
            sub_i18n: {
                ar: "طحنة ناعمة جداً",
                en: "Extra-fine grind",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
    ],
    tagline_i18n: {
        ar: "قهوة محمصة طازج، توصل لبابك",
        en: "Fresh-roasted coffee, delivered to your door",
    },
    testimonials: [],
    categories: [
        {
            slug: "single-origin",
            name_i18n: {
                ar: "أصل واحد",
                en: "Single origin",
            },
        },
        {
            slug: "blends",
            name_i18n: {
                ar: "خلطات",
                en: "Blends",
            },
        },
        {
            slug: "espresso",
            name_i18n: {
                ar: "للإسبريسو",
                en: "For espresso",
            },
        },
        {
            slug: "filter",
            name_i18n: {
                ar: "للفلتر",
                en: "For filter",
            },
        },
        {
            slug: "turkish",
            name_i18n: {
                ar: "تركي",
                en: "Turkish",
            },
        },
        {
            slug: "equipment",
            name_i18n: {
                ar: "أدوات",
                en: "Equipment",
            },
        },
    ],
    attributes: [
        {
            key: "roast",
            name_i18n: {
                ar: "التحميص",
                en: "Roast",
            },
            kind: "enum",
            display_order: 1,
            options: [
                {
                    value: "light",
                    label_i18n: {
                        ar: "فاتح",
                        en: "Light",
                    },
                },
                {
                    value: "medium",
                    label_i18n: {
                        ar: "متوسط",
                        en: "Medium",
                    },
                },
                {
                    value: "dark",
                    label_i18n: {
                        ar: "غامق",
                        en: "Dark",
                    },
                },
            ],
        },
        {
            key: "origin",
            name_i18n: {
                ar: "البلد",
                en: "Origin",
            },
            kind: "enum",
            display_order: 2,
            options: [
                {
                    value: "ethiopia",
                    label_i18n: {
                        ar: "إثيوبيا",
                        en: "Ethiopia",
                    },
                },
                {
                    value: "colombia",
                    label_i18n: {
                        ar: "كولومبيا",
                        en: "Colombia",
                    },
                },
                {
                    value: "brazil",
                    label_i18n: {
                        ar: "البرازيل",
                        en: "Brazil",
                    },
                },
                {
                    value: "yemen",
                    label_i18n: {
                        ar: "اليمن",
                        en: "Yemen",
                    },
                },
                {
                    value: "kenya",
                    label_i18n: {
                        ar: "كينيا",
                        en: "Kenya",
                    },
                },
                {
                    value: "guatemala",
                    label_i18n: {
                        ar: "غواتيمالا",
                        en: "Guatemala",
                    },
                },
            ],
        },
        {
            key: "process",
            name_i18n: {
                ar: "المعالجة",
                en: "Process",
            },
            kind: "enum",
            display_order: 3,
            options: [
                {
                    value: "washed",
                    label_i18n: {
                        ar: "مغسول",
                        en: "Washed",
                    },
                },
                {
                    value: "natural",
                    label_i18n: {
                        ar: "طبيعي",
                        en: "Natural",
                    },
                },
                {
                    value: "honey",
                    label_i18n: {
                        ar: "هني",
                        en: "Honey",
                    },
                },
            ],
        },
        {
            key: "grind",
            name_i18n: {
                ar: "الطحنة",
                en: "Grind",
            },
            kind: "enum",
            display_order: 4,
            options: [
                {
                    value: "whole",
                    label_i18n: {
                        ar: "حبوب كاملة",
                        en: "Whole bean",
                    },
                },
                {
                    value: "espresso",
                    label_i18n: {
                        ar: "إسبريسو",
                        en: "Espresso",
                    },
                },
                {
                    value: "filter",
                    label_i18n: {
                        ar: "فلتر",
                        en: "Filter",
                    },
                },
                {
                    value: "french",
                    label_i18n: {
                        ar: "فرنش برس",
                        en: "French press",
                    },
                },
                {
                    value: "turkish",
                    label_i18n: {
                        ar: "تركي",
                        en: "Turkish",
                    },
                },
            ],
        },
        {
            key: "weight_g",
            name_i18n: {
                ar: "الوزن (غم)",
                en: "Weight (g)",
            },
            kind: "range",
            range_min: 100,
            range_max: 1000,
            display_order: 5,
            unit_i18n: {
                ar: "غم",
                en: "g",
            },
        },
        {
            key: "intensity",
            name_i18n: {
                ar: "القوة",
                en: "Intensity",
            },
            kind: "range",
            range_min: 1,
            range_max: 10,
            display_order: 6,
            is_comparable: true,
        },
    ],
};
