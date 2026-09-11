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

/** Customer chat-screenshot carousel shown on the original PDP (site-wide).
 *  Each entry gets a numbered alt so the social proof is announced to
 *  assistive tech instead of being nine empty images. */
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

/** One delivery promise for the whole store. The original funnel said
 *  14h on the product page, 18h in two FAQs and 24h in the COD card — three
 *  numbers for one service. 18h is the figure the merchant actually commits
 *  to in the FAQ, so every surface reads it from here. */
const DELIVERY_SLA_I18N = {
    ar: "أغلب الطلبات توصل خلال 18 ساعة من تثبيت الطلب",
    en: "Most orders arrive within 18 hours of confirmation",
};

/** Top trust badges (hero strip) — original site order and labels. */
const TRUST_TOP = [
    { icon_url: ASSETS.trustFast, label_i18n: { ar: "توصيل سريع", en: "Fast delivery" } },
    { icon_url: ASSETS.trustQuality, label_i18n: { ar: "ضمان الجودة", en: "Quality guarantee" } },
    { icon_url: ASSETS.trustIraq, label_i18n: { ar: "متوفر بالعراق", en: "Available in Iraq" } },
    { icon_url: ASSETS.trustCod, label_i18n: { ar: "الدفع عند الاستلام", en: "Cash on delivery" } },
];

/** Bottom (pre-footer) trust badges — the original swaps the first two labels. */
const TRUST_BOTTOM = [
    // "توصيل مجاني" (the original label) contradicted the per-governorate
    // delivery fee the checkout actually charges — kept truthful instead.
    { icon_url: ASSETS.trustFast, label_i18n: { ar: "توصيل لكل المحافظات", en: "Delivery to every governorate" } },
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
        ar: "إذا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
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

/** Order-lifecycle questions from the original about page. */
const FAQ_ITEMS_ORDERS = [
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
];

/** Every question the store answers, for the dedicated /faq page. */
const FAQ_ITEMS_ALL = [...FAQ_ITEMS_HOME, ...FAQ_ITEMS_ORDERS];

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
            ar: `${DELIVERY_SLA_I18N.ar}.`,
            en: `${DELIVERY_SLA_I18N.en}.`,
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

/** The store's own legal pages (Arabic only, as published on the original
 *  site). Owned by the template so re-applying it never resets them to the
 *  generic commerce boilerplate. Headings use `## ` so policy_content renders
 *  real sections; contact numbers are links. */
const POLICIES = {
    policy_shipping: {
        heading_i18n: { ar: "سياسة الشحن", en: "Shipping policy" },
        body_md_i18n: { ar: `مرحبًا بكم في شنايدر! نسعى لتقديم تجربة تسوق مريحة وسلسة، وتشمل ذلك خدمة الشحن التي تضمن وصول طلباتكم بأسرع وقت ممكن.

## تفاصيل الشحن

**مدة معالجة الطلبات:**
تتم معالجة الطلبات خلال يومي عمل (كل ايام الاسبوع) بعد تأكيد الطلب.
الطلبات المقدمة في عطلة نهاية الأسبوع أو العطلات الرسمية سيتم معالجتها في أول يوم عمل بعدها.

**مدة الشحن:**
تختلف مدة الشحن بناءً على الموقع الجغرافي، وعادةً ما تتراوح بين 24 ساعة إلى 3 أيام عمل للطلبات المحلية.
قد تستغرق الطلبات الدولية وقتًا أطول حسب الوجهة وخدمات الشحن المتاحة.

**رسوم الشحن:**
يتم احتساب رسوم الشحن تلقائيًا عند إتمام الطلب بناءً على رسوم الشحن الثابتة المفروضة من قبل شركة التوصيل (5000 بغداد, 6000 محافظات)
قد نقدم شحنًا مجانيًا للطلبات التي تتجاوز مبلغًا معينًا (يتم الإعلان عن العروض عبر موقعنا).

**تتبع الشحنات:**
التواصل معنا على الواتساب [07779703832](https://wa.me/9647779703832) لمتابعة حالة طلبك

## سياسة التسليم
الدقة في العنوان: يرجى التأكد من إدخال عنوان الشحن بشكل صحيح وكامل لتجنب أي تأخير أو عدم استلام الطلب.
التوقيع عند الاستلام: قد تتطلب بعض الطلبات توقيع المستلم لضمان التسليم الآمن.

## الشحن الدولي
يتم شحن الطلبات الدولية وفقًا لقوانين وأنظمة البلد الوجهة.
يتحمل العميل أي رسوم جمركية أو ضرائب قد تفرضها السلطات المحلية.

## مشاكل الشحن
إذا واجهت أي مشكلة مع شحنتك، سواء كانت تأخيرًا أو تلفًا، يرجى التواصل معنا عبر البريد الإلكتروني أو الهاتف المخصص لخدمة العملاء، وسنعمل على حل المشكلة في أسرع وقت ممكن.

نشكركم على ثقتكم بمتجرنا! إذا كانت لديكم أي استفسارات إضافية، لا تترددوا في التواصل معنا.` },
    },
    policy_returns: {
        heading_i18n: { ar: "سياسة الاسترجاع", en: "Return and refund policy" },
        last_updated: "2024-10-16",
        body_md_i18n: { ar: `في شنايدر، رضا العملاء هو أولويتنا. إذا لم تكن راضيًا تمامًا عن مشترياتك، نحن هنا للمساعدة. فيما يلي سياسة الاسترجاع للمشتريات التي تتم في المتجر أو عبر الإنترنت.

## اولاً: الأهلية للاسترجاع
- يجب التبليغ برغبة الاسترجاع بعد استخدام العطر حصراً خلال 24 ساعة من تاريخ وصول الطلب لضمان تجربة العطر بصورة كاملة
- يتم الاسترجاع فقط في حالة عدم رضا الزبون عن المنتج او وجود عيب مصنعي للمنتج او ارسال منتج غير صحيح (على الزبون التأكد من البضاعة الواصلة بحضور المندوب) والتأكد من طلبه جيداً قبل الطلب
- يجب أن تكون السلعة في حالتها الأصلية، غير مستعملة بشدة او متضررة، وغير ممزقة او تالفة، مع وجود جميع البطاقات والتغليف الأصلي
- يجب تقديم إثبات الشراء (فاتورة أو إيصال)

## ثانيا: السلع غير القابلة للاسترجاع
- سلع التصفية والسلع الترويجية غير قابلة للاسترجاع
- عطور العينات والتقسيم غير قابلة للاسترجاع لأسباب تتعلق بالصحة والسلامة.

## ثالثا: طريقة الاسترجاع
الاسترجاع يتم التواصل المباشر معنا في غضون 24 ساعة من استلام الطلب عن طريق الواتساب من خلال الرقم [07779703832](https://wa.me/9647779703832). يتم ارسال مندوب من شركة التوصيل من قبلنا لأستلام المنتج وتسليم المبلغ او تبديله. يتم التبديل حصراً بعد التأكد ان المنتج بحالته الاصلية خلافه يسقط حق الزبون بالاسترجاع، او الاستبدال

- يتحمل العميل تكاليف الشحن عند إعادة السلع (للمشتريات عبر الإنترنت)
- استرداد الأموال: بعد استلامنا وفحص السلعة، سيتم إشعارك بقبول أو رفض الاسترجاع
- اذا تم قبول استرجاعك، سيتم رد المبلغ على طريقة الدفع الأصلية بوجود المندوب مباشرة
- نقوم بأسترجاع مبلغ الطلب، مع استقطاع مبلغ التوصيل من قبل شركة التوصيل لاعادة المبلغ للزبون، بسبب اعادة ارسال المندوب مرة اخرى للزبون

## الاتصال بنا
لأي استفسار أو دعم إضافي، يرجى الاتصال بنا عبر رقم الواتساب: [07779703832](https://wa.me/9647779703832)
نحن في شنايدر نقدر اختيارك للتسوق معنا، ونسعى دائمًا لتقديم أفضل تجربة تسوق لعملائنا.` },
    },
    policy_privacy: {
        heading_i18n: { ar: "سياسة الخصوصية", en: "Privacy policy" },
        last_updated: "2024-10-16",
        body_md_i18n: { ar: `نحن نحترم خصوصيتك ونلتزم بحمايتها. توضح سياسة الخصوصية هذه كيفية جمعنا واستخدامنا ومشاركة وحماية معلوماتك عندما تزور متجرنا أو موقعنا الإلكتروني أو تستخدم خدماتنا

## اولاً: المعلومات التي نقوم بجمعها
قد نقوم بجمع الأنواع التالية من المعلومات
- المعلومات الشخصية: الاسم، عنوان البريد الإلكتروني، رقم الهاتف، عنوان السكن, والعنوان البريدي عند قيامك بالشراء، أو الاشتراك في النشرات الإخبارية، أو التواصل معنا
- بيانات الاستخدام: معلومات حول كيفية استخدامك لموقعنا الالكترونية مثل عنوان الاي بي, نوع المتصفح, والصفحات التي تزورها

## ثانياً: نستخدم المعلومات التي نجمعها للأغراض التالية
- معالجة الطلبات: لاستخدام معلومات الدفع وتوصيل المشتريات.
- تحسين تجربة المستخدم: لتحليل كيفية استخدامك لموقعنا الإلكتروني وتحسين خدماتنا ومنتجاتنا
- التواصل معك: للرد على استفساراتك أو إرسال العروض الترويجية والأخبار التي تهمك (بموافقتك)

## ثالثاً: مشاركة المعلومات
نحن لا نبيع أو نؤجر بياناتك الشخصية لأي أطراف خارجية. قد نشارك معلوماتك فقط مع
- مزودي الخدمة: شركات التوصيل لغرض التوصيل او الشحن الذين يساعدوننا في تقديم خدماتنا
- الأغراض القانونية: إذا طُلب منا ذلك بموجب القانون أو لحماية حقوقنا القانونية

## رابعاً: حماية المعلومات
نحن نتخذ خطوات تقنية وإدارية لحماية معلوماتك من الوصول غير المصرح به أو التعديل أو الفقد. ومع ذلك، لا يمكننا ضمان أمان كامل نظرًا للطبيعة الإلكترونية للإنترنت.

## خامساً: حقوق المستخدم
بصفتك مستخدمًا، لديك الحقوق التالية
- الوصول: يمكنك طلب الوصول إلى المعلومات التي جمعناها عنك
- التصحيح: طلب تصحيح أي معلومات غير دقيقة أو غير مكتملة
- الحذف: يمكنك طلب حذف بياناتك في أي وقت، باستثناء ما يُطلب منا الاحتفاظ به قانونيًا

## سادساً: ملفات تعريف الارتباط (Cookies)
نستخدم ملفات تعريف الارتباط لجمع بيانات الاستخدام ولتحسين تجربتك على موقعنا. يمكنك التحكم في إعدادات ملفات تعريف الارتباط من خلال متصفحك.

## سابعاً: التغييرات على سياسة الخصوصية
قد نقوم بتحديث هذه السياسة من وقت لآخر. سيتم نشر أي تغييرات على هذه الصفحة مع تحديث تاريخ السريان

## ثامناً: الاتصال بنا
إذا كان لديك أي استفسارات بخصوص سياسة الخصوصية هذه، يمكنك التواصل معنا عبر الهاتف [07779703832](tel:+9647779703832)
نشكر لك ثقتك في شنايدر، ونؤكد التزامنا بحماية خصوصيتك وبياناتك الشخصية` },
    },
    policy_terms: {
        heading_i18n: { ar: "الشروط والاحكام", en: "Terms of service" },
        last_updated: "2024-10-16",
        body_md_i18n: { ar: `مرحبًا بك في شنايدر!
تحكم شروط الخدمة هذه وصولك إلى موقعنا واستخدامك له ولمنتجاتنا وخدماتنا.
باستخدامك لموقعنا أو شرائك من متجرنا، فإنك توافق على الالتزام بالشروط التالية:

## اولاً: قبول الشروط
عند استخدامك لموقعنا أو خدماتنا، فإنك تقر بقراءتك وفهمك لهذه الشروط وتوافق على الالتزام بها. إذا كنت لا توافق على أي جزء من هذه الشروط، يرجى عدم استخدام الموقع أو شراء منتجاتنا.

## ثانياً: المشتريات والمدفوعات
- جميع الأسعار الموضحة على موقعنا الإلكتروني هي أسعار نهائية بالدينار العراقي ولا تضاف عليها أي ضرائب.
- الدفع يتم نقداً عند الاستلام (الدفع عند الاستلام) بعد فحص المنتج بحضور المندوب.
- قد تضاف أجور توصيل حسب المحافظة وتُعرض بوضوح قبل تأكيد الطلب. أنت توافق على تقديم معلومات صحيحة ودقيقة عند إتمام الطلب.

## ثالثا: إلغاء الطلبات وتعديلات الأسعار
نحتفظ بالحق في إلغاء أي طلب أو تعديله إذا كانت المعلومات الخاصة بالمنتج غير دقيقة أو عند حدوث خطأ في التسعير.
قد نقوم بتعديل الأسعار في أي وقت دون إشعار مسبق.

## رابعاً: الشحن والتسليم
- يتم شحن المنتجات داخل العراق إلى العنوان الذي تحدده عند إتمام الطلب.
- نحن لسنا مسؤولين عن أي تأخير في الشحن ناتج عن ظروف خارجة عن إرادتنا مثل مشاكل الشحن أو الجمارك.

## خامساً: حقوق الملكية الفكرية
جميع المحتويات الموجودة على موقع شنايدر، بما في ذلك النصوص، الصور، والشعارات، هي ملك لشركة شنايدر ومحميّة بموجب قوانين حقوق الملكية الفكرية
- لا يجوز لك استخدام أو نسخ أي محتوى من الموقع دون إذن كتابي مسبق مكتوب من قبل مدير شركة شنايدر حصرا

## سادساً: سياسة الاستخدام
يجب عليك استخدام الموقع للأغراض القانونية فقط. يمنع تحميل أو نشر أي محتوى يضر أو ينتهك حقوق الآخرين، أو يتضمن فيروسات أو برامج ضارة.
- نحن نحتفظ بالحق في إنهاء أو تعليق وصولك إلى الموقع إذا تم انتهاك هذه الشروط.

## سابعاً: التعديلات على الشروط
- نحن نحتفظ بالحق في تعديل أو تحديث هذه الشروط في أي وقت. سيتم نشر أي تغييرات على هذه الصفحة مع تحديث تاريخ السريان.

## ثامناً: إخلاء المسؤولية
نحن نقدم الموقع والمنتجات "كما هي" و"حسب توفرها" دون أي ضمانات صحية، صريحة أو ضمنية. نحن غير مسؤولين عن أي أضرار صحية او معنوية او مادية قد تنشأ من استخدامك للموقع أو المنتجات مثل رش العطور بالفم او التعرض لوعكة صحية نتيجة الاستخدام الخاطئ للمنتجات

## تاسعاً: القانون المعمول به
تخضع هذه الشروط وتفسر وفقًا لقوانين جمهورية العراق. أي نزاع ينشأ عن استخدامك للموقع أو شراء منتجاتنا سيخضع للاختصاص القضائي للمحاكم العراقية.

## عاشراً: الاتصال بنا
إذا كانت لديك أي استفسارات حول شروط الخدمة هذه، يمكنك التواصل معنا عبر الهاتف: [07779703832](tel:+9647779703832)

نشكرك لاختيارك شنايدر ونتمنى لك تجربة تسوق ممتعة وآمنة!` },
    },
} as const;

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
                                ar: "سياسة الخصوصية",
                                en: "Privacy policy",
                            },
                            href: "/policies/privacy",
                        },
                        {
                            label_i18n: {
                                ar: "الشروط والاحكام",
                                en: "Terms and conditions",
                            },
                            href: "/policies/terms",
                        },
                        {
                            label_i18n: {
                                ar: "سياسة الاسترجاع",
                                en: "Return and refund policy",
                            },
                            href: "/policies/returns",
                        },
                        {
                            label_i18n: {
                                ar: "سياسة الشحن",
                                en: "Shipping policy",
                            },
                            href: "/policies/shipping",
                        },
                    ],
                },
            ],
            show_cod_badge: false,
            // No phone here on purpose: a per-section override wins over the
            // store's contact settings (helpers/whatsapp), so a stale number in
            // the template would shadow whatever the merchant sets later.
            contact: {
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
                // Delivers the promised coupon — the WELCOME15 discount code
                // exists in the store's commerce config, so the 15% claim is
                // backed by a real redemption path at checkout.
                success_i18n: {
                    ar: "تم الاشتراك! كود الخصم مالتك: WELCOME15",
                    en: "You're in! Your discount code: WELCOME15",
                },
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
                // "bestsellers" ranks by the merchant's display_order — the
                // heading claims best sellers, so the sort must not be
                // "newest" (heading/data truth mismatch).
                query: { sort: "bestsellers", limit: 8 },
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
                        href: "/categories/work",
                    },
                    {
                        image_url: ASSETS.trioOutings,
                        title_i18n: { ar: "عطور للطلعات", en: "Perfumes for outings" },
                        sub_i18n: {
                            ar: "الجمع بين الفخامة والراحة",
                            en: "Luxury and comfort combined",
                        },
                        cta_label_i18n: { ar: "تعال نوريك", en: "Come see" },
                        href: "/categories/outings",
                    },
                    {
                        image_url: ASSETS.trioOccasions,
                        title_i18n: { ar: "عطور للمناسبات", en: "Perfumes for occasions" },
                        sub_i18n: {
                            ar: "للمناسبات الخاصة",
                            en: "For special occasions",
                        },
                        cta_label_i18n: { ar: "تألق هسة", en: "Shine now" },
                        href: "/categories/occasions",
                    },
                ],
            }),
            s("testimonial_cards", {
                eyebrow_i18n: { ar: "آراء كشايخنا", en: "What our regulars say" },
                title_i18n: { ar: "ليش الناس تموت على عطورنا", en: "Why people are crazy about our perfumes" },
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
                    ar: "شنايدر متجر عطور من بغداد. نختار عطورنا يدوياً من أفخم الدور العالمية، ونجرّب كل عطر بأنفسنا قبل ما يوصلكم. كل طلب يجيك وياه تيستر مجاني تجرّبه بحضور المندوب، وإذا ما عجبك ترجّعه خلال أسبوع وتستلم فلوسك كاملة. الدفع عند الاستلام، والتوصيل لكل المحافظات.",
                    en: "Scheniders is a perfume house from Baghdad. We hand-pick from the world's finest houses and wear-test every scent ourselves before it reaches you. Every order ships with a free tester to try with the courier present; if it isn't for you, return it within a week for a full refund. Cash on delivery, to every governorate.",
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
                // {count} resolves to the product's REAL approved-review
                // count at render time; the chip hides when there are none.
                rating_chip_i18n: {
                    ar: "{count} تقييم من زبائننا",
                    en: "{count} customer reviews",
                },
                stock_urgency_i18n: {
                    ar: "هذا العطر عليه طلب كبير ✨ سارع بالطلب — باقي {count} قطع فقط",
                    en: "This perfume is in high demand ✨ order fast — only {count} left",
                },
                show_gallery: true,
                feature_cards_title_i18n: {
                    ar: "شنو يميز هاي العطر عن غيره؟",
                    en: "What makes this scent special?",
                },
                // The COD promise in the shopper's words, right under the CTA.
                reassurance_i18n: {
                    ar: "تفتح وتجرب قبل ما تدفع — والتيستر هدية وياه",
                    en: "Open it and try it before you pay — tester included",
                },
                delivery_sla_i18n: DELIVERY_SLA_I18N,
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
                images: REVIEW_SCREENSHOTS.map((url, i) => ({
                    url,
                    alt_i18n: {
                        ar: `رسالة من زبون ${i + 1} من ${REVIEW_SCREENSHOTS.length}`,
                        en: `Customer message ${i + 1} of ${REVIEW_SCREENSHOTS.length}`,
                    },
                })),
            }),
            // Real per-product customer reviews + submission form.
            s("product_reviews"),
            s("faq_contact_split", {
                eyebrow_i18n: { ar: "أسئلة و أجوبة", en: "Questions & answers" },
                title_i18n: { ar: "الأسئلة الأكثر شيوعا", en: "Frequently asked questions" },
                sub_i18n: {
                    ar: "هنا تجد أجوبة عن الأسئلة الاكثر شيوعا، إذا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
                    en: "Answers to the most common questions — and you can always reach us for more.",
                },
                row_icon_url: ASSETS.faqRow,
                items: FAQ_ITEMS_HOME,
                contact: FAQ_CONTACT_MORE,
            }),
            s("product_grid", {
                mode: "auto",
                // The heading claims best sellers, so the sort must be
                // bestsellers (merchant display order) — not newest. The
                // grid also excludes the product being viewed.
                query: { sort: "bestsellers", limit: 8 },
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
            // The only purchase path on this PDP is the inline COD form, so
            // the mobile bar scrolls to it instead of sending shoppers to an
            // empty /checkout.
            s("sticky_cta_bar", {
                primary_kind: "scroll_to_form",
                show_product_price: true,
                primary_label_i18n: { ar: "اطلب الآن", en: "Order now" },
                secondary_label_i18n: { ar: "واتساب", en: "WhatsApp" },
                secondary_kind: "whatsapp",
                show_total: false,
            }),
        ],
        about: [
            s("hero_card_float", {
                headline_i18n: { ar: "منو شنايدر؟", en: "Who is Scheniders?" },
                sub_i18n: {
                    ar: "متجر عطور من بغداد، نختار عطورنا يدوياً من أفخم الدور العالمية ونجرّبها بأنفسنا قبل ما توصلكم. تيستر مجاني مع كل طلب، دفع عند الاستلام، وترجيع خلال أسبوع.",
                    en: "A perfume house from Baghdad. We hand-pick from the world's finest houses and wear-test every scent ourselves. Free tester with every order, cash on delivery, returns within a week.",
                },
                cta_label_i18n: { ar: "منتجاتنا", en: "Our products" },
                cta_href: "/products",
                card_align: "center",
                badge_i18n: undefined,
                secondary_cta_kind: "whatsapp",
                secondary_cta_value: "",
                secondary_cta_label_i18n: { ar: "اطلب عبر واتساب", en: "Order on WhatsApp" },
            }),
            s("pillars_grid", {
                eyebrow_i18n: { ar: "مميزات", en: "Highlights" },
                title_i18n: { ar: "ليش تشتري من شنايدر؟", en: "Why buy from Scheniders?" },
                // Three distinct promises, one icon each. The original page
                // listed six generic pillars that repeated "offers and
                // discounts" twice and reused every icon for two claims.
                items: [
                    {
                        icon_url: ASSETS.pillarQuality,
                        title_i18n: { ar: "تجرّب قبل ما تدفع", en: "Try before you pay" },
                        body_i18n: {
                            ar: "كل طلب يجيك وياه تيستر زجاجي مجاني تجرّبه بحضور المندوب. إذا ما عجبك، ترجّعه وتستلم فلوسك كاملة خلال أسبوع.",
                            en: "Every order arrives with a free glass tester you try with the courier present. Not for you? Return it within a week for a full refund.",
                        },
                    },
                    {
                        icon_url: ASSETS.pillarValue,
                        title_i18n: { ar: "سعر عادل، بدون مبالغة", en: "Fair prices, no markup games" },
                        body_i18n: {
                            ar: "نسعّر عطورنا بأرقام نقتنع بيها احنا قبلكم — مستحيل نحط سعر على عطر ما مستعدين ندفعه بأنفسنا.",
                            en: "We price at numbers we would pay ourselves — never a price we wouldn't pay for the same bottle.",
                        },
                    },
                    {
                        icon_url: ASSETS.pillarEndurance,
                        title_i18n: { ar: "توصيل سريع لكل المحافظات", en: "Fast delivery to every governorate" },
                        body_i18n: {
                            ar: `${DELIVERY_SLA_I18N.ar}، والدفع عند الاستلام بعد ما تفحص الطلب.`,
                            en: `${DELIVERY_SLA_I18N.en}, cash on delivery after you inspect the order.`,
                        },
                    },
                ],
            }),
            s("testimonial_cards", {
                eyebrow_i18n: { ar: "آراء كشايخنا", en: "What our regulars say" },
                title_i18n: { ar: "ليش الناس تموت على عطورنا", en: "Why people are crazy about our perfumes" },
                side_image_left_url: ASSETS.sideArtLeft,
                side_image_right_url: ASSETS.sideArtRight,
                items: TESTIMONIALS,
            }),
            s("faq_contact_split", {
                eyebrow_i18n: { ar: "أسئلة و أجوبة", en: "Questions & answers" },
                title_i18n: { ar: "الأسئلة الأكثر شيوعا", en: "Frequently asked questions" },
                sub_i18n: {
                    ar: "هنا تجد أجوبة عن الأسئلة الاكثر شيوعا، إذا مازلت تريد معلومات إضافية، يمكنك دائما الاتصال بنا.",
                    en: "Answers to the most common questions — and you can always reach us for more.",
                },
                row_icon_url: ASSETS.faqRow,
                items: FAQ_ITEMS_ORDERS,
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
            s("policy_content", {
                body_md_i18n: {
                    // Instagram matches the footer's actual linked account
                    // (the original site's contact page typed a different
                    // handle than its own footer links — self-consistency won).
                    ar: "## معلومات التواصل\n\nرقم الهاتف: [0777 970 3832](tel:+9647779703832)\n\nواتساب: [راسلنا على واتساب](https://wa.me/9647779703832)\n\nانستغرام: [@kawkab.brand](https://www.instagram.com/kawkab.brand/)\n\nالعنوان: العراق - بغداد - زيونة",
                    en: "## Contact information\n\nPhone: [0777 970 3832](tel:+9647779703832)\n\nWhatsApp: [Message us on WhatsApp](https://wa.me/9647779703832)\n\nInstagram: [@kawkab.brand](https://www.instagram.com/kawkab.brand/)\n\nAddress: Iraq - Baghdad - Zayouna",
                },
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
                // The dedicated FAQ page carries every question the store
                // answers anywhere; the other pages show subsets.
                items: FAQ_ITEMS_ALL,
                contact: FAQ_CONTACT_HOME,
            }),
        ],
        ...commercePages(s, { productCardStyle: "price_pill" }),
        policy_shipping: [s("policy_content", { ...POLICIES.policy_shipping })],
        policy_returns: [s("policy_content", { ...POLICIES.policy_returns })],
        policy_privacy: [s("policy_content", { ...POLICIES.policy_privacy })],
        policy_terms: [s("policy_content", { ...POLICIES.policy_terms })],
    },
};
