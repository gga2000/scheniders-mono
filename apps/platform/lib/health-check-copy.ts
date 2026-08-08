// =====================================================================
// Localized merchant copy for health checks (UX2-02)
// =====================================================================
// The rules engine in @scheniders/shared emits English tech-speak
// messages ("analytics pixel", "OG image", "meta title"). Every surface
// that shows a check to a merchant — the publish sheet, the Health
// screen, the launch checklist — resolves its copy here instead, in
// plain merchant language per locale. Unknown/new checks fall back to
// the engine's English message, so a missing entry degrades gracefully
// rather than hiding a check.
// =====================================================================

import type { EditorString } from "@/lib/editor-i18n";
import type { LocaleCode } from "@scheniders/shared";

export interface CheckCopy {
    message: EditorString;
    fix?: EditorString;
}

export const CHECK_COPY: Record<string, CheckCopy> = {
    /* ── Policies ─────────────────────────────────────────────────── */
    privacy_policy_has_content: {
        message: {
            en: "Privacy policy page is empty — ad platforms require it.",
            ar: "صفحة سياسة الخصوصية فارغة — منصات الإعلانات تتطلبها.",
            ku: "پەڕەی سیاسەتی تایبەتمەندێتی بەتاڵە — پلاتفۆرمەکانی ڕیکلام پێویستیان پێیەتی.",
        },
        fix: { en: "Edit privacy policy", ar: "عدّل سياسة الخصوصية", ku: "سیاسەتی تایبەتمەندێتی دەستکاری بکە" },
    },
    shipping_policy_has_content: {
        message: {
            en: "Shipping policy page is empty — ad platforms require it.",
            ar: "صفحة سياسة الشحن فارغة — منصات الإعلانات تتطلبها.",
            ku: "پەڕەی سیاسەتی گەیاندن بەتاڵە — پلاتفۆرمەکانی ڕیکلام پێویستیان پێیەتی.",
        },
        fix: { en: "Edit shipping policy", ar: "عدّل سياسة الشحن", ku: "سیاسەتی گەیاندن دەستکاری بکە" },
    },
    returns_policy_has_content: {
        message: {
            en: "Returns policy page is empty — ad platforms require it.",
            ar: "صفحة سياسة الإرجاع فارغة — منصات الإعلانات تتطلبها.",
            ku: "پەڕەی سیاسەتی گەڕاندنەوە بەتاڵە — پلاتفۆرمەکانی ڕیکلام پێویستیان پێیەتی.",
        },
        fix: { en: "Edit returns policy", ar: "عدّل سياسة الإرجاع", ku: "سیاسەتی گەڕاندنەوە دەستکاری بکە" },
    },
    terms_has_content: {
        message: {
            en: "Terms & conditions page is empty — ad platforms require it.",
            ar: "صفحة الشروط والأحكام فارغة — منصات الإعلانات تتطلبها.",
            ku: "پەڕەی مەرج و ڕێساکان بەتاڵە — پلاتفۆرمەکانی ڕیکلام پێویستیان پێیەتی.",
        },
        fix: { en: "Edit terms", ar: "عدّل الشروط", ku: "مەرجەکان دەستکاری بکە" },
    },

    /* ── Ad compliance ────────────────────────────────────────────── */
    contact_phone_set: {
        message: {
            en: "No contact phone in the footer — customers and ad platforms look for one.",
            ar: "لا يوجد رقم هاتف في أسفل الموقع — الزبائن ومنصات الإعلانات يبحثون عنه.",
            ku: "ژمارەی تەلەفۆن لە خوارەوەی سایتەکە نییە — کڕیاران و پلاتفۆرمەکانی ڕیکلام بەدوایدا دەگەڕێن.",
        },
        fix: { en: "Add contact phone", ar: "أضف رقم الهاتف", ku: "ژمارەی تەلەفۆن زیاد بکە" },
    },
    whatsapp_number_set: {
        message: {
            en: "No WhatsApp number on your store yet — most Iraqi customers order through it.",
            ar: "لا يوجد رقم واتساب في متجرك بعد — أغلب الزبائن في العراق يطلبون عبره.",
            ku: "هێشتا ژمارەی واتساپ لە فرۆشگاکەت نییە — زۆربەی کڕیارانی عێراق لە ڕێگەیەوە داوا دەکەن.",
        },
        fix: { en: "Add WhatsApp number", ar: "أضف رقم الواتساب", ku: "ژمارەی واتساپ زیاد بکە" },
    },
    pixel_or_gtm_configured: {
        message: {
            en: "No ad tracking set up yet — Facebook/TikTok ads won't be measurable.",
            ar: "لم يتم إعداد تتبّع الإعلانات بعد — لن تتمكن من قياس إعلانات فيسبوك/تيك توك. لا يؤثر على عمل المتجر.",
            ku: "شوێنکەوتنی ڕیکلام هێشتا ڕێکنەخراوە — ناتوانیت ڕیکلامەکانی فەیسبووک/تیکتۆک بپێویت. کاریگەری لەسەر کارکردنی فرۆشگا نییە.",
        },
        fix: { en: "Set up tracking", ar: "إعداد التتبّع", ku: "ڕێکخستنی شوێنکەوتن" },
    },
    og_image_set: {
        message: {
            en: "No share image yet — links to your store will look plain on WhatsApp and social.",
            ar: "لا توجد صورة للمشاركة بعد — روابط متجرك ستظهر بدون صورة عند مشاركتها على واتساب ووسائل التواصل.",
            ku: "هێشتا وێنەی هاوبەشکردن نییە — بەستەرەکانی فرۆشگاکەت بە بێ وێنە دەردەکەون لە واتساپ و سۆشیال میدیا.",
        },
        fix: { en: "Add a share image", ar: "أضف صورة المشاركة", ku: "وێنەی هاوبەشکردن زیاد بکە" },
    },

    /* ── SEO ──────────────────────────────────────────────────────── */
    home_meta_title: {
        message: {
            en: "Home page has no title for Google — search results will look broken.",
            ar: "الصفحة الرئيسية بدون عنوان لغوغل — ستظهر نتائج البحث بشكل غير مكتمل.",
            ku: "پەڕەی سەرەکی ناونیشانی بۆ گووگڵ نییە — ئەنجامەکانی گەڕان ناتەواو دەردەکەون.",
        },
        fix: { en: "Set home title", ar: "أضف عنوان الرئيسية", ku: "ناونیشانی سەرەکی دابنێ" },
    },
    home_meta_description: {
        message: {
            en: "Home page has no description for Google — it will invent one for you.",
            ar: "الصفحة الرئيسية بدون وصف لغوغل — سيؤلّف واحداً بنفسه.",
            ku: "پەڕەی سەرەکی وەسفی بۆ گووگڵ نییە — خۆی یەکێک دادەهێنێت.",
        },
        fix: { en: "Set home description", ar: "أضف وصف الرئيسية", ku: "وەسفی سەرەکی دابنێ" },
    },
    every_page_has_meta_title: {
        message: {
            en: "Some pages have no title for Google.",
            ar: "بعض الصفحات بدون عنوان لغوغل.",
            ku: "هەندێک پەڕە ناونیشانیان بۆ گووگڵ نییە.",
        },
        fix: { en: "Review page titles", ar: "راجع عناوين الصفحات", ku: "ناونیشانی پەڕەکان بپشکنە" },
    },
    important_pages_indexable: {
        message: {
            en: "An important page is hidden from Google (noindex).",
            ar: "صفحة مهمة مخفية عن غوغل (noindex).",
            ku: "پەڕەیەکی گرنگ لە گووگڵ شاراوەتەوە (noindex).",
        },
        fix: { en: "Review visibility", ar: "راجع الظهور", ku: "دەرکەوتن بپشکنە" },
    },
    images_have_alt_text: {
        message: {
            en: "Some images have no description — Google can't read pictures.",
            ar: "بعض الصور بدون وصف — غوغل لا يقرأ الصور.",
            ku: "هەندێک وێنە وەسفیان نییە — گووگڵ ناتوانێت وێنە بخوێنێتەوە.",
        },
        fix: { en: "Add image descriptions", ar: "أضف أوصاف الصور", ku: "وەسفی وێنەکان زیاد بکە" },
    },

    /* ── Identity / trust ─────────────────────────────────────────── */
    business_name_set: {
        message: {
            en: "Store name is empty — set it in Brand Kit.",
            ar: "اسم المتجر فارغ — أضفه من هوية العلامة.",
            ku: "ناوی فرۆشگا بەتاڵە — لە کیتی برێند دایبنێ.",
        },
        fix: { en: "Set store name", ar: "أضف اسم المتجر", ku: "ناوی فرۆشگا دابنێ" },
    },
    tagline_set: {
        message: {
            en: "No tagline yet — one line about what you sell builds trust.",
            ar: "لا يوجد شعار نصي بعد — سطر واحد عمّا تبيعه يبني الثقة.",
            ku: "هێشتا دروشم نییە — یەک دێڕ دەربارەی ئەوەی دەیفرۆشیت متمانە دروست دەکات.",
        },
        fix: { en: "Add tagline", ar: "أضف الشعار", ku: "دروشم زیاد بکە" },
    },
    logo_uploaded: {
        message: {
            en: "No logo uploaded yet.",
            ar: "لم يتم رفع شعار بعد.",
            ku: "هێشتا لۆگۆ بارنەکراوە.",
        },
        fix: { en: "Upload logo", ar: "ارفع الشعار", ku: "لۆگۆ باربکە" },
    },
    favicon_uploaded: {
        message: {
            en: "No favicon — the browser tab will show a generic icon.",
            ar: "لا توجد أيقونة موقع — سيُظهر المتصفح أيقونة عامة في التبويب.",
            ku: "فاڤیکۆن نییە — وێبگەڕ ئایکۆنێکی گشتی لە تابەکەدا پیشان دەدات.",
        },
        fix: { en: "Upload favicon", ar: "ارفع أيقونة الموقع", ku: "فاڤیکۆن باربکە" },
    },
    social_links_set: {
        message: {
            en: "No social links yet — customers check Instagram before buying.",
            ar: "لا توجد روابط تواصل بعد — الزبائن يتفقدون إنستغرام قبل الشراء.",
            ku: "هێشتا بەستەری سۆشیال نییە — کڕیاران پێش کڕین ئینستاگرام دەپشکنن.",
        },
        fix: { en: "Add social links", ar: "أضف روابط التواصل", ku: "بەستەرەکانی سۆشیال زیاد بکە" },
    },

    /* ── Content / conversion ─────────────────────────────────────── */
    home_has_content: {
        message: {
            en: "Your home page has no visible sections — visitors would see an empty store.",
            ar: "صفحتك الرئيسية بدون عناصر ظاهرة — سيرى الزوار متجراً فارغاً.",
            ku: "پەڕەی سەرەکیت هیچ بەشێکی دیاری نییە — سەردانیکەران فرۆشگایەکی بەتاڵ دەبینن.",
        },
        fix: { en: "Build home page", ar: "ابنِ الصفحة الرئيسية", ku: "پەڕەی سەرەکی دروست بکە" },
    },
    home_has_hero: {
        message: {
            en: "Home has no cover section — first impressions start there.",
            ar: "الرئيسية بدون غلاف — الانطباع الأول يبدأ منه.",
            ku: "پەڕەی سەرەکی بەرگی نییە — یەکەم کاریگەری لەوێوە دەستپێدەکات.",
        },
        fix: { en: "Add a cover", ar: "أضف غلافاً", ku: "بەرگ زیاد بکە" },
    },
    home_has_trust_strip: {
        message: {
            en: "No trust strip on home (delivery, COD, returns badges).",
            ar: "لا يوجد شريط ثقة في الرئيسية (توصيل، دفع عند الاستلام، إرجاع).",
            ku: "شریتی متمانە لە سەرەکیدا نییە (گەیاندن، پارەدان لە کاتی وەرگرتن، گەڕاندنەوە).",
        },
        fix: { en: "Add trust strip", ar: "أضف شريط الثقة", ku: "شریتی متمانە زیاد بکە" },
    },
    home_has_product_grid: {
        message: {
            en: "Home doesn't show any products yet.",
            ar: "الرئيسية لا تعرض أي منتجات بعد.",
            ku: "پەڕەی سەرەکی هێشتا هیچ بەرهەمێک پیشان نادات.",
        },
        fix: { en: "Add product grid", ar: "أضف شبكة منتجات", ku: "تۆڕی بەرهەم زیاد بکە" },
    },
    home_has_testimonials: {
        message: {
            en: "No customer reviews on home — social proof sells.",
            ar: "لا توجد آراء زبائن في الرئيسية — آراء الناس تبيع.",
            ku: "هیچ ڕای کڕیار لە سەرەکیدا نییە — ڕای خەڵک فرۆشتن زیاد دەکات.",
        },
        fix: { en: "Add reviews", ar: "أضف الآراء", ku: "ڕاکان زیاد بکە" },
    },
    home_has_newsletter: {
        message: {
            en: "No newsletter signup on home — you're not collecting customer contacts.",
            ar: "لا يوجد اشتراك نشرة في الرئيسية — لا تجمع بيانات تواصل الزبائن.",
            ku: "بەشداری نامەنووسی لە سەرەکیدا نییە — زانیاری پەیوەندی کڕیاران کۆناکەیتەوە.",
        },
        fix: { en: "Add newsletter", ar: "أضف النشرة", ku: "نامەنووسی زیاد بکە" },
    },
    pdp_has_delivery_promise: {
        message: {
            en: "Product pages don't show delivery info — the #1 pre-purchase question in Iraq.",
            ar: "صفحات المنتج لا تعرض معلومات التوصيل — أول سؤال قبل الشراء في العراق.",
            ku: "پەڕەکانی بەرهەم زانیاری گەیاندن پیشان نادەن — یەکەم پرسیاری پێش کڕین لە عێراق.",
        },
        fix: { en: "Add delivery promise", ar: "أضف وعد التوصيل", ku: "بەڵێنی گەیاندن زیاد بکە" },
    },
    cart_has_promo_or_upsell: {
        message: {
            en: "Cart page has no promo or upsell section.",
            ar: "صفحة السلة بدون عرض أو منتجات مقترحة.",
            ku: "پەڕەی سەبەتە بێ ئۆفەر یان بەرهەمی پێشنیارکراوە.",
        },
        fix: { en: "Add to cart page", ar: "أضف إلى صفحة السلة", ku: "بۆ پەڕەی سەبەتە زیادی بکە" },
    },
    at_least_one_testimonial: {
        message: {
            en: "No customer reviews anywhere on the store yet.",
            ar: "لا توجد آراء زبائن في أي مكان بالمتجر بعد.",
            ku: "هێشتا هیچ ڕای کڕیار لە هیچ شوێنێکی فرۆشگادا نییە.",
        },
        fix: { en: "Add reviews", ar: "أضف الآراء", ku: "ڕاکان زیاد بکە" },
    },
    contact_page_populated: {
        message: {
            en: "Contact page is missing details (phone, address or hours).",
            ar: "صفحة الاتصال تنقصها معلومات (هاتف، عنوان أو أوقات دوام).",
            ku: "پەڕەی پەیوەندی زانیاری کەمە (تەلەفۆن، ناونیشان یان کاتەکان).",
        },
        fix: { en: "Edit contact page", ar: "عدّل صفحة الاتصال", ku: "پەڕەی پەیوەندی دەستکاری بکە" },
    },
    at_least_one_image_per_hero: {
        message: {
            en: "A cover section has no image — it will show a colored background only.",
            ar: "أحد أقسام الغلاف بدون صورة — سيظهر بخلفية ملونة فقط.",
            ku: "بەشێکی بەرگ وێنەی نییە — تەنها بە پاشبنەمای ڕەنگاوڕەنگ دەردەکەوێت.",
        },
        fix: { en: "Add cover image", ar: "أضف صورة الغلاف", ku: "وێنەی بەرگ زیاد بکە" },
    },
    every_section_enabled_has_content: {
        message: {
            en: "An enabled section is empty — it renders as a blank block.",
            ar: "قسم مفعّل لكنه فارغ — سيظهر ككتلة بيضاء.",
            ku: "بەشێکی چالاک بەتاڵە — وەک بلۆکێکی سپی دەردەکەوێت.",
        },
        fix: { en: "Fill or hide it", ar: "املأه أو أخفه", ku: "پڕی بکەوە یان بیشارەوە" },
    },
    no_lorem_ipsum: {
        message: {
            en: "Placeholder text is still visible somewhere on your store.",
            ar: "نص تجريبي ما يزال ظاهراً في مكان ما بمتجرك.",
            ku: "دەقی تاقیکاری هێشتا لە شوێنێکی فرۆشگاکەت دیارە.",
        },
        fix: { en: "Replace placeholder", ar: "استبدل النص التجريبي", ku: "دەقی تاقیکاری بگۆڕە" },
    },
    home_section_count_reasonable: {
        message: {
            en: "Home has a lot of sections — trimming to 12 or fewer keeps it fast.",
            ar: "الرئيسية فيها أقسام كثيرة — اختصارها إلى ١٢ أو أقل يحافظ على سرعتها.",
            ku: "پەڕەی سەرەکی بەشی زۆرە — کەمکردنەوەی بۆ ١٢ یان کەمتر خێرایی دەپارێزێت.",
        },
        fix: { en: "Review sections", ar: "راجع الأقسام", ku: "بەشەکان بپشکنە" },
    },
    font_count_reasonable: {
        message: {
            en: "Many different fonts in use — two is usually enough.",
            ar: "خطوط كثيرة مستخدمة — عادةً خطّان يكفيان.",
            ku: "فۆنتی جیاوازی زۆر بەکارهاتووە — بە زۆری دوو فۆنت بەسە.",
        },
        fix: { en: "Review fonts", ar: "راجع الخطوط", ku: "فۆنتەکان بپشکنە" },
    },
    no_dead_cta_links: {
        message: {
            en: "A button points to a page that doesn't exist.",
            ar: "زر يشير إلى صفحة غير موجودة.",
            ku: "دوگمەیەک بۆ پەڕەیەک دەچێت کە بوونی نییە.",
        },
        fix: { en: "Fix button link", ar: "أصلح رابط الزر", ku: "بەستەری دوگمە چاک بکە" },
    },

    /* ── Translations ─────────────────────────────────────────────── */
    translations_complete: {
        message: {
            en: "Some text is missing a translation.",
            ar: "بعض النصوص تنقصها ترجمة.",
            ku: "هەندێک دەق وەرگێڕانیان کەمە.",
        },
        fix: { en: "Open translations", ar: "افتح الترجمات", ku: "وەرگێڕانەکان بکەوە" },
    },
    default_locale_enabled: {
        message: {
            en: "Your default language is disabled in store settings.",
            ar: "اللغة الافتراضية لمتجرك معطّلة في الإعدادات.",
            ku: "زمانی بنەڕەتی فرۆشگاکەت لە ڕێکخستنەکاندا ناچالاکە.",
        },
        fix: { en: "Review languages", ar: "راجع اللغات", ku: "زمانەکان بپشکنە" },
    },
};

/** Localized message for a check, falling back to the engine's English. */
export function checkCopyMessage(
    checkId: string,
    engineMessage: string | undefined,
    locale: LocaleCode,
): string {
    const copy = CHECK_COPY[checkId];
    if (!copy) return engineMessage ?? "";
    return copy.message[locale] ?? copy.message.en;
}

/** Localized fix-button label, falling back to the engine's English label. */
export function checkCopyFixLabel(
    checkId: string,
    engineLabel: string | undefined,
    locale: LocaleCode,
): string | undefined {
    const copy = CHECK_COPY[checkId]?.fix;
    if (!copy) return engineLabel;
    return copy[locale] ?? copy.en;
}
