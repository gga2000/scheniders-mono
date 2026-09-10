// =====================================================================
// Scheniders Signature — the flagship visual direction
// =====================================================================
// Warm cream ground, butter-yellow CTAs, floating pill chrome and a
// funnel-style COD product page. This file owns the LOOK: brand kit,
// section stacks, layouts, images. The WORDS come from a content pack
// (`content-packs/*`) so the same direction can sell perfume, coffee or
// fashion without carrying another niche's story.
//
// Two builds of the same direction:
//   - `signatureDirection` — the registry entry every merchant can pick,
//     built with the perfume pack's copy and no merchant facts; onboarding
//     overlays the merchant's own pack on top.
//   - `schenidersSignatureTemplate` — Scheniders' own store: the same
//     direction plus the merchant's facts (logo, legal name, address,
//     socials, customer screenshots, legal pages). Pinned by the parity
//     snapshot so a refactor here can never drift its published config.
// =====================================================================

import type { I18nString } from "@scheniders/shared";
import type { StoreTemplate } from "./types";
import { makeSectionFactory, commercePages } from "./common";
import type { ContentPack } from "./content-packs/types";
import { perfumePack } from "./content-packs/perfume";

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

/**
 * Facts that belong to ONE merchant, never to a niche or a direction:
 * identity assets, legal lines, socials, the customer-message carousel and
 * the store's own legal pages. Absent for every other merchant.
 */
export interface SignatureFacts {
    logo_url: string;
    wordmark_i18n: I18nString;
    review_screenshots: string[];
    address_i18n: I18nString;
    legal: { company_name: string; business_license: string };
    rights_i18n: I18nString;
    social_links: { tiktok?: string; instagram?: string };
    newsletter: { copy_i18n: I18nString; placeholder_i18n: I18nString; button_i18n: I18nString; success_i18n: I18nString };
    contact_page_md_i18n: I18nString;
    policies: {
        policy_shipping: Record<string, unknown>;
        policy_returns: Record<string, unknown>;
        policy_privacy: Record<string, unknown>;
        policy_terms: Record<string, unknown>;
    };
}

/** Customer chat-screenshot carousel shown on the original PDP (site-wide).
 *  Each entry gets a numbered alt so the social proof is announced to
 *  assistive tech instead of being nine empty images. */
const SCHENIDERS_REVIEW_SCREENSHOTS = [
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

/** The store's own legal pages (Arabic only, as published on the original
 *  site). Owned by the template so re-applying it never resets them to the
 *  generic commerce boilerplate. Headings use `## ` so policy_content renders
 *  real sections; contact numbers are links. */
const SCHENIDERS_POLICIES = {
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

export const SCHENIDERS_FACTS: SignatureFacts = {
    logo_url: ASSETS.logo,
    wordmark_i18n: { ar: "شنايدر", en: "Scheniders" },
    review_screenshots: SCHENIDERS_REVIEW_SCREENSHOTS,
    address_i18n: { ar: "العراق - بغداد - زيونة", en: "Iraq - Baghdad - Zayouna" },
    legal: { company_name: "Schnieder - شنايدر", business_license: "310536983500003" },
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
        copy_i18n: {
            ar: "كن أول من يعرف آخر الاخبار عن متجرنا، عند انضمامك ستحصل فورا على كوبون خصم 15% على منتجاتنا.",
            en: "Be the first to hear our news — join and instantly get a 15% coupon.",
        },
        placeholder_i18n: { ar: "ادخل بريدك الالكتروني هنا", en: "Enter your email here" },
        button_i18n: { ar: "اشترك", en: "Subscribe" },
        // Delivers the promised coupon — the WELCOME15 discount code
        // exists in the store's commerce config, so the 15% claim is
        // backed by a real redemption path at checkout.
        success_i18n: {
            ar: "تم الاشتراك! كود الخصم مالتك: WELCOME15",
            en: "You're in! Your discount code: WELCOME15",
        },
    },
    contact_page_md_i18n: {
        // Instagram matches the footer's actual linked account (the original
        // site's contact page typed a different handle than its own footer
        // links — self-consistency won).
        ar: "## معلومات التواصل\n\nرقم الهاتف: [0777 970 3832](tel:+9647779703832)\n\nواتساب: [راسلنا على واتساب](https://wa.me/9647779703832)\n\nانستغرام: [@kawkab.brand](https://www.instagram.com/kawkab.brand/)\n\nالعنوان: العراق - بغداد - زيونة",
        en: "## Contact information\n\nPhone: [0777 970 3832](tel:+9647779703832)\n\nWhatsApp: [Message us on WhatsApp](https://wa.me/9647779703832)\n\nInstagram: [@kawkab.brand](https://www.instagram.com/kawkab.brand/)\n\nAddress: Iraq - Baghdad - Zayouna",
    },
    policies: SCHENIDERS_POLICIES,
};

const TRUST_ICONS = [ASSETS.trustFast, ASSETS.trustQuality, ASSETS.trustIraq, ASSETS.trustCod];
const PILLAR_ICONS = [ASSETS.pillarQuality, ASSETS.pillarValue, ASSETS.pillarEndurance];
const SPOTLIGHT_IMAGES = [ASSETS.catPicked, ASSETS.catTop];
const TRIO_IMAGES = [ASSETS.trioWork, ASSETS.trioOutings, ASSETS.trioOccasions];

const FOOTER_LINKS = [
    { label_i18n: { ar: "تواصل معنا", en: "Contact us" }, href: "/contact" },
    { label_i18n: { ar: "من نحن", en: "Who we are" }, href: "/about" },
    { label_i18n: { ar: "تتبع الطلب", en: "Track your order" }, href: "/track" },
    { label_i18n: { ar: "سياسة الخصوصية", en: "Privacy policy" }, href: "/policies/privacy" },
    { label_i18n: { ar: "الشروط والاحكام", en: "Terms and conditions" }, href: "/policies/terms" },
    { label_i18n: { ar: "سياسة الاسترجاع", en: "Return and refund policy" }, href: "/policies/returns" },
    { label_i18n: { ar: "سياسة الشحن", en: "Shipping policy" }, href: "/policies/shipping" },
];

/** Build the direction from a pack's words (and, for one merchant, its facts). */
export function buildSignatureDirection(pack: ContentPack, facts?: SignatureFacts): StoreTemplate {
    const H = pack.headings ?? perfumePack.headings!;
    const contact = pack.contact ?? perfumePack.contact!;
    const trustTop = pack.trust.map((label_i18n, i) => ({ icon_url: TRUST_ICONS[i], label_i18n }));
    const trustBottom = (pack.trust_bottom ?? pack.trust).map((label_i18n, i) => ({ icon_url: TRUST_ICONS[i], label_i18n }));
    const pillars = (set: typeof pack.pillars) => set.map((p, i) => ({ icon_url: PILLAR_ICONS[i], title_i18n: p.title_i18n, body_i18n: p.body_i18n }));
    const faqAll = [...pack.faq, ...pack.faq_orders];
    const contactHome = { icon_url: ASSETS.mic, ...contact.home, whatsapp_number: "" };
    const contactMore = { icon_url: ASSETS.mic, ...contact.more, whatsapp_number: "" };
    const bestPdp = pack.bestsellers_pdp ?? pack.bestsellers;
    const heroCtas = {
        secondary_cta_kind: "whatsapp",
        secondary_cta_value: "",
        secondary_cta_label_i18n: { ar: "اطلب عبر واتساب", en: "Order on WhatsApp" },
    };
    const testimonials = (eyebrow_i18n: I18nString, title_i18n: I18nString) =>
        s("testimonial_cards", {
            eyebrow_i18n,
            title_i18n,
            side_image_left_url: ASSETS.sideArtLeft,
            side_image_right_url: ASSETS.sideArtRight,
            items: pack.testimonials.map((t) => ({ name_i18n: t.name_i18n, quote_i18n: t.quote_i18n })),
        });
    const faqSplit = (items: typeof faqAll, sub_i18n: I18nString, c: typeof contactHome) =>
        s("faq_contact_split", {
            eyebrow_i18n: H.faq.eyebrow_i18n,
            title_i18n: H.faq.title_i18n,
            sub_i18n,
            row_icon_url: ASSETS.faqRow,
            items,
            contact: c,
        });
    const policyPage = (key: keyof SignatureFacts["policies"]) =>
        facts ? [s("policy_content", { ...facts.policies[key] })] : undefined;

    return {
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
            typography: { display: "Cairo", body: "Cairo", display_ar: "Cairo", body_ar: "Cairo", scale: "comfortable" },
            shape: { radius: "round", border_thickness: "thin", shadow_style: "soft", rotation_intensity: "none" },
            motion: { enabled: true, speed: "normal" },
            voice: { formality: "casual" },
        },
        globals: {
            header: s("site_header", {
                layout: "floating_pill",
                ...(facts ? { wordmark_i18n: facts.wordmark_i18n, logo_image_url: facts.logo_url } : {}),
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
                ...(pack.tagline_i18n ? { tagline_i18n: pack.tagline_i18n } : {}),
                links_heading_i18n: { ar: "معلومات عنا", en: "About us" },
                columns: [{ heading_i18n: { ar: "معلومات عنا", en: "About us" }, links: FOOTER_LINKS }],
                show_cod_badge: false,
                ...(facts
                    ? {
                          // No phone here on purpose: a per-section override wins over
                          // the store's contact settings (helpers/whatsapp), so a stale
                          // number in the template would shadow the merchant's.
                          contact: { address_i18n: facts.address_i18n },
                          legal: facts.legal,
                          rights_i18n: facts.rights_i18n,
                          social_links: facts.social_links,
                          newsletter: { enabled: true, ...facts.newsletter },
                      }
                    : {}),
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
                    headline_i18n: pack.hero.headline_i18n,
                    sub_i18n: pack.hero.sub_i18n,
                    cta_label_i18n: pack.hero.cta_label_i18n,
                    cta_href: "/products",
                    bg_image_url: ASSETS.heroBg,
                    card_align: "end",
                    badge_i18n: undefined,
                    ...heroCtas,
                }),
                s("trust_badge_row", { items: trustTop, band_style: "plain" }),
                s("category_spotlight_pair", {
                    eyebrow_i18n: H.spotlights.eyebrow_i18n,
                    title_i18n: H.spotlights.title_i18n,
                    side_image_left_url: ASSETS.sideArtLeft,
                    side_image_right_url: ASSETS.sideArtRight,
                    items: pack.spotlights.map((c, i) => ({ image_url: SPOTLIGHT_IMAGES[i], label_i18n: c.name_i18n, href: `/categories/${c.slug}` })),
                }),
                s("product_grid", {
                    mode: "auto",
                    // "bestsellers" ranks by the merchant's display_order — the
                    // heading claims best sellers, so the sort must not be "newest".
                    query: { sort: "bestsellers", limit: 8 },
                    card_style: "price_pill",
                    eyebrow_i18n: pack.bestsellers.eyebrow_i18n,
                    heading_i18n: pack.bestsellers.heading_i18n,
                    subheading_i18n: pack.bestsellers.sub_i18n,
                    see_all_label_i18n: H.see_all_i18n,
                    see_all_href: "/products",
                    show_stars: true,
                }),
                s("collection_trio", {
                    eyebrow_i18n: H.collections.eyebrow_i18n,
                    title_i18n: H.collections.title_i18n,
                    items: pack.collections.map((c, i) => ({
                        image_url: TRIO_IMAGES[i],
                        title_i18n: c.title_i18n,
                        sub_i18n: c.sub_i18n,
                        cta_label_i18n: c.cta_label_i18n,
                        href: `/categories/${c.slug}`,
                    })),
                }),
                testimonials(H.testimonials.eyebrow_i18n, H.testimonials.title_i18n),
                s("pillars_grid", {
                    eyebrow_i18n: H.pillars.eyebrow_i18n,
                    title_i18n: H.pillars.title_i18n,
                    items: pillars(pack.pillars),
                }),
                s("about_spotlight", {
                    title_i18n: pack.about.title_i18n,
                    body_i18n: pack.about.body_i18n,
                    cta_label_i18n: { ar: "تعرف أكثر", en: "Learn more" },
                    cta_href: "/about",
                    bg_image_url: ASSETS.aboutBg,
                    overlay_opacity: 0.1,
                }),
                faqSplit(pack.faq, H.faq.sub_i18n, contactHome),
                s("trust_badge_row", { items: trustBottom, band_style: "plain" }),
            ],
            category: [
                s("product_grid", {
                    mode: "auto",
                    query: { sort: "newest", limit: 24 },
                    card_style: "price_pill",
                    heading_i18n: H.catalog_i18n,
                    show_stars: true,
                }),
                s("trust_badge_row", { items: trustBottom, band_style: "plain" }),
            ],
            product: [
                s("pdp_direct_order", {
                    // {count} resolves to the product's REAL approved-review
                    // count at render time; the chip hides when there are none.
                    rating_chip_i18n: { ar: "{count} تقييم من زبائننا", en: "{count} customer reviews" },
                    stock_urgency_i18n: pack.pdp.urgency_i18n,
                    show_gallery: true,
                    feature_cards_title_i18n: pack.pdp.feature_title_i18n,
                    // The COD promise in the shopper's words, right under the CTA.
                    reassurance_i18n: pack.delivery.reassurance_i18n,
                    delivery_sla_i18n: pack.delivery.sla_i18n,
                }),
                s("accordion_richtext", { heading_i18n: undefined, items: pack.pdp_policies }),
                s("trust_badge_row", { items: trustBottom, band_style: "tinted" }),
                // The merchant's customer chat screenshots (site-wide, no names/text);
                // the named testimonial trio lives on the home page only.
                ...(facts && facts.review_screenshots.length
                    ? [
                          s("image_gallery", {
                              heading_i18n: H.reviews_gallery_i18n,
                              layout: "carousel",
                              images: facts.review_screenshots.map((url, i) => ({
                                  url,
                                  alt_i18n: {
                                      ar: `رسالة من زبون ${i + 1} من ${facts.review_screenshots.length}`,
                                      en: `Customer message ${i + 1} of ${facts.review_screenshots.length}`,
                                  },
                              })),
                          }),
                      ]
                    : []),
                // Real per-product customer reviews + submission form.
                s("product_reviews"),
                faqSplit(pack.faq, H.faq.sub_more_i18n, contactMore),
                s("product_grid", {
                    mode: "auto",
                    // The heading claims best sellers, so the sort must be
                    // bestsellers (merchant display order) — not newest. The
                    // grid also excludes the product being viewed.
                    query: { sort: "bestsellers", limit: 8 },
                    card_style: "price_pill",
                    eyebrow_i18n: bestPdp.eyebrow_i18n,
                    heading_i18n: bestPdp.heading_i18n,
                    subheading_i18n: bestPdp.sub_i18n,
                    see_all_label_i18n: H.see_more_i18n,
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
                    headline_i18n: pack.story.title_i18n,
                    sub_i18n: pack.story.body_i18n,
                    cta_label_i18n: { ar: "منتجاتنا", en: "Our products" },
                    cta_href: "/products",
                    card_align: "center",
                    badge_i18n: undefined,
                    ...heroCtas,
                }),
                s("pillars_grid", {
                    eyebrow_i18n: H.pillars_about.eyebrow_i18n,
                    title_i18n: H.pillars_about.title_i18n,
                    // Three distinct promises, one icon each.
                    items: pillars(pack.pillars_about ?? pack.pillars),
                }),
                testimonials(H.testimonials.eyebrow_i18n, H.testimonials.title_i18n),
                faqSplit(pack.faq_orders, H.faq.sub_more_i18n, contactMore),
            ],
            contact: [
                s("faq_contact_split", {
                    eyebrow_i18n: H.contact_page.eyebrow_i18n,
                    title_i18n: H.contact_page.title_i18n,
                    sub_i18n: H.contact_page.sub_i18n,
                    row_icon_url: ASSETS.faqRow,
                    items: pack.faq,
                    contact: contactHome,
                }),
                ...(facts ? [s("policy_content", { body_md_i18n: facts.contact_page_md_i18n })] : []),
                s("trust_badge_row", { items: trustBottom, band_style: "plain" }),
            ],
            faq: [
                // The dedicated FAQ page carries every question the store
                // answers anywhere; the other pages show subsets.
                faqSplit(faqAll, H.faq.sub_i18n, contactHome),
            ],
            ...commercePages(s, { productCardStyle: "price_pill" }),
            ...(facts
                ? {
                      policy_shipping: policyPage("policy_shipping"),
                      policy_returns: policyPage("policy_returns"),
                      policy_privacy: policyPage("policy_privacy"),
                      policy_terms: policyPage("policy_terms"),
                  }
                : {}),
        },
    };
}

/** The registry entry: the flagship look with the perfume pack's words, no merchant facts. */
export const signatureDirection: StoreTemplate = buildSignatureDirection(perfumePack);

/** Scheniders' own store — direction + the merchant's facts. Parity-pinned. */
export const schenidersSignatureTemplate: StoreTemplate = buildSignatureDirection(perfumePack, SCHENIDERS_FACTS);
