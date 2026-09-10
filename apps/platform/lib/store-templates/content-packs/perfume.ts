// Perfume — the flagship's own niche. Copy is the Scheniders storefront's,
// word for word (the parity test pins it); the categories and attributes
// are the taxonomy a perfume store filters by.
import type { ContentPack } from "./types";

/** One delivery promise for the whole store. The original funnel said 14h,
 *  18h and 24h on different surfaces; 18h is what the merchant commits to. */
const SLA = {
    ar: "أغلب الطلبات توصل خلال 18 ساعة من تثبيت الطلب",
    en: "Most orders arrive within 18 hours of confirmation",
};

const FAQ_HOME = [
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

const FAQ_ORDERS = [
    {
        q_i18n: { ar: "كيف يمكنني إلغاء طلب؟", en: "How can I cancel an order?" },
        a_i18n: {
            ar: "نحن قادرون فقط على إلغاء الطلبات في غضون الـ 12 ساعة الأولى بعد تقديم الطلب. وبعد ذلك تمت معالجة الطلب على الأرجح والاستعداد للشحن. نحن نعتذر عن أي إزعاج قد يسببه هذا الأمر، لكننا نفخر بتقديم الخدمة السريعة وهذا يشمل إخراج طلباتك في أسرع وقت ممكن.",
            en: "Orders can only be cancelled within the first 12 hours — after that they are likely processed and being prepared for shipping. We apologise for any inconvenience; fast service means your order goes out as quickly as possible.",
        },
    },
    {
        q_i18n: { ar: "كم تستغرق عملية الشحن من الوقت؟", en: "How long does shipping take?" },
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
];

export const perfumePack: ContentPack = {
    id: "perfume",
    name_i18n: { ar: "عطور", en: "Perfume" },
    description_i18n: {
        ar: "عطور أصلية، تيستر مع كل طلب، تجرّب قبل ما تدفع.",
        en: "Authentic perfumes, a tester with every order, try before you pay.",
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
        title_i18n: { ar: "منو شنايدر؟", en: "Who is Scheniders?" },
        body_i18n: {
            ar: "متجر عطور من بغداد، نختار عطورنا يدوياً من أفخم الدور العالمية ونجرّبها بأنفسنا قبل ما توصلكم. تيستر مجاني مع كل طلب، دفع عند الاستلام، وترجيع خلال أسبوع.",
            en: "A perfume house from Baghdad. We hand-pick from the world's finest houses and wear-test every scent ourselves. Free tester with every order, cash on delivery, returns within a week.",
        },
    },
    about: {
        title_i18n: { ar: "منو احنا", en: "Who we are" },
        body_i18n: {
            ar: "شنايدر متجر عطور من بغداد. نختار عطورنا يدوياً من أفخم الدور العالمية، ونجرّب كل عطر بأنفسنا قبل ما يوصلكم. كل طلب يجيك وياه تيستر مجاني تجرّبه بحضور المندوب، وإذا ما عجبك ترجّعه خلال أسبوع وتستلم فلوسك كاملة. الدفع عند الاستلام، والتوصيل لكل المحافظات.",
            en: "Scheniders is a perfume house from Baghdad. We hand-pick from the world's finest houses and wear-test every scent ourselves before it reaches you. Every order ships with a free tester to try with the courier present; if it isn't for you, return it within a week for a full refund. Cash on delivery, to every governorate.",
        },
    },
    founder: {
        quote_i18n: {
            ar: "نجرّب كل عطر بأنفسنا قبل ما يوصلكم — العطر اللي ما يثبت طول اليوم ما يدخل المتجر.",
            en: "We wear-test every perfume ourselves before it reaches you — a scent that fades through the day never makes the store.",
        },
        role_i18n: { ar: "المؤسِّس", en: "Founder" },
    },
    pillars: [
        {
            title_i18n: { ar: "الجودة الفائقة", en: "Superior quality" },
            body_i18n: {
                ar: "عطورنا نختارهم فقط وحصرياً من اعلى جودة زيوت عطرية, اي شي دون الفئة العليا بالخامات العطرية ما نتقرب الها",
                en: "We choose only the highest-grade fragrance oils — anything below the top tier never makes the cut.",
            },
        },
        {
            title_i18n: { ar: "القيمة مقابل السعر", en: "Value for money" },
            body_i18n: {
                ar: "على عكس بقية الشركات نحرص على تسعير عطورنا بارقام عادلة, مستحيل نخلي سعر على عطر احنا ما مستعدين ندفعها بيه",
                en: "Unlike others we price fairly — we would never charge a price we would not pay ourselves.",
            },
        },
        {
            title_i18n: { ar: "الادامة", en: "Longevity" },
            body_i18n: {
                ar: "من اكثر الشروط الي معقدة عملنا هو حرصنا على اختبار العطور بصورة شخصية بانفسنا, ونعرضهم لمجموعة اختبارات سيطرة نوعية. العطر اللي ما يحافظ على اداءه وفوحانه اثناء اليوم يتم رفضه",
                en: "We personally test every perfume through a battery of quality checks — any scent that fades through the day is rejected.",
            },
        },
    ],
    pillars_about: [
        {
            title_i18n: { ar: "تجرّب قبل ما تدفع", en: "Try before you pay" },
            body_i18n: {
                ar: "كل طلب يجيك وياه تيستر زجاجي مجاني تجرّبه بحضور المندوب. إذا ما عجبك، ترجّعه وتستلم فلوسك كاملة خلال أسبوع.",
                en: "Every order arrives with a free glass tester you try with the courier present. Not for you? Return it within a week for a full refund.",
            },
        },
        {
            title_i18n: { ar: "سعر عادل، بدون مبالغة", en: "Fair prices, no markup games" },
            body_i18n: {
                ar: "نسعّر عطورنا بأرقام نقتنع بيها احنا قبلكم — مستحيل نحط سعر على عطر ما مستعدين ندفعه بأنفسنا.",
                en: "We price at numbers we would pay ourselves — never a price we wouldn't pay for the same bottle.",
            },
        },
        {
            title_i18n: { ar: "توصيل سريع لكل المحافظات", en: "Fast delivery to every governorate" },
            body_i18n: {
                ar: `${SLA.ar}، والدفع عند الاستلام بعد ما تفحص الطلب.`,
                en: `${SLA.en}, cash on delivery after you inspect the order.`,
            },
        },
    ],
    trust: [
        { ar: "توصيل سريع", en: "Fast delivery" },
        { ar: "ضمان الجودة", en: "Quality guarantee" },
        { ar: "متوفر بالعراق", en: "Available in Iraq" },
        { ar: "الدفع عند الاستلام", en: "Cash on delivery" },
    ],
    trust_bottom: [
        // "توصيل مجاني" (the original label) contradicted the per-governorate
        // delivery fee the checkout actually charges — kept truthful instead.
        { ar: "توصيل لكل المحافظات", en: "Delivery to every governorate" },
        { ar: "خدمة العملاء", en: "Customer care" },
        { ar: "متوفر بالعراق", en: "Available in Iraq" },
        { ar: "الدفع عند الاستلام", en: "Cash on delivery" },
    ],
    faq: FAQ_HOME,
    faq_orders: FAQ_ORDERS,
    delivery: {
        sla_i18n: SLA,
        inspection_i18n: {
            ar: "افتح الطلب وتأكد قبل ما تدفع — والتيستر هدية وياه",
            en: "Open and check your order before you pay — tester included",
        },
        reassurance_i18n: {
            ar: "تفتح وتجرب قبل ما تدفع — والتيستر هدية وياه",
            en: "Open it and try it before you pay — tester included",
        },
    },
    pdp_policies: [
        {
            title_i18n: { ar: "سياسة الدفع عند الاستلام", en: "Cash-on-delivery policy" },
            body_i18n: {
                ar: "يتم الدفع حصراً بعد استلام العطر واختباره من خلال العينة الزجاجية المرفقة مجاناُ مع كل طلب.",
                en: "Payment happens only after receiving the perfume and testing it via the free glass sample included with every order.",
            },
        },
        {
            title_i18n: { ar: "شحن فائق السرعة", en: "Ultra-fast shipping" },
            body_i18n: { ar: `${SLA.ar}.`, en: `${SLA.en}.` },
        },
        {
            title_i18n: { ar: "كرت الضمان المميز و سياسة الاسترجاع", en: "Premium warranty card & return policy" },
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
    ],
    pdp: {
        urgency_i18n: {
            ar: "هذا العطر عليه طلب كبير ✨ سارع بالطلب — باقي {count} قطع فقط",
            en: "This perfume is in high demand ✨ order fast — only {count} left",
        },
        feature_title_i18n: { ar: "شنو يميز هاي العطر عن غيره؟", en: "What makes this scent special?" },
    },
    bestsellers: {
        eyebrow_i18n: { ar: "الأكثر مبيعا", en: "Best sellers" },
        heading_i18n: { ar: "اكثر العطور مبيعاً", en: "Our best-selling perfumes" },
        sub_i18n: {
            ar: "تجميعة من اكثر العطور اللي حبوهم زبائنا",
            en: "A lineup of the perfumes our customers loved most",
        },
    },
    bestsellers_pdp: {
        eyebrow_i18n: { ar: "القطع المميزة لهذا الشهر", en: "This month's standouts" },
        heading_i18n: { ar: "اكثر منتجاتنا مبيعاً", en: "Our best sellers" },
        sub_i18n: {
            ar: "شوف تشكيلة من اكثر العطور اللي حبوها زبائنا",
            en: "A selection of the perfumes our customers loved most",
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
        ar: "عطور فخمة فائقة الجودة بأسعار تنافسية",
        en: "Premium, top-quality perfumes at competitive prices",
    },
    contact: {
        home: {
            title_i18n: { ar: "عندك استفسار", en: "Have a question?" },
            sub_i18n: { ar: "نورونا على الواتساب وسولفوا ويانا", en: "Message us on WhatsApp and let's talk" },
            cta_label_i18n: { ar: "التواصل على واتساب", en: "Chat on WhatsApp" },
        },
        more: {
            title_i18n: { ar: "لديك أسئلة أخرى؟", en: "More questions?" },
            sub_i18n: {
                ar: "إذا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
                en: "If you still need more information, you can always reach us.",
            },
            cta_label_i18n: { ar: "تواصل معنا", en: "Contact us" },
        },
    },
    headings: {
        spotlights: { eyebrow_i18n: { ar: "الفئات", en: "Categories" }, title_i18n: { ar: "اختر حسب الفئة", en: "Shop by category" } },
        collections: { eyebrow_i18n: { ar: "مختاراتنا", en: "Our picks" }, title_i18n: { ar: "عطور مميزة على ذوقنا", en: "Perfumes picked to our taste" } },
        testimonials: { eyebrow_i18n: { ar: "آراء كشايخنا", en: "What our regulars say" }, title_i18n: { ar: "ليش الناس تموت على عطورنا", en: "Why people are crazy about our perfumes" } },
        pillars: { eyebrow_i18n: { ar: "ضمانات", en: "Guarantees" }, title_i18n: { ar: "ليش شنايدر؟", en: "Why Scheniders?" } },
        pillars_about: { eyebrow_i18n: { ar: "مميزات", en: "Highlights" }, title_i18n: { ar: "ليش تشتري من شنايدر؟", en: "Why buy from Scheniders?" } },
        faq: {
            eyebrow_i18n: { ar: "أسئلة و أجوبة", en: "Questions & answers" },
            title_i18n: { ar: "الأسئلة الأكثر شيوعا", en: "Frequently asked questions" },
            sub_i18n: { ar: "اجوبة لاسئلتكم المشهورة من فريقنا", en: "Answers to your most common questions, from our team" },
            sub_more_i18n: {
                ar: "هنا تجد أجوبة عن الأسئلة الاكثر شيوعا، إذا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
                en: "Answers to the most common questions — and you can always reach us for more.",
            },
        },
        contact_page: {
            eyebrow_i18n: { ar: "تواصل معنا", en: "Contact us" },
            title_i18n: { ar: "لديك أية أسئلة ؟ دعنا نساعدك", en: "Questions? Let us help" },
            sub_i18n: {
                ar: "تواصل معنا إن كانت لديك أي أسئلة وسنعاود الاتصال بك في أقرب وقت ممكن. يمكنك أيضًا التحقق من قسم المساعدة والأسئلة الشائعة.",
                en: "Reach out with any question and we'll get back to you as soon as possible — the FAQ section may help too.",
            },
        },
        catalog_i18n: { ar: "منتجاتنا", en: "Our products" },
        see_all_i18n: { ar: "شوفهم كلهم", en: "See them all" },
        see_more_i18n: { ar: "عرض المزيد", en: "Show more" },
        reviews_gallery_i18n: { ar: "كلامهم مو كلامنا", en: "Their words, not ours" },
    },
    // The merchant's own customers, quoted from their messages.
    testimonials: [
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
            quote_i18n: { ar: "عطوركم وتغليفكم يفوزون صراحة", en: "Your perfumes and packaging honestly win." },
        },
    ],
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
