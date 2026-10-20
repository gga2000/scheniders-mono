// Food and grocery content pack — copy, starter categories and the
// attributes shoppers filter by. No invented reviews: testimonials stay
// empty until the merchant has real ones (the section then renders nothing).
import type { ContentPack } from "./types";

export const foodPack: ContentPack = {
    id: "food",
    name_i18n: {
        ar: "أكل ومؤن",
        en: "Food and grocery",
    },
    description_i18n: {
        ar: "طازج وبتاريخ واضح، يوصل بنفس اليوم داخل بغداد.",
        en: "Fresh with clear dates, same-day in Baghdad.",
    },
    match: [/food|beverage|grocery|snack|طعام|بقالة|مشروبات|أكل|مؤن/i],
    hero: {
        headline_i18n: {
            ar: "طازج، يوصل اليوم",
            en: "Fresh, delivered today",
        },
        sub_i18n: {
            ar: "مؤن وأكل مختار، تاريخ الإنتاج مكتوب على كل شي، وتوصيل بنفس اليوم داخل بغداد.",
            en: "Chosen food and groceries, production date on everything, same-day delivery inside Baghdad.",
        },
        cta_label_i18n: {
            ar: "اطلب هسة",
            en: "Order now",
        },
    },
    story: {
        title_i18n: {
            ar: "منو احنا؟",
            en: "Who we are",
        },
        body_i18n: {
            ar: "متجر أكل ومؤن عراقي. نشتري من موردين معروفين، نكتب تاريخ الإنتاج والانتهاء على كل منتج، ونوصل بنفس اليوم داخل بغداد.",
            en: "An Iraqi food and grocery store. We buy from known suppliers, list production and expiry dates on every product, and deliver same-day inside Baghdad.",
        },
    },
    about: {
        title_i18n: {
            ar: "طازج بتاريخ واضح",
            en: "Fresh with clear dates",
        },
        body_i18n: {
            ar: "تاريخ الإنتاج والانتهاء مكتوب على كل منتج، وتفحصه قبل ما تدفع.",
            en: "Production and expiry dates on every product — check them before you pay.",
        },
    },
    founder: {
        quote_i18n: {
            ar: "اللي ما نحطّه على سفرتنا ما نبيعه.",
            en: "What we would not put on our own table, we do not sell.",
        },
        role_i18n: {
            ar: "المؤسِّس",
            en: "Founder",
        },
    },
    pillars: [
        {
            title_i18n: {
                ar: "تواريخ واضحة",
                en: "Clear dates",
            },
            body_i18n: {
                ar: "تاريخ الإنتاج والانتهاء مكتوب على كل منتج قبل ما تطلب.",
                en: "Production and expiry dates on every product before you order.",
            },
        },
        {
            title_i18n: {
                ar: "يوصل اليوم",
                en: "Delivered today",
            },
            body_i18n: {
                ar: "داخل بغداد يوصل بنفس اليوم، والمحافظات خلال ١–٢ يوم.",
                en: "Same-day inside Baghdad, 1–2 days for other governorates.",
            },
        },
        {
            title_i18n: {
                ar: "تفحص قبل ما تدفع",
                en: "Check before you pay",
            },
            body_i18n: {
                ar: "تشوف الطلب بحضور المندوب. شي مو طازج؟ يرجع بنفس اللحظة.",
                en: "See the order with the courier present. Not fresh? It goes back on the spot.",
            },
        },
    ],
    trust: [
        {
            ar: "يوصل بنفس اليوم",
            en: "Same-day delivery",
        },
        {
            ar: "تواريخ واضحة",
            en: "Clear dates",
        },
        {
            ar: "الدفع عند الاستلام",
            en: "Cash on delivery",
        },
        {
            ar: "افتح وتأكد قبل ما تدفع",
            en: "Check before you pay",
        },
    ],
    faq: [
        {
            q_i18n: {
                ar: "شلون تحافظون على البرودة؟",
                en: "How do you keep things cold?",
            },
            a_i18n: {
                ar: "المبرّدات توصل بصناديق مبرّدة وبنفس اليوم داخل بغداد.",
                en: "Chilled items travel in cool boxes and arrive same-day inside Baghdad.",
            },
        },
        {
            q_i18n: {
                ar: "أكدر أطلب كميات؟",
                en: "Can I order in bulk?",
            },
            a_i18n: {
                ar: "نعم — راسلنا على واتساب بالكمية ونعطيك سعر.",
                en: "Yes — message us on WhatsApp with the quantity for a price.",
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
            ar: "بغداد بنفس اليوم، والمحافظات خلال ١–٢ يوم",
            en: "Same-day in Baghdad, 1–2 days elsewhere",
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
                ar: "تدفع كاش للمندوب بعد ما تفتح الطلب وتتأكد منه. ما تدفع ولا دينار مقدماً.",
                en: "Pay the courier in cash after you open and check the order. Nothing is paid up front.",
            },
        },
        {
            title_i18n: {
                ar: "التوصيل",
                en: "Delivery",
            },
            body_i18n: {
                ar: "داخل بغداد بنفس اليوم، والمحافظات خلال ١–٢ يوم. المبرّدات بصناديق مبرّدة.",
                en: "Same-day inside Baghdad, 1–2 days elsewhere. Chilled items in cool boxes.",
            },
        },
        {
            title_i18n: {
                ar: "الإرجاع",
                en: "Returns",
            },
            body_i18n: {
                ar: "إذا وصل شي مو طازج أو مختلف عن الطلب، ترجعه للمندوب بنفس اللحظة وما تدفع عليه.",
                en: "If anything arrives not fresh or not as ordered, hand it back to the courier on the spot and pay nothing for it.",
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
            ar: "دفعة اليوم محدودة — باقي {count}",
            en: "Today's batch is limited — {count} left",
        },
        feature_title_i18n: {
            ar: "شنو بيه؟",
            en: "What is in it?",
        },
    },
    bestsellers: {
        eyebrow_i18n: {
            ar: "الأكثر طلباً",
            en: "Most ordered",
        },
        heading_i18n: {
            ar: "أكثر منتجاتنا طلباً",
            en: "Our most-ordered products",
        },
        sub_i18n: {
            ar: "اللي يطلبونه زبائننا كل أسبوع",
            en: "What our customers order every week",
        },
    },
    spotlights: [
        {
            slug: "fresh",
            name_i18n: {
                ar: "طازج",
                en: "Fresh",
            },
        },
        {
            slug: "pantry",
            name_i18n: {
                ar: "مؤن",
                en: "Pantry",
            },
        },
    ],
    collections: [
        {
            slug: "sweets",
            title_i18n: {
                ar: "حلويات",
                en: "Sweets",
            },
            sub_i18n: {
                ar: "للضيافة والمناسبات",
                en: "For guests and occasions",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "drinks",
            title_i18n: {
                ar: "مشروبات",
                en: "Drinks",
            },
            sub_i18n: {
                ar: "عصائر وقهوة وشاي",
                en: "Juices, coffee and tea",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "snacks",
            title_i18n: {
                ar: "سناك",
                en: "Snacks",
            },
            sub_i18n: {
                ar: "للبيت والدوام",
                en: "For home and work",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
    ],
    tagline_i18n: {
        ar: "طازج بتاريخ واضح، يوصل اليوم",
        en: "Fresh with clear dates, delivered today",
    },
    testimonials: [],
    categories: [
        {
            slug: "fresh",
            name_i18n: {
                ar: "طازج",
                en: "Fresh",
            },
        },
        {
            slug: "pantry",
            name_i18n: {
                ar: "مؤن",
                en: "Pantry",
            },
        },
        {
            slug: "sweets",
            name_i18n: {
                ar: "حلويات",
                en: "Sweets",
            },
        },
        {
            slug: "drinks",
            name_i18n: {
                ar: "مشروبات",
                en: "Drinks",
            },
        },
        {
            slug: "snacks",
            name_i18n: {
                ar: "سناك",
                en: "Snacks",
            },
        },
        {
            slug: "frozen",
            name_i18n: {
                ar: "مجمّد",
                en: "Frozen",
            },
        },
    ],
    attributes: [
        {
            key: "diet",
            name_i18n: {
                ar: "الحمية",
                en: "Diet",
            },
            kind: "enum",
            display_order: 1,
            options: [
                {
                    value: "vegan",
                    label_i18n: {
                        ar: "نباتي",
                        en: "Vegan",
                    },
                },
                {
                    value: "gluten_free",
                    label_i18n: {
                        ar: "بدون غلوتين",
                        en: "Gluten-free",
                    },
                },
                {
                    value: "sugar_free",
                    label_i18n: {
                        ar: "بدون سكر",
                        en: "Sugar-free",
                    },
                },
                {
                    value: "keto",
                    label_i18n: {
                        ar: "كيتو",
                        en: "Keto",
                    },
                },
            ],
        },
        {
            key: "storage",
            name_i18n: {
                ar: "التخزين",
                en: "Storage",
            },
            kind: "enum",
            display_order: 2,
            options: [
                {
                    value: "ambient",
                    label_i18n: {
                        ar: "عادي",
                        en: "Ambient",
                    },
                },
                {
                    value: "chilled",
                    label_i18n: {
                        ar: "مبرّد",
                        en: "Chilled",
                    },
                },
                {
                    value: "frozen",
                    label_i18n: {
                        ar: "مجمّد",
                        en: "Frozen",
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
            range_min: 50,
            range_max: 5000,
            display_order: 3,
            unit_i18n: {
                ar: "غم",
                en: "g",
            },
        },
        {
            key: "shelf_days",
            name_i18n: {
                ar: "الصلاحية (يوم)",
                en: "Shelf life (days)",
            },
            kind: "range",
            range_min: 1,
            range_max: 365,
            display_order: 4,
            unit_i18n: {
                ar: "يوم",
                en: "days",
            },
        },
        {
            key: "local",
            name_i18n: {
                ar: "منتج محلي",
                en: "Locally made",
            },
            kind: "boolean",
            display_order: 5,
        },
    ],
};
