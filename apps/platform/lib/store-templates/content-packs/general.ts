// General store content pack — copy, starter categories and the
// attributes shoppers filter by. No invented reviews: testimonials stay
// empty until the merchant has real ones (the section then renders nothing).
import type { ContentPack } from "./types";

export const generalPack: ContentPack = {
    id: "general",
    name_i18n: {
        ar: "متجر عام",
        en: "General store",
    },
    description_i18n: {
        ar: "نسخة محايدة تناسب أي منتج.",
        en: "A neutral version that fits any product.",
    },
    match: [],
    hero: {
        headline_i18n: {
            ar: "يا هلا بيك!",
            en: "Welcome!",
        },
        sub_i18n: {
            ar: "منتجات مختارة بعناية، توصل لباب بيتك وتدفع لما تستلم.",
            en: "Carefully chosen products, delivered to your door, paid when they arrive.",
        },
        cta_label_i18n: {
            ar: "تصفح المنتجات",
            en: "Browse products",
        },
    },
    story: {
        title_i18n: {
            ar: "منو احنا؟",
            en: "Who we are",
        },
        body_i18n: {
            ar: "متجر عراقي نختار منتجاتنا بأنفسنا ونفحص كل طلب قبل ما يطلع. الدفع عند الاستلام، والتوصيل لكل المحافظات.",
            en: "An Iraqi store that picks its own products and checks every order before it leaves. Cash on delivery, to every governorate.",
        },
    },
    about: {
        title_i18n: {
            ar: "منو احنا",
            en: "Who we are",
        },
        body_i18n: {
            ar: "نختار منتجاتنا بأنفسنا ونفحص كل طلب قبل ما يطلع. تفتح وتتأكد قبل ما تدفع.",
            en: "We pick our products ourselves and check every order before it leaves. Open and check before you pay.",
        },
    },
    founder: {
        quote_i18n: {
            ar: "ما نبيع شي ما نشتريه لأهل بيتنا.",
            en: "We sell nothing we would not buy for our own family.",
        },
        role_i18n: {
            ar: "المؤسِّس",
            en: "Founder",
        },
    },
    pillars: [
        {
            title_i18n: {
                ar: "جودة مفحوصة",
                en: "Checked quality",
            },
            body_i18n: {
                ar: "كل قطعة تنفحص قبل الشحن حتى يوصلك بالضبط اللي شفته.",
                en: "Every piece is checked before shipping so what arrives is what you saw.",
            },
        },
        {
            title_i18n: {
                ar: "سعر عادل",
                en: "Fair price",
            },
            body_i18n: {
                ar: "أسعار واضحة بدون رسوم مخفية، وأجرة التوصيل تنعرض قبل ما تأكد.",
                en: "Clear prices with no hidden fees; the delivery fee shows before you confirm.",
            },
        },
        {
            title_i18n: {
                ar: "نتابع وياك",
                en: "We follow up",
            },
            body_i18n: {
                ar: "من الطلب لحد الاستلام، فريقنا يرد عليك على واتساب.",
                en: "From order to delivery, our team answers you on WhatsApp.",
            },
        },
    ],
    trust: [
        {
            ar: "توصيل لكل المحافظات",
            en: "Delivery to every governorate",
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
            ar: "رد سريع على واتساب",
            en: "Fast WhatsApp replies",
        },
    ],
    faq: [
        {
            q_i18n: {
                ar: "شكد يطول التوصيل؟",
                en: "How long does delivery take?",
            },
            a_i18n: {
                ar: "بغداد خلال يوم، وبقية المحافظات خلال ١–٣ أيام",
                en: "Baghdad within a day, other governorates in 1–3 days",
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
                ar: "تدفع كاش للمندوب بعد ما تفتح الطلب وتتأكد منه. ما ندفع ولا دينار مقدماً.",
                en: "Pay the courier in cash after you open and check the الطلب. Nothing is paid up front.",
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
            ar: "عليه طلب كبير — باقي {count} فقط",
            en: "In high demand — only {count} left",
        },
        feature_title_i18n: {
            ar: "شنو يميز هذا المنتج؟",
            en: "What makes this product special?",
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
            ar: "اللي حبوه زبائننا أكثر شي",
            en: "What our customers loved most",
        },
    },
    spotlights: [
        {
            slug: "new",
            name_i18n: {
                ar: "وصل حديثاً",
                en: "New arrivals",
            },
        },
        {
            slug: "bestsellers",
            name_i18n: {
                ar: "الأكثر مبيعاً",
                en: "Best sellers",
            },
        },
    ],
    collections: [
        {
            slug: "offers",
            title_i18n: {
                ar: "عروض",
                en: "Offers",
            },
            sub_i18n: {
                ar: "أسعار أقل لفترة محدودة",
                en: "Lower prices for a limited time",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "gifts",
            title_i18n: {
                ar: "هدايا",
                en: "Gifts",
            },
            sub_i18n: {
                ar: "اختيارات تفرّح",
                en: "Picks that delight",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "essentials",
            title_i18n: {
                ar: "أساسيات",
                en: "Essentials",
            },
            sub_i18n: {
                ar: "اللي تحتاجه كل يوم",
                en: "What you need every day",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
    ],
    tagline_i18n: {
        ar: "منتجات مختارة، تدفع لما تستلم",
        en: "Chosen products, paid on delivery",
    },
    testimonials: [],
    categories: [
        {
            slug: "new",
            name_i18n: {
                ar: "وصل حديثاً",
                en: "New arrivals",
            },
        },
        {
            slug: "bestsellers",
            name_i18n: {
                ar: "الأكثر مبيعاً",
                en: "Best sellers",
            },
        },
        {
            slug: "offers",
            name_i18n: {
                ar: "عروض",
                en: "Offers",
            },
        },
        {
            slug: "gifts",
            name_i18n: {
                ar: "هدايا",
                en: "Gifts",
            },
        },
        {
            slug: "essentials",
            name_i18n: {
                ar: "أساسيات",
                en: "Essentials",
            },
        },
    ],
    attributes: [
        {
            key: "brand",
            name_i18n: {
                ar: "الماركة",
                en: "Brand",
            },
            kind: "enum",
            display_order: 1,
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
            key: "original",
            name_i18n: {
                ar: "أصلي",
                en: "Original",
            },
            kind: "boolean",
            display_order: 2,
        },
    ],
};
