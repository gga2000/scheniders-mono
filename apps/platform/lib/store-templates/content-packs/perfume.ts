// Perfume — the niche pack a perfume merchant's store starts from: copy,
// starter categories and the attributes a perfume store filters by.
//
// It names no store and makes no promise a merchant would have to keep on
// Scheniders' behalf (no free tester, no week-long trial, no 18-hour
// delivery) and carries no customer quotes: testimonials stay empty until
// the merchant has real ones. Scheniders' own words live in
// ../scheniders-words.ts and only reach Scheniders' store.
import type { ContentPack } from "./types";

const SLA = {
    ar: "بغداد خلال يوم، وبقية المحافظات خلال ١–٣ أيام",
    en: "Baghdad within a day, other governorates in 1–3 days",
};

export const perfumePack: ContentPack = {
    id: "perfume",
    name_i18n: { ar: "عطور", en: "Perfume" },
    description_i18n: {
        ar: "عطور أصلية مختومة، تفتحها وتتأكد منها قبل ما تدفع.",
        en: "Authentic, sealed perfumes you open and check before you pay.",
    },
    match: [/perfume|fragrance|scent|عطر|عطور/i],

    hero: {
        headline_i18n: { ar: "يا هلا ومرحبا!", en: "Welcome!" },
        sub_i18n: {
            ar: "مستعد تجرب روائح عطرية من افخم الماركات العالمية؟",
            en: "Ready to try fragrances from the world's finest houses?",
        },
        cta_label_i18n: { ar: "مجموعتنا", en: "Our collection" },
    },
    story: {
        title_i18n: { ar: "قصتنا", en: "Our story" },
        body_i18n: {
            ar: "متجر عطور عراقي، نختار عطورنا بأنفسنا ونجرّبها قبل ما نعرضها. كل عطر أصلي ومختوم، الدفع عند الاستلام، والتوصيل لكل المحافظات.",
            en: "An Iraqi perfume store. We choose our perfumes ourselves and wear them before we list them. Every bottle is authentic and sealed, cash on delivery, to every governorate.",
        },
    },
    about: {
        title_i18n: { ar: "منو احنا", en: "Who we are" },
        body_i18n: {
            ar: "متجر عطور عراقي. نختار عطورنا بأنفسنا ونجرّب كل عطر قبل ما نعرضه. كل قنينة أصلية ومختومة، تفتحها وتتأكد منها بحضور المندوب قبل ما تدفع، والتوصيل لكل المحافظات.",
            en: "An Iraqi perfume store. We choose our perfumes ourselves and wear-test each one before we list it. Every bottle is authentic and sealed; you open and check it with the courier present before you pay. Delivery to every governorate.",
        },
    },
    founder: {
        quote_i18n: {
            ar: "نجرّب كل عطر بأنفسنا — العطر اللي ما يثبت طول اليوم ما ينعرض عدنا.",
            en: "We wear-test every perfume ourselves — a scent that fades through the day never makes our shelf.",
        },
        role_i18n: { ar: "المؤسِّس", en: "Founder" },
    },
    pillars: [
        {
            title_i18n: { ar: "عطور أصلية", en: "Authentic perfumes" },
            body_i18n: {
                ar: "كل عطر أصلي ومختوم، وتتأكد من الختم بحضور المندوب قبل ما تدفع.",
                en: "Every perfume is authentic and sealed; you check the seal with the courier present before you pay.",
            },
        },
        {
            title_i18n: { ar: "سعر عادل", en: "Fair price" },
            body_i18n: {
                ar: "أسعار واضحة بدون رسوم مخفية، وأجرة التوصيل تنعرض قبل ما تأكد.",
                en: "Clear prices with no hidden fees; the delivery fee shows before you confirm.",
            },
        },
        {
            title_i18n: { ar: "ثبات وفوحان", en: "Longevity and sillage" },
            body_i18n: {
                ar: "نكتب الثبات والفوحان لكل عطر حتى تعرف شنو تشتري قبل ما تطلب.",
                en: "We list each perfume's longevity and sillage so you know what you are buying before you order.",
            },
        },
    ],
    trust: [
        { ar: "عطور أصلية", en: "Authentic perfumes" },
        { ar: "توصيل لكل المحافظات", en: "Delivery to every governorate" },
        { ar: "افتح وتأكد قبل ما تدفع", en: "Check before you pay" },
        { ar: "الدفع عند الاستلام", en: "Cash on delivery" },
    ],
    faq: [
        {
            q_i18n: { ar: "أكدر أدفع عند الاستلام؟", en: "Can I pay on delivery?" },
            a_i18n: {
                ar: "نعم — تدفع كاش للمندوب بعد ما تفتح الطلب وتتأكد من العطر والختم.",
                en: "Yes — you pay the courier in cash after opening the order and checking the perfume and its seal.",
            },
        },
        {
            q_i18n: { ar: "شكد يطول التوصيل؟", en: "How long does delivery take?" },
            a_i18n: { ar: SLA.ar, en: SLA.en },
        },
        {
            q_i18n: { ar: "العطور أصلية؟", en: "Are the perfumes authentic?" },
            a_i18n: {
                ar: "كل عطر أصلي ويوصلك مختوم. إذا الختم مفتوح أو العطر مو مثل الوصف، ترجعه للمندوب وما تدفع.",
                en: "Every perfume is authentic and arrives sealed. If the seal is broken or it isn't as described, hand it back to the courier and pay nothing.",
            },
        },
    ],
    faq_orders: [
        {
            q_i18n: { ar: "كيف ألغي طلبي؟", en: "How do I cancel an order?" },
            a_i18n: {
                ar: "تكدر تلغي خلال أول ١٢ ساعة من الطلب عبر واتساب. بعدها الطلب غالباً انشحن.",
                en: "You can cancel within the first 12 hours over WhatsApp. After that the order has usually shipped.",
            },
        },
        {
            q_i18n: { ar: "متى يوصل طلبي؟", en: "When will my order arrive?" },
            a_i18n: {
                ar: "بغداد عادة خلال يوم، وبقية المحافظات خلال ١–٣ أيام من تثبيت الطلب.",
                en: "Baghdad usually within a day; other governorates within 1–3 days of confirmation.",
            },
        },
        {
            q_i18n: { ar: "شلون أتابع طلبي؟", en: "How do I track my order?" },
            a_i18n: {
                ar: "من صفحة تتبع الطلب برقم هاتفك ورقم الطلب، أو راسلنا على واتساب.",
                en: "From the order-tracking page with your phone and order number, or message us on WhatsApp.",
            },
        },
    ],
    delivery: {
        sla_i18n: SLA,
        inspection_i18n: {
            ar: "افتح الطلب وتأكد من العطر والختم قبل ما تدفع",
            en: "Open your order and check the perfume and its seal before you pay",
        },
        reassurance_i18n: {
            ar: "تفتح وتتأكد قبل ما تدفع — الدفع عند الاستلام",
            en: "Open and check before you pay — cash on delivery",
        },
    },
    pdp_policies: [
        {
            title_i18n: { ar: "الدفع عند الاستلام", en: "Cash on delivery" },
            body_i18n: {
                ar: "تدفع كاش للمندوب بعد ما تفتح الطلب وتتأكد من العطر والختم. ما تدفع ولا دينار مقدماً.",
                en: "Pay the courier in cash after you open the order and check the perfume and its seal. Nothing is paid up front.",
            },
        },
        {
            title_i18n: { ar: "التوصيل", en: "Delivery" },
            body_i18n: {
                ar: "بغداد خلال يوم، وبقية المحافظات خلال ١–٣ أيام من تثبيت الطلب. أجرة التوصيل تنعرض قبل ما تأكد.",
                en: "Baghdad within a day, other governorates in 1–3 days of confirmation. The delivery fee shows before you confirm.",
            },
        },
        {
            title_i18n: { ar: "الاستبدال والإرجاع", en: "Exchange and returns" },
            body_i18n: {
                ar: "إذا وصل العطر غير مطابق أو مفتوح الختم، راسلنا خلال 3 أيام ونستبدله أو نرجع المبلغ.",
                en: "If the perfume arrives not as described or with a broken seal, message us within 3 days and we exchange it or refund you.",
            },
        },
        {
            title_i18n: { ar: "خدمة الزبائن", en: "Customer care" },
            body_i18n: {
                ar: "راسلنا على واتساب بأي وقت — نرد بسرعة ونتابع طلبك لحد ما يوصل.",
                en: "Message us on WhatsApp any time — we answer fast and follow your order until it arrives.",
            },
        },
    ],
    pdp: {
        urgency_i18n: {
            ar: "هذا العطر عليه طلب كبير — باقي {count} قطع فقط",
            en: "This perfume is in high demand — only {count} left",
        },
        feature_title_i18n: { ar: "شنو يميز هذا العطر؟", en: "What makes this scent special?" },
    },
    bestsellers: {
        eyebrow_i18n: { ar: "الأكثر مبيعاً", en: "Best sellers" },
        heading_i18n: { ar: "أكثر العطور مبيعاً", en: "Our best-selling perfumes" },
        sub_i18n: {
            ar: "العطور اللي حبوها زبائننا أكثر شي",
            en: "The perfumes our customers loved most",
        },
    },
    spotlights: [
        { slug: "picked", name_i18n: { ar: "عطور مختارة", en: "Curated perfumes" } },
        { slug: "topsellers", name_i18n: { ar: "الاكثر مبيعاً", en: "Best sellers" } },
    ],
    collections: [
        {
            slug: "work",
            title_i18n: { ar: "عطور للدوام", en: "Perfumes for work" },
            sub_i18n: { ar: "توازن يجنن بين الرسمية والشياكة", en: "A stunning balance of formality and style" },
            cta_label_i18n: { ar: "شوفهم", en: "See them" },
        },
        {
            slug: "outings",
            title_i18n: { ar: "عطور للطلعات", en: "Perfumes for outings" },
            sub_i18n: { ar: "الجمع بين الفخامة والراحة", en: "Luxury and comfort combined" },
            cta_label_i18n: { ar: "تعال نوريك", en: "Come see" },
        },
        {
            slug: "occasions",
            title_i18n: { ar: "عطور للمناسبات", en: "Perfumes for occasions" },
            sub_i18n: { ar: "للمناسبات الخاصة", en: "For special occasions" },
            cta_label_i18n: { ar: "تألق هسة", en: "Shine now" },
        },
    ],
    tagline_i18n: {
        ar: "عطور أصلية بأسعار عادلة",
        en: "Authentic perfumes at fair prices",
    },
    testimonials: [],
    categories: [
        { slug: "picked", name_i18n: { ar: "عطور مختارة", en: "Curated perfumes" } },
        { slug: "topsellers", name_i18n: { ar: "الاكثر مبيعاً", en: "Best sellers" } },
        { slug: "work", name_i18n: { ar: "عطور للدوام", en: "Perfumes for work" } },
        { slug: "outings", name_i18n: { ar: "عطور للطلعات", en: "Perfumes for outings" } },
        { slug: "occasions", name_i18n: { ar: "عطور للمناسبات", en: "Perfumes for occasions" } },
    ],
    attributes: [
        {
            key: "scent_family", name_i18n: { ar: "العائلة العطرية", en: "Scent family" }, kind: "enum", display_order: 1,
            options: [
                { value: "woody", label_i18n: { ar: "خشبي", en: "Woody" } },
                { value: "oriental", label_i18n: { ar: "شرقي", en: "Oriental" } },
                { value: "floral", label_i18n: { ar: "زهري", en: "Floral" } },
                { value: "fresh", label_i18n: { ar: "منعش", en: "Fresh" } },
                { value: "citrus", label_i18n: { ar: "حمضي", en: "Citrus" } },
                { value: "sweet", label_i18n: { ar: "حلو", en: "Sweet" } },
            ],
        },
        {
            key: "gender", name_i18n: { ar: "لمن", en: "For" }, kind: "enum", display_order: 2,
            options: [
                { value: "men", label_i18n: { ar: "رجالي", en: "Men" } },
                { value: "women", label_i18n: { ar: "نسائي", en: "Women" } },
                { value: "unisex", label_i18n: { ar: "للجنسين", en: "Unisex" } },
            ],
        },
        {
            key: "occasion", name_i18n: { ar: "المناسبة", en: "Occasion" }, kind: "enum", display_order: 3,
            options: [
                { value: "day", label_i18n: { ar: "نهاري", en: "Day" } },
                { value: "night", label_i18n: { ar: "ليلي", en: "Night" } },
                { value: "work", label_i18n: { ar: "دوام", en: "Work" } },
                { value: "occasions", label_i18n: { ar: "مناسبات", en: "Occasions" } },
            ],
        },
        { key: "longevity", name_i18n: { ar: "الثبات", en: "Longevity" }, kind: "range", range_min: 0, range_max: 10, is_comparable: true, display_order: 4 },
        { key: "sillage", name_i18n: { ar: "الفوحان", en: "Sillage" }, kind: "range", range_min: 0, range_max: 10, is_comparable: true, display_order: 5 },
        {
            key: "notes", name_i18n: { ar: "المكوّنات", en: "Notes" }, kind: "group_list", is_filterable: false, display_order: 6,
            group_keys: [
                { key: "top", label_i18n: { ar: "المقدمة", en: "Top" } },
                { key: "heart", label_i18n: { ar: "القلب", en: "Heart" } },
                { key: "base", label_i18n: { ar: "القاعدة", en: "Base" } },
            ],
        },
        { key: "size_ml", name_i18n: { ar: "الحجم (مل)", en: "Size (ml)" }, kind: "range", range_min: 5, range_max: 200, unit_i18n: { ar: "مل", en: "ml" }, display_order: 7 },
    ],
};
