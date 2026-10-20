// Fashion content pack — copy, starter categories and the
// attributes shoppers filter by. No invented reviews: testimonials stay
// empty until the merchant has real ones (the section then renders nothing).
import type { ContentPack } from "./types";

export const fashionPack: ContentPack = {
    id: "fashion",
    name_i18n: {
        ar: "أزياء",
        en: "Fashion",
    },
    description_i18n: {
        ar: "ملابس ومقاسات واضحة، تجرّب قبل ما تدفع.",
        en: "Clothing with clear sizes, try before you pay.",
    },
    match: [/fashion|apparel|cloth|wear|أزياء|ملابس/i],
    hero: {
        headline_i18n: {
            ar: "لبس يشبهك",
            en: "Clothes that look like you",
        },
        sub_i18n: {
            ar: "قطع مختارة بمقاسات واضحة، تجرّبها عند المندوب وتدفع إذا عجبتك.",
            en: "Chosen pieces with clear sizing — try them with the courier and pay only if they fit.",
        },
        cta_label_i18n: {
            ar: "شوف الجديد",
            en: "See what's new",
        },
    },
    story: {
        title_i18n: {
            ar: "منو احنا؟",
            en: "Who we are",
        },
        body_i18n: {
            ar: "متجر ملابس عراقي. نصوّر كل قطعة بأنفسنا ونكتب مقاساتها بالسنتيمتر حتى توصلك مثل ما توقعتها.",
            en: "An Iraqi clothing store. We photograph every piece ourselves and list its measurements in centimetres so it arrives as you expected.",
        },
    },
    about: {
        title_i18n: {
            ar: "مقاسات صادقة",
            en: "Honest sizing",
        },
        body_i18n: {
            ar: "نكتب الطول والعرض بالسنتيمتر لكل قطعة، وتجرّبها قبل ما تدفع.",
            en: "We list length and width in centimetres for every piece, and you try it before you pay.",
        },
    },
    founder: {
        quote_i18n: {
            ar: "إذا المقاس مو مضبوط، ما تدفع. بهذي البساطة.",
            en: "If the size is not right, you do not pay. That simple.",
        },
        role_i18n: {
            ar: "المؤسِّس",
            en: "Founder",
        },
    },
    pillars: [
        {
            title_i18n: {
                ar: "تجرّب قبل ما تدفع",
                en: "Try before you pay",
            },
            body_i18n: {
                ar: "تفتح الطلب وتجرّب القطعة بحضور المندوب. ما عجبتك؟ ترجعها بنفس اللحظة.",
                en: "Open the order and try the piece with the courier present. Not right? Hand it back on the spot.",
            },
        },
        {
            title_i18n: {
                ar: "مقاسات بالسنتيمتر",
                en: "Sizes in centimetres",
            },
            body_i18n: {
                ar: "كل قطعة عليها جدول مقاسات مقاس بأيدينا، مو رقم عام.",
                en: "Every piece has a size chart we measured ourselves, not a generic number.",
            },
        },
        {
            title_i18n: {
                ar: "خامة مثل الصورة",
                en: "Fabric as pictured",
            },
            body_i18n: {
                ar: "نصوّر القطعة الحقيقية بضوء طبيعي — اللي تشوفه هو اللي يوصلك.",
                en: "We photograph the real piece in daylight — what you see is what arrives.",
            },
        },
    ],
    trust: [
        {
            ar: "تجرّب قبل ما تدفع",
            en: "Try before you pay",
        },
        {
            ar: "مقاسات بالسنتيمتر",
            en: "Sizes in cm",
        },
        {
            ar: "الدفع عند الاستلام",
            en: "Cash on delivery",
        },
        {
            ar: "توصيل لكل المحافظات",
            en: "Delivery everywhere",
        },
    ],
    faq: [
        {
            q_i18n: {
                ar: "شلون أختار المقاس؟",
                en: "How do I choose my size?",
            },
            a_i18n: {
                ar: "كل قطعة عليها جدول بالسنتيمتر. قيس قطعة عندك تناسبك وقارن.",
                en: "Every piece has a chart in centimetres. Measure a piece you own that fits and compare.",
            },
        },
        {
            q_i18n: {
                ar: "أكدر أبدّل المقاس؟",
                en: "Can I exchange the size?",
            },
            a_i18n: {
                ar: "نعم خلال ٣ أيام إذا القطعة بحالتها، والمندوب يجيب البديل.",
                en: "Yes, within 3 days if the piece is unworn — the courier brings the replacement.",
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
            ar: "تجرّبها عند المندوب — تدفع إذا عجبتك",
            en: "Try it with the courier — pay only if you like it",
        },
    },
    pdp_policies: [
        {
            title_i18n: {
                ar: "الدفع عند الاستلام",
                en: "Cash on delivery",
            },
            body_i18n: {
                ar: "تدفع كاش للمندوب بعد ما تفتح القطعة وتتأكد منه. ما ندفع ولا دينار مقدماً.",
                en: "Pay the courier in cash after you open and check the القطعة. Nothing is paid up front.",
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
                ar: "إذا وصل القطعة غير مطابق أو فيه عيب، راسلنا خلال 3 أيام ونستبدله أو نرجع المبلغ.",
                en: "If the القطعة arrives not as described or faulty, message us within 3 days and we exchange it or refund you.",
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
            ar: "مقاسات محدودة — باقي {count} قطع",
            en: "Limited sizes — {count} pieces left",
        },
        feature_title_i18n: {
            ar: "تفاصيل القطعة",
            en: "About this piece",
        },
    },
    bestsellers: {
        eyebrow_i18n: {
            ar: "الأكثر مبيعاً",
            en: "Best sellers",
        },
        heading_i18n: {
            ar: "أكثر القطع مبيعاً",
            en: "Our best-selling pieces",
        },
        sub_i18n: {
            ar: "اللي طلبوه زبائننا أكثر شي",
            en: "What our customers ordered most",
        },
    },
    spotlights: [
        {
            slug: "women",
            name_i18n: {
                ar: "نسائي",
                en: "Women",
            },
        },
        {
            slug: "men",
            name_i18n: {
                ar: "رجالي",
                en: "Men",
            },
        },
    ],
    collections: [
        {
            slug: "new",
            title_i18n: {
                ar: "وصل حديثاً",
                en: "New arrivals",
            },
            sub_i18n: {
                ar: "آخر القطع اللي وصلت",
                en: "The latest pieces in",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "occasion",
            title_i18n: {
                ar: "للمناسبات",
                en: "For occasions",
            },
            sub_i18n: {
                ar: "لبس يليق بالمناسبة",
                en: "Dressed for the occasion",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "everyday",
            title_i18n: {
                ar: "لكل يوم",
                en: "Everyday",
            },
            sub_i18n: {
                ar: "مريح وأنيق",
                en: "Comfortable and neat",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
    ],
    tagline_i18n: {
        ar: "لبس يشبهك، تجرّبه قبل ما تدفع",
        en: "Clothes that look like you, tried before you pay",
    },
    testimonials: [],
    categories: [
        {
            slug: "women",
            name_i18n: {
                ar: "نسائي",
                en: "Women",
            },
        },
        {
            slug: "men",
            name_i18n: {
                ar: "رجالي",
                en: "Men",
            },
        },
        {
            slug: "new",
            name_i18n: {
                ar: "وصل حديثاً",
                en: "New arrivals",
            },
        },
        {
            slug: "occasion",
            name_i18n: {
                ar: "للمناسبات",
                en: "For occasions",
            },
        },
        {
            slug: "everyday",
            name_i18n: {
                ar: "لكل يوم",
                en: "Everyday",
            },
        },
        {
            slug: "accessories",
            name_i18n: {
                ar: "إكسسوارات",
                en: "Accessories",
            },
        },
    ],
    attributes: [
        {
            key: "size",
            name_i18n: {
                ar: "المقاس",
                en: "Size",
            },
            kind: "enum",
            display_order: 1,
            options: [
                {
                    value: "xs",
                    label_i18n: {
                        ar: "XS",
                        en: "XS",
                    },
                },
                {
                    value: "s",
                    label_i18n: {
                        ar: "S",
                        en: "S",
                    },
                },
                {
                    value: "m",
                    label_i18n: {
                        ar: "M",
                        en: "M",
                    },
                },
                {
                    value: "l",
                    label_i18n: {
                        ar: "L",
                        en: "L",
                    },
                },
                {
                    value: "xl",
                    label_i18n: {
                        ar: "XL",
                        en: "XL",
                    },
                },
                {
                    value: "xxl",
                    label_i18n: {
                        ar: "2XL",
                        en: "2XL",
                    },
                },
            ],
        },
        {
            key: "color",
            name_i18n: {
                ar: "اللون",
                en: "Colour",
            },
            kind: "enum",
            display_order: 2,
            options: [
                {
                    value: "black",
                    label_i18n: {
                        ar: "أسود",
                        en: "Black",
                    },
                },
                {
                    value: "white",
                    label_i18n: {
                        ar: "أبيض",
                        en: "White",
                    },
                },
                {
                    value: "beige",
                    label_i18n: {
                        ar: "بيج",
                        en: "Beige",
                    },
                },
                {
                    value: "blue",
                    label_i18n: {
                        ar: "أزرق",
                        en: "Blue",
                    },
                },
                {
                    value: "brown",
                    label_i18n: {
                        ar: "بني",
                        en: "Brown",
                    },
                },
                {
                    value: "green",
                    label_i18n: {
                        ar: "أخضر",
                        en: "Green",
                    },
                },
                {
                    value: "red",
                    label_i18n: {
                        ar: "أحمر",
                        en: "Red",
                    },
                },
            ],
        },
        {
            key: "material",
            name_i18n: {
                ar: "الخامة",
                en: "Material",
            },
            kind: "enum",
            display_order: 3,
            options: [
                {
                    value: "cotton",
                    label_i18n: {
                        ar: "قطن",
                        en: "Cotton",
                    },
                },
                {
                    value: "linen",
                    label_i18n: {
                        ar: "كتان",
                        en: "Linen",
                    },
                },
                {
                    value: "wool",
                    label_i18n: {
                        ar: "صوف",
                        en: "Wool",
                    },
                },
                {
                    value: "polyester",
                    label_i18n: {
                        ar: "بوليستر",
                        en: "Polyester",
                    },
                },
                {
                    value: "denim",
                    label_i18n: {
                        ar: "جينز",
                        en: "Denim",
                    },
                },
            ],
        },
        {
            key: "fit",
            name_i18n: {
                ar: "القصّة",
                en: "Fit",
            },
            kind: "enum",
            display_order: 4,
            options: [
                {
                    value: "slim",
                    label_i18n: {
                        ar: "ضيقة",
                        en: "Slim",
                    },
                },
                {
                    value: "regular",
                    label_i18n: {
                        ar: "عادية",
                        en: "Regular",
                    },
                },
                {
                    value: "oversized",
                    label_i18n: {
                        ar: "واسعة",
                        en: "Oversized",
                    },
                },
            ],
        },
        {
            key: "season",
            name_i18n: {
                ar: "الموسم",
                en: "Season",
            },
            kind: "enum",
            display_order: 5,
            options: [
                {
                    value: "summer",
                    label_i18n: {
                        ar: "صيفي",
                        en: "Summer",
                    },
                },
                {
                    value: "winter",
                    label_i18n: {
                        ar: "شتوي",
                        en: "Winter",
                    },
                },
                {
                    value: "all",
                    label_i18n: {
                        ar: "كل المواسم",
                        en: "All seasons",
                    },
                },
            ],
        },
    ],
};
