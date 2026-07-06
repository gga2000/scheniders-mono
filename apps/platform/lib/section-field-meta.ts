// =====================================================================
// Section field meta — localized labels + help for AutoForm fields
// =====================================================================
// AutoForm historically derived field labels by humanizing the schema
// key ("cta_href" → "CTA Href") — English-only developer vocabulary in
// an Arabic-first editor. This module is the label/help channel:
//
//   resolveFieldLabel(sectionType, key, locale)
//     1. per-section override (SECTION_FIELD_META)
//     2. generic dictionary (GENERIC_FIELD_LABELS — ~50 recurring keys)
//     3. the old humanized English key (fallback — never breaks)
//
// Keys are normalized before lookup: lowercased, `_i18n` suffix
// stripped, so `title_i18n` and `title` share one entry.
//
// Help strings are deliberately sparse: only fields whose PURPOSE is
// unclear get help — restating the label as a sentence is noise.
// =====================================================================

import type { LocaleCode } from "@scheniders/shared";
import { t, type EditorString } from "@/lib/editor-i18n";

function normalizeKey(key: string): string {
    return key.toLowerCase().replace(/_i18n$/, "");
}

/* ── Generic labels (shared across all sections) ─────────────────── */

const GENERIC_FIELD_LABELS: Record<string, EditorString> = {
    title: { en: "Title", ar: "العنوان", ku: "ناونیشان" },
    subtitle: { en: "Subtitle", ar: "الوصف المختصر", ku: "ژێرناونیشان" },
    heading: { en: "Heading", ar: "العنوان", ku: "سەردێڕ" },
    subheading: { en: "Subheading", ar: "العنوان الفرعي", ku: "ژێرسەردێڕ" },
    eyebrow: { en: "Small line above the title", ar: "سطر صغير فوق العنوان", ku: "دێڕی بچووک لەسەر ناونیشان" },
    kicker: { en: "Small line above the title", ar: "سطر صغير فوق العنوان", ku: "دێڕی بچووک لەسەر ناونیشان" },
    body: { en: "Text", ar: "النص", ku: "دەق" },
    description: { en: "Description", ar: "الوصف", ku: "وەسف" },
    paragraphs: { en: "Paragraphs", ar: "الفقرات", ku: "بڕگەکان" },
    quote: { en: "Quote", ar: "الاقتباس", ku: "وتە" },
    badge: { en: "Badge", ar: "الشارة", ku: "باج" },
    label: { en: "Label", ar: "التسمية", ku: "ناولێنان" },
    name: { en: "Name", ar: "الاسم", ku: "ناو" },
    city: { en: "City", ar: "المدينة", ku: "شار" },
    rating: { en: "Rating", ar: "التقييم", ku: "هەڵسەنگاندن" },
    question: { en: "Question", ar: "السؤال", ku: "پرسیار" },
    answer: { en: "Answer", ar: "الجواب", ku: "وەڵام" },
    icon: { en: "Icon", ar: "الأيقونة", ku: "ئایکۆن" },
    items: { en: "Items", ar: "العناصر", ku: "بڕگەکان" },
    logos: { en: "Logos", ar: "الشعارات", ku: "لۆگۆکان" },
    images: { en: "Images", ar: "الصور", ku: "وێنەکان" },
    pills: { en: "Pills", ar: "الشارات", ku: "پیلەکان" },
    stats: { en: "Numbers", ar: "الأرقام", ku: "ژمارەکان" },
    features: { en: "Features", ar: "المزايا", ku: "تایبەتمەندییەکان" },
    testimonials: { en: "Customer reviews", ar: "آراء الزبائن", ku: "ڕای کڕیاران" },
    faqs: { en: "Questions & answers", ar: "الأسئلة والأجوبة", ku: "پرسیار و وەڵامەکان" },
    slides: { en: "Slides", ar: "الشرائح", ku: "سلایدەکان" },

    image_url: { en: "Image", ar: "الصورة", ku: "وێنە" },
    image_alt: { en: "Image description (for search engines)", ar: "وصف الصورة (لمحركات البحث)", ku: "وەسفی وێنە (بۆ بزوێنەرەکانی گەڕان)" },
    alt: { en: "Image description", ar: "وصف الصورة", ku: "وەسفی وێنە" },
    video_url: { en: "Video", ar: "الفيديو", ku: "ڤیدیۆ" },
    poster_url: { en: "Video cover image", ar: "صورة غلاف الفيديو", ku: "وێنەی بەرگی ڤیدیۆ" },
    autoplay: { en: "Autoplay", ar: "تشغيل تلقائي", ku: "لێدانی خۆکار" },

    cta_label: { en: "Button text", ar: "نص الزر", ku: "دەقی دوگمە" },
    cta_href: { en: "Button link", ar: "رابط الزر", ku: "بەستەری دوگمە" },
    button_label: { en: "Button text", ar: "نص الزر", ku: "دەقی دوگمە" },
    link_label: { en: "Link text", ar: "نص الرابط", ku: "دەقی بەستەر" },
    link_href: { en: "Link", ar: "الرابط", ku: "بەستەر" },
    href: { en: "Link", ar: "الرابط", ku: "بەستەر" },
    secondary_cta_kind: { en: "Second button type", ar: "نوع الزر الثاني", ku: "جۆری دوگمەی دووەم" },
    secondary_cta_label: { en: "Second button text", ar: "نص الزر الثاني", ku: "دەقی دوگمەی دووەم" },
    secondary_cta_value: { en: "Second button destination", ar: "وجهة الزر الثاني", ku: "ئامانجی دوگمەی دووەم" },
    whatsapp_label: { en: "WhatsApp button text", ar: "نص زر واتساب", ku: "دەقی دوگمەی واتساپ" },
    wa_number: { en: "WhatsApp number", ar: "رقم الواتساب", ku: "ژمارەی واتساپ" },
    whatsapp_number: { en: "WhatsApp number", ar: "رقم الواتساب", ku: "ژمارەی واتساپ" },
    phone: { en: "Phone number", ar: "رقم الهاتف", ku: "ژمارەی تەلەفۆن" },
    email: { en: "Email", ar: "البريد الإلكتروني", ku: "ئیمەیڵ" },

    placeholder: { en: "Placeholder text", ar: "النص التوضيحي داخل الحقل", ku: "دەقی ڕوونکەرەوە" },
    success_message: { en: "Success message", ar: "رسالة النجاح", ku: "پەیامی سەرکەوتن" },

    columns: { en: "Columns", ar: "عدد الأعمدة", ku: "ژمارەی ستوونەکان" },
    cols_mobile: { en: "Columns on phones", ar: "الأعمدة على الهاتف", ku: "ستوونەکان لە مۆبایل" },
    cols_desktop: { en: "Columns on desktop", ar: "الأعمدة على الحاسوب", ku: "ستوونەکان لە کۆمپیوتەر" },
    layout: { en: "Layout", ar: "التخطيط", ku: "ڕووکار" },
    align: { en: "Alignment", ar: "المحاذاة", ku: "ڕیزکردن" },
    density: { en: "Density", ar: "الكثافة", ku: "چڕی" },
    bg: { en: "Background", ar: "الخلفية", ku: "پاشبنەما" },
    tint: { en: "Tint", ar: "درجة اللون", ku: "ڕەنگاڵە" },
    overlay_opacity: { en: "Overlay darkness", ar: "تعتيم الخلفية", ku: "تاریکی پاشبنەما" },

    limit: { en: "How many to show", ar: "عدد العناصر المعروضة", ku: "چەند دانە پیشان بدرێت" },
    source: { en: "Products source", ar: "مصدر المنتجات", ku: "سەرچاوەی بەرهەمەکان" },
    sort: { en: "Sort by", ar: "الترتيب حسب", ku: "ڕیزکردن بەپێی" },
    mode: { en: "Mode", ar: "الطريقة", ku: "شێواز" },
    query: { en: "Search query", ar: "استعلام البحث", ku: "پرسی گەڕان" },
    handle: { en: "Handle", ar: "المعرّف", ku: "ناسێنەر" },
    category_id: { en: "Category", ar: "الفئة", ku: "پۆل" },
    category_slug: { en: "Category", ar: "الفئة", ku: "پۆل" },
    product_ids: { en: "Chosen products", ar: "المنتجات المختارة", ku: "بەرهەمە هەڵبژێردراوەکان" },
    manual_skus: { en: "Product codes (SKU)", ar: "أكواد المنتجات (SKU)", ku: "کۆدی بەرهەمەکان (SKU)" },
    analytics_tag: { en: "Analytics tag", ar: "وسم التحليلات", ku: "تاگی شیکاری" },
    show_prices: { en: "Show prices", ar: "إظهار الأسعار", ku: "نرخەکان پیشان بدە" },
};

/* ── Sparse help — only where the label alone isn't enough ────────── */

const GENERIC_FIELD_HELP: Record<string, EditorString> = {
    eyebrow: { en: "Optional — e.g. your store name or “New”.", ar: "اختياري — مثلاً اسم متجرك أو «جديد».", ku: "ئارەزوومەندانە — بۆ نموونە ناوی فرۆشگاکەت یان «نوێ»." },
    cta_href: { en: "Where the button takes the visitor, e.g. /products.", ar: "إلى أين يأخذ الزر الزائر، مثال: ‎/products.", ku: "دوگمەکە سەردانیکەر بۆ کوێ دەبات، نموونە: ‎/products." },
    image_alt: { en: "Describe the image in a few words — helps Google find you.", ar: "صف الصورة بكلمات قليلة — يساعد غوغل على إيجادك.", ku: "بە چەند وشەیەک وێنەکە وەسف بکە — یارمەتی گووگڵ دەدات بتدۆزێتەوە." },
    manual_skus: { en: "Comma-separated product codes from your Products page.", ar: "أكواد منتجات مفصولة بفواصل من صفحة المنتجات.", ku: "کۆدی بەرهەمەکان بە کۆما جیاکراوە لە پەڕەی بەرهەمەکان." },
    analytics_tag: { en: "Optional — a name for tracking clicks on this section.", ar: "اختياري — اسم لتتبّع النقرات على هذا القسم.", ku: "ئارەزوومەندانە — ناوێک بۆ شوێنکەوتنی کلیکەکان لەم بەشە." },
    limit: { en: "Maximum number of products shown in this section.", ar: "أقصى عدد منتجات يظهر في هذا القسم.", ku: "زۆرترین ژمارەی بەرهەم کە لەم بەشەدا دەردەکەوێت." },
    overlay_opacity: { en: "Higher = darker image, easier-to-read text.", ar: "أعلى = صورة أغمق ونص أوضح.", ku: "بەرزتر = وێنەی تاریکتر و دەقی ڕوونتر." },
};

/* ── Per-section overrides (labels that need section context) ─────── */

const SECTION_FIELD_META: Record<
    string,
    Record<string, { label?: EditorString; help?: EditorString }>
> = {
    // (seed as needed — generic labels cover the common catalog today)
};

/* ── Enum value labels (segmented controls / selects) ─────────────── */

const ENUM_VALUE_LABELS: Record<string, EditorString> = {
    whatsapp: { en: "WhatsApp", ar: "واتساب", ku: "واتساپ" },
    call: { en: "Call", ar: "اتصال", ku: "پەیوەندی" },
    none: { en: "None", ar: "بدون", ku: "هیچ" },
    category_link: { en: "Category link", ar: "رابط فئة", ku: "بەستەری پۆل" },
    grid: { en: "Grid", ar: "شبكة", ku: "تۆڕ" },
    list: { en: "List", ar: "قائمة", ku: "لیست" },
    carousel: { en: "Carousel", ar: "شريط متحرك", ku: "کارۆسێل" },
    left: { en: "Left", ar: "يسار", ku: "چەپ" },
    right: { en: "Right", ar: "يمين", ku: "ڕاست" },
    center: { en: "Center", ar: "وسط", ku: "ناوەند" },
    auto: { en: "Automatic", ar: "تلقائي", ku: "خۆکار" },
    manual: { en: "Manual", ar: "يدوي", ku: "دەستی" },
    mix: { en: "Mix", ar: "مزيج", ku: "تێکەڵ" },
    newest: { en: "Newest", ar: "الأحدث", ku: "نوێترین" },
    bestsellers: { en: "Bestsellers", ar: "الأكثر مبيعاً", ku: "زۆرترین فرۆش" },
    featured: { en: "Featured", ar: "المميزة", ku: "تایبەتەکان" },
    sale: { en: "On sale", ar: "التخفيضات", ku: "داشکاندن" },
};

/* ── Resolvers ─────────────────────────────────────────────────────── */

/** The legacy humanizer — kept as the universal fallback. */
export function humanizeFieldKey(key: string): string {
    if (!key || key === "root") return "";
    return key
        .replace(/_i18n$/g, "")
        .replace(/_/g, " ")
        .replace(/\bid\b/gi, "ID")
        .replace(/\bcta\b/gi, "CTA")
        .replace(/\burl\b/gi, "URL")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function resolveFieldLabel(
    sectionType: string | undefined,
    key: string,
    locale: LocaleCode,
): string {
    if (!key || key === "root") return "";
    const norm = normalizeKey(key);
    const sectionMeta = sectionType
        ? SECTION_FIELD_META[sectionType]?.[norm]?.label
        : undefined;
    if (sectionMeta) return t(sectionMeta, locale);
    const generic = GENERIC_FIELD_LABELS[norm];
    if (generic) return t(generic, locale);
    return humanizeFieldKey(key);
}

export function resolveFieldHelp(
    sectionType: string | undefined,
    key: string,
    locale: LocaleCode,
): string | null {
    const norm = normalizeKey(key);
    const sectionMeta = sectionType
        ? SECTION_FIELD_META[sectionType]?.[norm]?.help
        : undefined;
    if (sectionMeta) return t(sectionMeta, locale);
    const generic = GENERIC_FIELD_HELP[norm];
    return generic ? t(generic, locale) : null;
}

/** Localized label for an enum OPTION value ("whatsapp" → «واتساب»). */
export function resolveEnumValueLabel(value: string, locale: LocaleCode): string {
    const entry = ENUM_VALUE_LABELS[value.toLowerCase()];
    if (entry) return t(entry, locale);
    return humanizeFieldKey(value);
}

/* ── Conditional fields (UX-18) ────────────────────────────────────
 * Convention: a `<base>_kind` enum controls its `<base>_value` /
 * `<base>_label(_i18n)` dependents. When the kind is "none" (or unset)
 * the dependents are meaningless — hide them instead of showing a
 * WhatsApp-label input for a button that doesn't exist.
 */
export function isFieldEnabledBySiblings(
    key: string,
    siblings: Record<string, unknown> | undefined,
): boolean {
    if (!siblings) return true;
    const m = /^(.+)_(value|label|label_i18n)$/.exec(key);
    if (!m) return true;
    const kindKey = `${m[1]}_kind`;
    if (!(kindKey in siblings)) return true;
    const kind = siblings[kindKey];
    return kind !== undefined && kind !== "" && kind !== "none";
}
