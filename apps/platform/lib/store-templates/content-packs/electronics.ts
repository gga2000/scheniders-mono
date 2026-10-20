// Electronics content pack — copy, starter categories and the
// attributes shoppers filter by. No invented reviews: testimonials stay
// empty until the merchant has real ones (the section then renders nothing).
import type { ContentPack } from "./types";

export const electronicsPack: ContentPack = {
    id: "electronics",
    name_i18n: {
        ar: "إلكترونيات",
        en: "Electronics",
    },
    description_i18n: {
        ar: "أجهزة أصلية بضمان، تفحصها قبل ما تدفع.",
        en: "Original devices with warranty, checked before you pay.",
    },
    match: [/electronic|gadget|phone|tech|إلكترون|أجهزة|موبايل/i],
    hero: {
        headline_i18n: {
            ar: "أجهزة أصلية، بضمان",
            en: "Original devices, with warranty",
        },
        sub_i18n: {
            ar: "تشغّل الجهاز وتفحصه بحضور المندوب، وتدفع بعدها. الضمان مكتوب على كل منتج.",
            en: "Power the device on and check it with the courier present, then pay. The warranty is written on every product.",
        },
        cta_label_i18n: {
            ar: "شوف الأجهزة",
            en: "See the devices",
        },
    },
    story: {
        title_i18n: {
            ar: "منو احنا؟",
            en: "Who we are",
        },
        body_i18n: {
            ar: "متجر إلكترونيات عراقي. كل جهاز أصلي، مختوم، وعليه ضمان مكتوب، وتفحصه قبل ما تدفع.",
            en: "An Iraqi electronics store. Every device is original, sealed, carries a written warranty, and you check it before you pay.",
        },
    },
    about: {
        title_i18n: {
            ar: "أصلي وبضمان",
            en: "Original with warranty",
        },
        body_i18n: {
            ar: "كل جهاز مختوم وعليه ضمان مكتوب، وتشغّله وتفحصه قبل ما تدفع.",
            en: "Every device is sealed with a written warranty; power it on and check it before you pay.",
        },
    },
    founder: {
        quote_i18n: {
            ar: "جهاز بدون ضمان مكتوب ما يدخل المتجر.",
            en: "A device without a written warranty does not go in the store.",
        },
        role_i18n: {
            ar: "المؤسِّس",
            en: "Founder",
        },
    },
    pillars: [
        {
            title_i18n: {
                ar: "تشغّل وتفحص قبل ما تدفع",
                en: "Test before you pay",
            },
            body_i18n: {
                ar: "تفتح الكرتون وتشغّل الجهاز بحضور المندوب. فيه شي؟ ترجعه بنفس اللحظة.",
                en: "Open the box and power the device on with the courier present. Anything wrong? Hand it back on the spot.",
            },
        },
        {
            title_i18n: {
                ar: "ضمان مكتوب",
                en: "Written warranty",
            },
            body_i18n: {
                ar: "مدة الضمان ومن يغطّيه مكتوبة على كل منتج قبل ما تطلب.",
                en: "The warranty period and who covers it are written on every product before you order.",
            },
        },
        {
            title_i18n: {
                ar: "مواصفات كاملة",
                en: "Full specifications",
            },
            body_i18n: {
                ar: "الذاكرة والشاشة والبطارية والمعالج مكتوبة لكل جهاز حتى تقارن.",
                en: "Memory, screen, battery and processor listed for every device so you can compare.",
            },
        },
    ],
    trust: [
        {
            ar: "أصلي ومختوم",
            en: "Original and sealed",
        },
        {
            ar: "ضمان مكتوب",
            en: "Written warranty",
        },
        {
            ar: "تفحص قبل ما تدفع",
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
                ar: "شنو الضمان؟",
                en: "What is the warranty?",
            },
            a_i18n: {
                ar: "مكتوب على كل منتج: المدة والجهة اللي تغطّيه. الأعطال المصنعية مشمولة، الكسر والماء لا.",
                en: "Written on every product: the period and who covers it. Manufacturing faults are covered; breakage and water are not.",
            },
        },
        {
            q_i18n: {
                ar: "الجهاز مفعّل مسبقاً؟",
                en: "Is the device pre-activated?",
            },
            a_i18n: {
                ar: "لا — كل جهاز مختوم وتفتحه بنفسك بحضور المندوب.",
                en: "No — every device is sealed and you open it yourself with the courier present.",
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
            ar: "تشغّله وتفحصه عند المندوب — تدفع بعدها",
            en: "Power it on and check it with the courier — pay after",
        },
    },
    pdp_policies: [
        {
            title_i18n: {
                ar: "الدفع عند الاستلام",
                en: "Cash on delivery",
            },
            body_i18n: {
                ar: "تدفع كاش للمندوب بعد ما تفتح الجهاز وتتأكد منه. ما ندفع ولا دينار مقدماً.",
                en: "Pay the courier in cash after you open and check the الجهاز. Nothing is paid up front.",
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
                ar: "الضمان والإرجاع",
                en: "Warranty and returns",
            },
            body_i18n: {
                ar: "عيب مصنعي خلال فترة الضمان: نستبدل أو نصلّح. الكسر والماء والاستخدام الخاطئ غير مشمولة.",
                en: "Manufacturing faults within the warranty: we replace or repair. Breakage, water and misuse are not covered.",
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
            ar: "الكمية محدودة — باقي {count} قطع",
            en: "Limited stock — {count} left",
        },
        feature_title_i18n: {
            ar: "المواصفات",
            en: "Specifications",
        },
    },
    bestsellers: {
        eyebrow_i18n: {
            ar: "الأكثر مبيعاً",
            en: "Best sellers",
        },
        heading_i18n: {
            ar: "أكثر أجهزتنا مبيعاً",
            en: "Our best-selling devices",
        },
        sub_i18n: {
            ar: "اللي اختاره زبائننا أكثر شي",
            en: "What our customers chose most",
        },
    },
    spotlights: [
        {
            slug: "phones",
            name_i18n: {
                ar: "موبايلات",
                en: "Phones",
            },
        },
        {
            slug: "audio",
            name_i18n: {
                ar: "سماعات وصوت",
                en: "Audio",
            },
        },
    ],
    collections: [
        {
            slug: "accessories",
            title_i18n: {
                ar: "إكسسوارات",
                en: "Accessories",
            },
            sub_i18n: {
                ar: "أغطية وشواحن وكيبلات",
                en: "Cases, chargers and cables",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "smart-home",
            title_i18n: {
                ar: "البيت الذكي",
                en: "Smart home",
            },
            sub_i18n: {
                ar: "إضاءة وكاميرات ومقابس",
                en: "Lights, cameras and plugs",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "laptops",
            title_i18n: {
                ar: "لابتوبات",
                en: "Laptops",
            },
            sub_i18n: {
                ar: "للدراسة والشغل",
                en: "For study and work",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
    ],
    tagline_i18n: {
        ar: "أجهزة أصلية بضمان، تفحصها قبل ما تدفع",
        en: "Original devices with warranty, checked before you pay",
    },
    testimonials: [],
    categories: [
        {
            slug: "phones",
            name_i18n: {
                ar: "موبايلات",
                en: "Phones",
            },
        },
        {
            slug: "audio",
            name_i18n: {
                ar: "سماعات وصوت",
                en: "Audio",
            },
        },
        {
            slug: "accessories",
            name_i18n: {
                ar: "إكسسوارات",
                en: "Accessories",
            },
        },
        {
            slug: "smart-home",
            name_i18n: {
                ar: "البيت الذكي",
                en: "Smart home",
            },
        },
        {
            slug: "laptops",
            name_i18n: {
                ar: "لابتوبات",
                en: "Laptops",
            },
        },
        {
            slug: "wearables",
            name_i18n: {
                ar: "ساعات ذكية",
                en: "Wearables",
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
                    value: "apple",
                    label_i18n: {
                        ar: "Apple",
                        en: "Apple",
                    },
                },
                {
                    value: "samsung",
                    label_i18n: {
                        ar: "Samsung",
                        en: "Samsung",
                    },
                },
                {
                    value: "xiaomi",
                    label_i18n: {
                        ar: "Xiaomi",
                        en: "Xiaomi",
                    },
                },
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
            key: "storage",
            name_i18n: {
                ar: "الذاكرة",
                en: "Storage",
            },
            kind: "enum",
            display_order: 2,
            options: [
                {
                    value: "64",
                    label_i18n: {
                        ar: "64 GB",
                        en: "64 GB",
                    },
                },
                {
                    value: "128",
                    label_i18n: {
                        ar: "128 GB",
                        en: "128 GB",
                    },
                },
                {
                    value: "256",
                    label_i18n: {
                        ar: "256 GB",
                        en: "256 GB",
                    },
                },
                {
                    value: "512",
                    label_i18n: {
                        ar: "512 GB",
                        en: "512 GB",
                    },
                },
                {
                    value: "1tb",
                    label_i18n: {
                        ar: "1 TB",
                        en: "1 TB",
                    },
                },
            ],
        },
        {
            key: "condition",
            name_i18n: {
                ar: "الحالة",
                en: "Condition",
            },
            kind: "enum",
            display_order: 3,
            options: [
                {
                    value: "new",
                    label_i18n: {
                        ar: "جديد مختوم",
                        en: "New, sealed",
                    },
                },
                {
                    value: "open_box",
                    label_i18n: {
                        ar: "مفتوح الكرتون",
                        en: "Open box",
                    },
                },
                {
                    value: "used",
                    label_i18n: {
                        ar: "مستعمل",
                        en: "Used",
                    },
                },
            ],
        },
        {
            key: "warranty_months",
            name_i18n: {
                ar: "الضمان (شهر)",
                en: "Warranty (months)",
            },
            kind: "range",
            range_min: 0,
            range_max: 36,
            display_order: 4,
            unit_i18n: {
                ar: "شهر",
                en: "months",
            },
            is_comparable: true,
        },
        {
            key: "battery_mah",
            name_i18n: {
                ar: "البطارية (مللي أمبير)",
                en: "Battery (mAh)",
            },
            kind: "range",
            range_min: 1000,
            range_max: 10000,
            display_order: 5,
            unit_i18n: {
                ar: "mAh",
                en: "mAh",
            },
            is_comparable: true,
        },
        {
            key: "screen_in",
            name_i18n: {
                ar: "الشاشة (إنش)",
                en: "Screen (in)",
            },
            kind: "range",
            range_min: 4,
            range_max: 20,
            display_order: 6,
            unit_i18n: {
                ar: "إنش",
                en: "in",
            },
            is_comparable: true,
        },
    ],
};
