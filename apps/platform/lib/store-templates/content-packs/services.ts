// Services content pack — copy, starter categories and the
// attributes shoppers filter by. No invented reviews: testimonials stay
// empty until the merchant has real ones (the section then renders nothing).
import type { ContentPack } from "./types";

export const servicesPack: ContentPack = {
    id: "services",
    name_i18n: {
        ar: "خدمات",
        en: "Services",
    },
    description_i18n: {
        ar: "خدمات تنحجز أونلاين وتندفع عند التنفيذ.",
        en: "Services booked online and paid on completion.",
    },
    match: [/service|booking|repair|cleaning|خدمات|صيانة|تنظيف/i],
    hero: {
        headline_i18n: {
            ar: "احجز، ونجيك",
            en: "Book, and we come to you",
        },
        sub_i18n: {
            ar: "خدمات بسعر واضح ووقت محدد. تحجز من الموقع أو واتساب، وتدفع بعد ما تنجز الخدمة.",
            en: "Services with a clear price and a fixed time. Book on the site or WhatsApp, and pay after the job is done.",
        },
        cta_label_i18n: {
            ar: "شوف الخدمات",
            en: "See the services",
        },
    },
    story: {
        title_i18n: {
            ar: "منو احنا؟",
            en: "Who we are",
        },
        body_i18n: {
            ar: "فريق عراقي يقدّم خدمات بسعر مكتوب مقدماً ووقت محدد. تدفع بعد ما تشوف الشغل وترضى عنه.",
            en: "An Iraqi team offering services at a price written up front and a fixed time. You pay after you see the work and are happy with it.",
        },
    },
    about: {
        title_i18n: {
            ar: "سعر واضح، تدفع بعد الشغل",
            en: "Clear price, pay after the job",
        },
        body_i18n: {
            ar: "السعر مكتوب قبل ما تحجز، والدفع بعد التنفيذ.",
            en: "The price is written before you book; payment comes after completion.",
        },
    },
    founder: {
        quote_i18n: {
            ar: "الشغل اللي ما نرضى عليه بجيتنا ما نسلّمه.",
            en: "Work we would not accept in our own home, we do not hand over.",
        },
        role_i18n: {
            ar: "المؤسِّس",
            en: "Founder",
        },
    },
    pillars: [
        {
            title_i18n: {
                ar: "سعر مكتوب مقدماً",
                en: "Price written up front",
            },
            body_i18n: {
                ar: "بدون مفاجآت: السعر اللي تشوفه هو اللي تدفعه.",
                en: "No surprises: the price you see is the price you pay.",
            },
        },
        {
            title_i18n: {
                ar: "وقت محدد",
                en: "A fixed time",
            },
            body_i18n: {
                ar: "تختار الوقت اللي يناسبك ونأكده على واتساب.",
                en: "Choose the time that suits you and we confirm it on WhatsApp.",
            },
        },
        {
            title_i18n: {
                ar: "تدفع بعد ما ترضى",
                en: "Pay when you are happy",
            },
            body_i18n: {
                ar: "الدفع بعد ما تشوف الشغل وتتأكد منه.",
                en: "Payment after you see and check the work.",
            },
        },
    ],
    trust: [
        {
            ar: "سعر مكتوب مقدماً",
            en: "Price up front",
        },
        {
            ar: "تدفع بعد التنفيذ",
            en: "Pay after completion",
        },
        {
            ar: "وقت محدد",
            en: "Fixed time",
        },
        {
            ar: "رد سريع على واتساب",
            en: "Fast WhatsApp replies",
        },
    ],
    faq: [
        {
            q_i18n: {
                ar: "شلون أحجز؟",
                en: "How do I book?",
            },
            a_i18n: {
                ar: "اختر الخدمة واطلبها من الموقع، ونتصل بيك حتى نثبّت الوقت.",
                en: "Choose the service and order it on the site; we call to fix the time.",
            },
        },
        {
            q_i18n: {
                ar: "أي مناطق تغطّون؟",
                en: "Which areas do you cover?",
            },
            a_i18n: {
                ar: "مكتوبة على كل خدمة. إذا منطقتك مو موجودة راسلنا.",
                en: "Listed on every service. If your area is missing, message us.",
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
            ar: "نثبّت الوقت وياك على واتساب",
            en: "We fix the time with you on WhatsApp",
        },
        inspection_i18n: {
            ar: "تدفع بعد ما تشوف الشغل",
            en: "Pay after you see the work",
        },
        reassurance_i18n: {
            ar: "تدفع بعد التنفيذ — بدون مقدّم",
            en: "Pay after completion — no deposit",
        },
    },
    pdp_policies: [
        {
            title_i18n: {
                ar: "الدفع",
                en: "Payment",
            },
            body_i18n: {
                ar: "بدون مقدّم. تدفع كاش بعد ما تنجز الخدمة وترضى عنها.",
                en: "No deposit. Pay in cash after the service is done and you are happy.",
            },
        },
        {
            title_i18n: {
                ar: "المواعيد",
                en: "Appointments",
            },
            body_i18n: {
                ar: "تختار الوقت ونأكده على واتساب. تكدر تغيّره لحد ٦ ساعات قبل الموعد.",
                en: "Choose the time and we confirm it on WhatsApp. You can change it up to 6 hours before.",
            },
        },
        {
            title_i18n: {
                ar: "الضمان",
                en: "Guarantee",
            },
            body_i18n: {
                ar: "إذا الشغل ما كان مثل المتفق، نرجع ونصلّحه بدون تكلفة.",
                en: "If the work is not as agreed, we come back and fix it at no cost.",
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
            ar: "المواعيد محدودة — باقي {count} هذا الأسبوع",
            en: "Limited slots — {count} left this week",
        },
        feature_title_i18n: {
            ar: "شنو تشمل الخدمة؟",
            en: "What the service includes",
        },
    },
    bestsellers: {
        eyebrow_i18n: {
            ar: "الأكثر طلباً",
            en: "Most booked",
        },
        heading_i18n: {
            ar: "أكثر خدماتنا طلباً",
            en: "Our most-booked services",
        },
        sub_i18n: {
            ar: "اللي يرجعون له زبائننا",
            en: "What our customers come back for",
        },
    },
    spotlights: [
        {
            slug: "home",
            name_i18n: {
                ar: "خدمات البيت",
                en: "Home services",
            },
        },
        {
            slug: "repair",
            name_i18n: {
                ar: "صيانة",
                en: "Repair",
            },
        },
    ],
    collections: [
        {
            slug: "cleaning",
            title_i18n: {
                ar: "تنظيف",
                en: "Cleaning",
            },
            sub_i18n: {
                ar: "بيوت ومكاتب",
                en: "Homes and offices",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "installation",
            title_i18n: {
                ar: "تركيب",
                en: "Installation",
            },
            sub_i18n: {
                ar: "أجهزة وأثاث",
                en: "Appliances and furniture",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
        {
            slug: "maintenance",
            title_i18n: {
                ar: "صيانة دورية",
                en: "Maintenance",
            },
            sub_i18n: {
                ar: "اشتراكات شهرية",
                en: "Monthly plans",
            },
            cta_label_i18n: {
                ar: "شوفهم",
                en: "See them",
            },
        },
    ],
    tagline_i18n: {
        ar: "خدمات بسعر واضح، تدفع بعد التنفيذ",
        en: "Services at a clear price, paid after completion",
    },
    testimonials: [],
    categories: [
        {
            slug: "home",
            name_i18n: {
                ar: "خدمات البيت",
                en: "Home services",
            },
        },
        {
            slug: "repair",
            name_i18n: {
                ar: "صيانة",
                en: "Repair",
            },
        },
        {
            slug: "cleaning",
            name_i18n: {
                ar: "تنظيف",
                en: "Cleaning",
            },
        },
        {
            slug: "installation",
            name_i18n: {
                ar: "تركيب",
                en: "Installation",
            },
        },
        {
            slug: "maintenance",
            name_i18n: {
                ar: "صيانة دورية",
                en: "Maintenance",
            },
        },
    ],
    attributes: [
        {
            key: "area",
            name_i18n: {
                ar: "المنطقة",
                en: "Area",
            },
            kind: "enum",
            display_order: 1,
            options: [
                {
                    value: "baghdad",
                    label_i18n: {
                        ar: "بغداد",
                        en: "Baghdad",
                    },
                },
                {
                    value: "other",
                    label_i18n: {
                        ar: "محافظات أخرى",
                        en: "Other governorates",
                    },
                },
            ],
        },
        {
            key: "duration_h",
            name_i18n: {
                ar: "المدة (ساعة)",
                en: "Duration (hours)",
            },
            kind: "range",
            range_min: 1,
            range_max: 12,
            display_order: 2,
            unit_i18n: {
                ar: "ساعة",
                en: "h",
            },
        },
        {
            key: "visit",
            name_i18n: {
                ar: "الزيارة",
                en: "Visit",
            },
            kind: "enum",
            display_order: 3,
            options: [
                {
                    value: "onsite",
                    label_i18n: {
                        ar: "عندك",
                        en: "At your place",
                    },
                },
                {
                    value: "workshop",
                    label_i18n: {
                        ar: "بالورشة",
                        en: "At our workshop",
                    },
                },
            ],
        },
        {
            key: "materials_included",
            name_i18n: {
                ar: "المواد مشمولة",
                en: "Materials included",
            },
            kind: "boolean",
            display_order: 4,
        },
    ],
};
