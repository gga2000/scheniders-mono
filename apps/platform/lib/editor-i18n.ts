// =====================================================================
// Editor i18n — Builder v2 chrome strings
// =====================================================================
// Localizes the EDITOR CHROME (page tree, section list, edit panel,
// publish/save state, settings screens). Storefront content is locale-
// driven via I18nString already; this module covers the surrounding UI.
//
// Constraints:
//   - LTR only — the layout never flips, even for Arabic. We localize
//     the TEXT, not the direction.
//   - Iraq market: Arabic primary, English secondary, Kurdish (Sorani)
//     tertiary.
//   - Each entry MUST have an `en` string. `ar`/`ku` are best-effort.
//     Translations the author was not confident on are marked
//     `// TODO(ar)` / `// TODO(ku)` and intentionally left equal to en.
//
// `t(s, locale)` resolves the requested locale, falling back to `en`,
// then to the first defined value. Use `{n}` style placeholders and
// substitute via your own template helper at the call site, OR use
// `tFormat(s, locale, vars)` for simple `{key}` interpolation.
// =====================================================================

import type { LocaleCode } from "@scheniders/shared";

export type EditorString = Record<LocaleCode, string>;

/* ─────────────────────────────────────────────────────────────────── */
/* Resolver                                                             */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Resolve an editor string for the given locale.
 *
 * Resolution order:
 *   1. requested locale, if non-empty
 *   2. English fallback, if non-empty
 *   3. first non-empty value in the record (deterministic order: en, ar, ku)
 *   4. empty string (should be unreachable — every key has at least `en`)
 */
export function t(s: EditorString | undefined, locale: LocaleCode): string {
    if (!s) return "";
    const direct = s[locale];
    if (typeof direct === "string" && direct.length > 0) return direct;
    const en = s.en;
    if (typeof en === "string" && en.length > 0) return en;
    // Last-resort scan, deterministic order.
    const order: LocaleCode[] = ["en", "ar", "ku"];
    for (const code of order) {
        const v = s[code];
        if (typeof v === "string" && v.length > 0) return v;
    }
    return "";
}

/**
 * Like `t()` but with `{key}` interpolation. Unmatched placeholders are
 * left in the output so they surface as bugs in QA instead of silently
 * disappearing.
 */
export function tFormat(
    s: EditorString | undefined,
    locale: LocaleCode,
    vars: Record<string, string | number>,
): string {
    const raw = t(s, locale);
    return raw.replace(/\{(\w+)\}/g, (_, key: string) =>
        Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`,
    );
}

/**
 * "N sections" with the right Arabic number form: لا أقسام, قسم واحد,
 * قسمان, 3–10 أقسام, 11+ قسماً. One helper so every count in the editor reads alike.
 */
export function sectionCount(n: number, locale: LocaleCode): string {
    if (n === 0) return locale === "ar" ? "لا أقسام" : locale === "ku" ? "هیچ بەشێک" : "No sections";
    if (locale === "ar") {
        if (n === 1) return "قسم واحد";
        if (n === 2) return "قسمان";
        if (n >= 3 && n <= 10) return `${n} أقسام`;
        return `${n} قسماً`;
    }
    if (locale === "ku") return `${n} بەش`;
    return n === 1 ? "1 section" : `${n} sections`;
}

/* ─────────────────────────────────────────────────────────────────── */
/* STRINGS — grouped by editor area                                     */
/* ─────────────────────────────────────────────────────────────────── */
//
// Naming: `area.snake_case_key`. Each value is `EditorString`. When
// you're not confident in a translation, leave the foreign value equal
// to `en` and add a `// TODO(ar)` / `// TODO(ku)` comment so we can
// audit untranslated strings via the test below.
//
// NOTE: TODO comment count is asserted by editor-i18n.test.ts. If you
// add new TODOs, bump the expected count in the test as well.
// =====================================================================

export const STRINGS = {
    /* ── Page tree (left rail) ─────────────────────────────────── */
    page_tree: {
        aria_label: { en: "Page tree", ar: "شجرة الصفحات", ku: "دارچەی پەڕەکان" },
        settings_heading: { en: "Settings", ar: "الإعدادات", ku: "ڕێکخستنەکان" },
        advanced_heading: { en: "Advanced", ar: "متقدم", ku: "پێشکەوتوو" },
        advanced_live_chip: { en: "Active advanced settings — view", ar: "إعدادات متقدمة نشطة — اعرضها", ku: "ڕێکخستنە پێشکەوتووە چالاکەکان — بیانبینە" },
        coming_soon: { en: "soon", ar: "قريباً", ku: "بەم زووانە" },
        // Page groups
        group_storefront: { en: "Storefront", ar: "المتجر", ku: "فرۆشگا" },
        group_shop: { en: "Shop", ar: "التسوق", ku: "کڕین" },
        group_order: { en: "Order", ar: "الطلب", ku: "داواکاری" },
        group_pages: { en: "Pages", ar: "الصفحات", ku: "پەڕەکان" },
        group_policies: { en: "Policies", ar: "السياسات", ku: "ڕێسـاکان" },
        group_system: { en: "System", ar: "النظام", ku: "سیستەم" },
        // Simple-mode collapsed page groups (S3-03): tFormat {n}
        all_pages: { en: "More pages ({n})", ar: "صفحات أخرى ({n})", ku: "پەڕەی تر ({n})" },
        // Setup mode: while the setup guide runs the basics, the rail shows
        // only the two screens the basics need and locks the rest.
        setup_heading: { en: "Set up your shop", ar: "جهّز محلك", ku: "فرۆشگاکەت ئامادە بکە" },
        setup_locked: { en: "Opens after the basics", ar: "تنفتح بعد الأساس", ku: "دوای بنەڕەتەکان دەکرێتەوە" },
        setup_locked_pages: { en: "Pages", ar: "الصفحات", ku: "پەڕەکان" },
        setup_locked_offers: { en: "Discounts and offers", ar: "الخصومات والعروض", ku: "داشکاندن و پێشکەشکراوەکان" },
        setup_locked_tracking: { en: "Pixels and ads", ar: "البكسل والإعلانات", ku: "پیکسڵ و ڕیکلام" },
        setup_locked_advanced: { en: "Advanced mode", ar: "الوضع المتقدم", ku: "دۆخی پێشکەوتوو" },
        // Pages
        page_home: { en: "Home", ar: "الرئيسية", ku: "ماڵەوە" },
        page_category: { en: "Category", ar: "الفئة", ku: "پۆل" },
        page_product: { en: "Product page", ar: "صفحة المنتج", ku: "پەڕەی بەرهەم" },
        page_search: { en: "Search", ar: "البحث", ku: "گەڕان" },
        page_cart: { en: "Cart", ar: "السلة", ku: "سەبەتە" },
        page_checkout: { en: "Checkout", ar: "إتمام الطلب", ku: "پارەدان" },
        page_checkout_success: { en: "Order confirmed", ar: "تأكيد الطلب", ku: "داواکاری پشتڕاستکرایەوە" },
        page_track: { en: "Track order", ar: "تتبع الطلب", ku: "بەدواداچوونی داواکاری" },
        page_about: { en: "About", ar: "من نحن", ku: "دەربارە" },
        page_faq: { en: "FAQ", ar: "الأسئلة الشائعة", ku: "پرسیارە باوەکان" },
        page_contact: { en: "Contact", ar: "تواصل معنا", ku: "پەیوەندی" },
        page_policy_shipping: { en: "Shipping policy", ar: "سياسة التوصيل", ku: "سیاسەتی گەیاندن" },
        page_policy_returns: { en: "Returns policy", ar: "سياسة الإرجاع", ku: "سیاسەتی گەڕاندنەوە" },
        page_policy_privacy: { en: "Privacy policy", ar: "سياسة الخصوصية", ku: "سیاسەتی تایبەتمەندێتی" },
        page_policy_terms: { en: "Terms", ar: "الشروط والأحكام", ku: "مەرجەکانی خزمەتگوزاری" },
        page_not_found: { en: "Page not found", ar: "صفحة غير موجودة", ku: "پەڕە نەدۆزرایەوە" },
        // Settings
        setting_brand_kit: { en: "Style & branding", ar: "هوية العلامة", ku: "کیتی برێند" },
        setting_health: { en: "Store health", ar: "صحة المتجر", ku: "تەندروستی فرۆشگا" },
        setting_i18n: { en: "Languages", ar: "اللغات", ku: "زمانەکان" },
        setting_segments: { en: "Audiences", ar: "الجمهور", ku: "بینەران" },
        setting_experiments: { en: "Tests", ar: "الاختبارات", ku: "تاقیکردنەوەکان" },
        setting_scheduled: { en: "Scheduled changes", ar: "التغييرات المجدولة", ku: "خشتەکراو" },
        setting_shipping: { en: "Delivery fees", ar: "أجور التوصيل", ku: "کرێی گەیاندن" },
        setting_discounts: { en: "Discount codes", ar: "أكواد الخصم", ku: "کۆدی داشکاندن" },
        setting_cart_recovery: { en: "Cart recovery", ar: "استرجاع السلات", ku: "گەڕاندنەوەی سەبەتە" },
        setting_bundles: { en: "Bundles", ar: "الحزم", ku: "پاکێجەکان" },
        setting_pixels: { en: "Pixels & tracking", ar: "البكسلات والتتبّع", ku: "پیکسڵ و شوێنکەوتن" },
        setting_loyalty: { en: "Loyalty points", ar: "نقاط الولاء", ku: "خاڵی دڵسۆزی" },
        setting_order_status: { en: "Order tracking messages", ar: "رسائل تتبّع الطلب", ku: "پەیامەکانی شوێنکەوتنی داواکاری" },
        setting_free_gift: { en: "Free gift", ar: "الهدية المجانية", ku: "دیاری بەخۆڕایی" },
        setting_template_updates: { en: "Template updates", ar: "تحديثات القالب", ku: "نوێکارییەکانی ڕووکار" },
        setting_custom_pages: { en: "Custom pages", ar: "صفحات مخصّصة", ku: "پەڕە تایبەتەکان" },
        setting_nav: { en: "Navigation", ar: "التنقّل", ku: "ڕێنیشاندان" },
        setting_versions: { en: "Version history", ar: "سجل التغييرات", ku: "مێژووی گۆڕانکارییەکان" },
        setting_redirects: { en: "Redirects", ar: "إعادة التوجيه", ku: "ئاراستەکردن" },
        group_custom_pages: { en: "Custom pages", ar: "صفحات مخصّصة", ku: "پەڕە تایبەتەکان" },
        manage_custom_pages: { en: "Manage custom pages", ar: "إدارة الصفحات المخصّصة", ku: "بەڕێوەبردنی پەڕە تایبەتەکان" },
        add_custom_page: { en: "Add custom page", ar: "إضافة صفحة مخصّصة", ku: "زیادکردنی پەڕەی تایبەت" },
    },

    /* ── Section list panel (Inspector "Blocks" tab) ───────────── */
    section_list: {
        heading: { en: "Sections", ar: "الأقسام", ku: "بەشەکان" },
        aria_label: { en: "Page sections", ar: "أقسام الصفحة", ku: "بەشەکانی پەڕە" },
        templates_button: { en: "Template", ar: "قالب", ku: "قاڵب" },
        templates_title: { en: "Start from a page template", ar: "ابدأ من قالب صفحة", ku: "لە قاڵبی پەڕەوە دەستپێبکە" },
        empty_state_prefix: { en: "No sections yet. Click", ar: "لا توجد أقسام بعد. اضغط", ku: "هێشتا هیچ بەشێک نییە. کلیک بکە" },
        empty_state_add: { en: "+ Add section", ar: "+ إضافة قسم", ku: "+ زیادکردنی بەش" },
        // tFormat: {page} is the page label, possibly empty
        empty_state_suffix_named: { en: "to start building “{page}”.", ar: "لتبدأ بناء “{page}”.", ku: "بۆ دەستپێکردنی دروستکردنی “{page}”." },
        empty_state_suffix_unnamed: { en: "to start building this page.", ar: "لتبدأ بناء هذه الصفحة.", ku: "بۆ دەستپێکردنی دروستکردنی ئەم پەڕەیە." },
        empty_first_button: { en: "Add your first section", ar: "أضف أول قسم", ku: "یەکەم بەشت زیاد بکە" },
        empty_template_button: { en: "Start from a template", ar: "ابدأ من قالب", ku: "لە قاڵبێکەوە دەستپێبکە" },
        // On-canvas empty-page card (the canvas itself, not the rail)
        canvas_empty_title: { en: "This page is empty", ar: "هذه الصفحة فارغة", ku: "ئەم پەڕەیە بەتاڵە" },
        canvas_empty_hint: { en: "Add a section or start from a ready-made template — you can change everything later.", ar: "أضف قسماً أو ابدأ من قالب جاهز — يمكنك تغيير كل شيء لاحقاً.", ku: "بەشێک زیاد بکە یان لە قاڵبێکی ئامادەوە دەستپێبکە — دەتوانی دواتر هەموو شتێک بگۆڕیت." },
        canvas_empty_hint_no_templates: { en: "Add a section to build this page — you can change everything later.", ar: "أضف قسماً لبناء هذه الصفحة — يمكنك تغيير كل شيء لاحقاً.", ku: "بەشێک زیاد بکە بۆ دروستکردنی ئەم پەڕەیە — دەتوانی دواتر هەموو شتێک بگۆڕیت." },
        add_button: { en: "Add section", ar: "إضافة قسم", ku: "زیادکردنی بەش" },
        // Row actions
        row_drag: { en: "Drag to reorder", ar: "اسحب لإعادة الترتيب", ku: "ڕایبکێشە بۆ ڕێکخستنەوە" },
        row_collapse: { en: "Collapse section", ar: "طي القسم", ku: "بەشەکە دابخە" },
        row_expand: { en: "Expand section", ar: "توسيع القسم", ku: "بەشەکە بکەرەوە" },
        row_hide: { en: "Hide section", ar: "إخفاء القسم", ku: "بەشەکە بشارەوە" },
        row_show: { en: "Show section", ar: "إظهار القسم", ku: "بەشەکە پیشانبدە" },
        row_more: { en: "More section options", ar: "خيارات إضافية للقسم", ku: "هەڵبژاردنی زیاتری بەش" },
        row_collapse_label: { en: "Collapse", ar: "طي", ku: "داخستن" },
        row_edit_label: { en: "Edit", ar: "تعديل", ku: "دەستکاری" },
        row_duplicate: { en: "Duplicate", ar: "تكرار", ku: "لەبەرگرتنەوە" },
        row_save_preset: { en: "Save as preset", ar: "حفظ كقالب جاهز", ku: "هەڵیبگرە وەکو قاڵبی ئامادە" },
        row_delete: { en: "Delete", ar: "حذف", ku: "سڕینەوە" },
        // Delete-toast (uses tFormat: {name})
        toast_deleted: { en: "“{name}” deleted", ar: "تم حذف «{name}»", ku: "“{name}” سڕایەوە" },
        toast_undo_hint: { en: "Undo within 5 seconds to bring it back.", ar: "تراجع خلال 5 ثوانٍ لاستعادته.", ku: "لە ماوەی ٥ چرکەدا پاشگەزبوەوە بۆ گەڕاندنەوەی." },
        toast_undo: { en: "Undo", ar: "تراجع", ku: "پاشگەزبوەوە" },
    },

    /* ── Section edit panel (inline AutoForm host) ─────────────── */
    section_edit: {
        close: { en: "Close edit panel", ar: "إغلاق لوحة التعديل", ku: "داخستنی پانێڵی دەستکاری" },
        label_field: { en: "Section label", ar: "اسم القسم", ku: "ناوی بەش" },
        // tFormat: {name} is the canonical section name
        label_placeholder: { en: "e.g. Summer sale", ar: "مثال: تخفيضات الصيف", ku: "نموونە: فرۆشتنی هاوین" },
        label_hint: { en: "Shown only in the editor — doesn’t affect the storefront.", ar: "يظهر فقط في المحرر — لا يؤثر على المتجر.", ku: "تەنیا لە دەستکاریکەردا دەردەکەوێت — کاریگەری لەسەر فرۆشگا نییە." },
        tab_properties: { en: "Properties", ar: "الخصائص", ku: "تایبەتمەندی" },
        tab_visibility: { en: "Visibility", ar: "الظهور", ku: "دەرکەوتن" },
        tab_variants: { en: "Variants", ar: "الاختلافات", ku: "جیاوازی" },
        // tFormat: {type}
        missing_schema: { en: "No schema registered for “{type}”.", ar: "لا يوجد مخطط مسجّل لـ “{type}”.", ku: "هیچ نەخشەیەک تۆمارنەکراوە بۆ “{type}”." },
        visibility_empty: { en: "Always visible — add a rule to hide conditionally.", ar: "ظاهر دائماً — أضف قاعدة لإخفائه شرطياً.", ku: "هەمیشە دیارە — ڕێسایەک زیاد بکە بۆ شاردنەوەی بە مەرج." },
        visibility_kind_locale: { en: "Language", ar: "اللغة", ku: "زمان" },
        visibility_kind_breakpoint: { en: "Device", ar: "الجهاز", ku: "ئامێر" },
        visibility_kind_time_window: { en: "Schedule", ar: "الجدولة", ku: "خشتە" },
        visibility_kind_audience: { en: "Audience", ar: "الجمهور", ku: "بەش" },
        visibility_kind_governorate: { en: "Governorate", ar: "المحافظة", ku: "پارێزگا" },
        visibility_kind_page: { en: "Page", ar: "الصفحة", ku: "پەڕە" },
        // Property-group headers (AutoForm Essentials/Style/Logic split)
        group_essentials: { en: "Essentials", ar: "الأساسيات", ku: "بنەڕەتییەکان" },
        group_style: { en: "Style", ar: "التصميم", ku: "شێواز" },
        group_logic: { en: "Wiring", ar: "الإعدادات", ku: "ڕێکخستن" },
    },

    /* ── Section picker (modal "Add a section") ────────────────── */
    section_picker: {
        title_default: { en: "Add a section", ar: "إضافة قسم", ku: "زیادکردنی بەش" },
        // tFormat: {page}
        title_with_page: { en: "Add a section to {page}", ar: "إضافة قسم إلى {page}", ku: "زیادکردنی بەش بۆ {page}" },
        subtitle: { en: "After adding, click any section to edit it.", ar: "بعد الإضافة، اضغط على أي قسم لتعديله.", ku: "دوای زیادکردن، کلیک لە هەر بەشێک بکە بۆ دەستکاری." },
        close: { en: "Close section picker", ar: "إغلاق قائمة الأقسام", ku: "داخستنی هەڵبژێرەری بەش" },
        tab_library: { en: "Library", ar: "المكتبة", ku: "کتێبخانە" },
        // tFormat: {count}
        tab_presets: { en: "Saved presets ({count})", ar: "القوالب المحفوظة ({count})", ku: "قاڵبە پاشەکەوتکراوەکان ({count})" },
        tab_presets_zero: { en: "Saved presets", ar: "القوالب المحفوظة", ku: "قاڵبە پاشەکەوتکراوەکان" },
        search_placeholder: { en: "Search sections...", ar: "ابحث عن الأقسام...", ku: "گەڕان بۆ بەشەکان..." },
        category_all: { en: "All", ar: "الكل", ku: "هەموو" },
        recent_heading: { en: "Recently used", ar: "المستخدمة مؤخراً", ku: "بەم دواییانە بەکارهاتوو" },
        empty_search: { en: "No sections match your search.", ar: "لا توجد أقسام تطابق بحثك.", ku: "هیچ بەشێک لەگەڵ گەڕانەکەت ناگونجێت." },
        not_for_page: { en: "Not for this page", ar: "غير متاح لهذه الصفحة", ku: "بۆ ئەم پەڕەیە نییە" },
        add_chip: { en: "+ Add", ar: "+ إضافة", ku: "+ زیادکردن" },
        // tFormat: {name}
        card_add_title: { en: "Add {name}", ar: "إضافة {name}", ku: "زیادکردنی {name}" },
        card_invalid_title: { en: "{name} can't be placed on this page", ar: "{name} لا يمكن وضعه في هذه الصفحة", ku: "{name} ناتوانرێت لەم پەڕەیەدا دابنرێت" },
        presets_empty_title: { en: "No saved presets yet", ar: "لا توجد قوالب محفوظة بعد", ku: "هێشتا هیچ قاڵبێکی پاشەکەوتکراو نییە" },
        presets_empty_hint_simple: { en: "Switch to advanced mode, then choose “Save as preset” from any section’s menu to reuse it here.", ar: "انتقل إلى الوضع المتقدم، ثم اختر «حفظ كقالب جاهز» من قائمة أي قسم لاستخدامه هنا.", ku: "بگۆڕە بۆ دۆخی پێشکەوتوو، پاشان “هەڵیبگرە وەکو قاڵبی ئامادە” لە مێنیوی هەر بەشێک هەڵبژێرە." },
        presets_go_advanced: { en: "Switch to advanced mode", ar: "انتقل إلى الوضع المتقدم", ku: "بگۆڕە بۆ دۆخی پێشکەوتوو" },
        presets_empty_hint: { en: "Configure any section on a page, then choose “Save as preset” from its menu to reuse it here.", ar: "اضبط أي قسم في صفحة، ثم اختر «حفظ كقالب جاهز» من قائمته لاستخدامه هنا.", ku: "هەر بەشێک لە پەڕەیەکدا ڕێکبخە، پاشان “هەڵیبگرە وەکو قاڵبی ئامادە” لە مێنیوەکەی هەڵبژێرە بۆ بەکارهێنانەوەی لێرە." },
        // tFormat: {name}
        delete_preset_aria: { en: "Delete preset {name}", ar: "حذف القالب {name}", ku: "سڕینەوەی قاڵبی {name}" },
        delete_preset_title: { en: "Delete this preset?", ar: "حذف هذا القالب؟", ku: "ئەم قاڵبە بسڕیتەوە؟" },
        delete_preset_description: { en: "“{name}” will be removed from your preset library. Sections you've already added from it are unaffected.", ar: "“{name}” سيتم حذفه من مكتبة القوالب. الأقسام التي أضفتها منه لن تتأثر.", ku: "“{name}” لە کتێبخانەی قاڵبەکانتدا دەسڕێتەوە. ئەو بەشانەی پێشتر زیادتکردوون کاریگەرییان لەسەر ناکەوێت." },
        delete_preset_cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوەوە" },
        delete_preset_confirm: { en: "Delete preset", ar: "حذف القالب", ku: "سڕینەوەی قاڵب" },
    },

    /* ── Variant list / editor / wizard ────────────────────────── */
    // NOTE: merchant-facing language uses "version" not "variant", "when"
    // not "condition", "different value" not "override". Keys keep their
    // legacy names for code stability but the strings have been rewritten.
    variant: {
        heading: { en: "Versions", ar: "النسخ", ku: "وەشانەکان" },
        add: { en: "New version", ar: "نسخة جديدة", ku: "وەشانی نوێ" },
        empty_hint: { en: "No versions yet. Versions let you show this section differently — by date, device, city, language, or as an A/B test.", ar: "لا توجد نسخ بعد. تتيح لك النسخ عرض هذا القسم بشكل مختلف — حسب التاريخ أو الجهاز أو المدينة أو اللغة أو كتجربة تقارن بين نسختين.", ku: "هێشتا هیچ وەشانێک نییە. وەشانەکان ڕێگەت دەدەن ئەم بەشە بە جیاوازی پیشانبدەیت — بەپێی بەروار، ئامێر، شار، زمان، یان وەکو تاقیکردنەوەی A/B." },
        empty_first_button: { en: "Add your first version", ar: "أضف أول نسخة", ku: "یەکەم وەشانت زیاد بکە" },
        row_drag: { en: "Drag to reorder", ar: "اسحب لإعادة الترتيب", ku: "ڕایبکێشە بۆ ڕێکخستنەوە" },
        row_enabled: { en: "On", ar: "تشغيل", ku: "هەڵکراو" },
        row_disabled: { en: "Off", ar: "إيقاف", ku: "کوژاوەتەوە" },
        row_edit: { en: "Edit version", ar: "تعديل النسخة", ku: "دەستکاری وەشان" },
        row_delete: { en: "Delete version", ar: "حذف النسخة", ku: "سڕینەوەی وەشان" },
        row_expand: { en: "Edit on the row", ar: "تعديل في الصف", ku: "دەستکاری لە ڕیزدا" },
        row_collapse: { en: "Close inline editor", ar: "إغلاق التعديل المضمّن", ku: "داخستنی دەستکاری لەناوەوە" },
        // tFormat: {label}
        delete_confirm: { en: "Delete version \"{label}\"? This cannot be undone.", ar: "حذف النسخة \"{label}\"؟ لا يمكن التراجع.", ku: "وەشانی \"{label}\" بسڕیتەوە؟ ناتوانرێت پاشگەزبیتەوە." },
        overrides_prefix: { en: "Different value:", ar: "قيمة مختلفة:", ku: "بەهای جیاواز:" },
        untitled: { en: "Untitled version", ar: "نسخة بدون عنوان", ku: "وەشانی بێ ناونیشان" },

        // "When" — replaces "condition" / "rule type" merchant-side
        when_heading: { en: "When", ar: "متى", ku: "کاتێک" },
        rule_type: { en: "Rule type", ar: "نوع القاعدة", ku: "جۆری ڕێسا" },
        order_label: { en: "Order", ar: "الترتيب", ku: "ڕیزبەندی" },
        order_hint: { en: "Top wins when multiple versions match", ar: "تفوز النسخة الأعلى عند تطابق عدة نسخ", ku: "ئەو وەشانە سەرکەوتوو دەبێت کە لە سەرەوەیە، کاتێک چەند وەشانێک یەکدەگرنەوە" },
        different_value: { en: "Different value", ar: "قيمة مختلفة", ku: "بەهای جیاواز" },
        different_value_pick: { en: "Pick which fields are different in this version. Other fields stay the same as the base.", ar: "اختر الحقول التي تختلف في هذه النسخة. تبقى الحقول الأخرى كما هي في الأساس.", ku: "ئەو خانانە هەڵبژێرە کە لەم وەشانەدا جیاوازن. خانە کانی تر وەک بنەڕەت دەمێننەوە." },
        different_value_add: { en: "Different value", ar: "قيمة مختلفة", ku: "بەهای جیاواز" },
        different_value_empty: { en: "No different values yet. Use \"+ Different value\" to pick fields that should differ from the base.", ar: "لا توجد قيم مختلفة بعد. استخدم \"+ قيمة مختلفة\" لاختيار الحقول التي تختلف عن الأساس.", ku: "هێشتا هیچ بەهای جیاوازێک نییە. \"+ بەهای جیاواز\" بەکاربهێنە بۆ هەڵبژاردنی ئەو خانانەی پێویستە لە بنەڕەت جیاواز بن." },

        // Variant kind labels — merchant-friendly
        kind_locale: { en: "Language", ar: "اللغة", ku: "زمان" },
        kind_breakpoint: { en: "Device", ar: "الجهاز", ku: "ئامێر" },
        kind_time_window: { en: "Schedule", ar: "جدول", ku: "خشتە" },
        kind_audience: { en: "Audience", ar: "الجمهور", ku: "بینەران" },
        kind_ab_test: { en: "Test", ar: "اختبار", ku: "تاقیکردنەوە" },
        kind_governorate: { en: "Governorate", ar: "المحافظة", ku: "پارێزگا" },
        kind_product: { en: "Product", ar: "المنتج", ku: "بەرهەم" },
        kind_category: { en: "Category", ar: "الفئة", ku: "پۆل" },
        kind_page: { en: "Specific page", ar: "صفحة معينة", ku: "پەڕەی تایبەت" },

        // Preset shortcuts (top of wizard)
        preset_heading: { en: "Start with one of these", ar: "ابدأ بأحد هذه", ku: "بە یەکێک لەمانە دەستپێبکە" },
        preset_holiday_title: { en: "Holiday or sale period", ar: "موسم العيد أو التخفيضات", ku: "ماوەی جەژن یان فرۆشتن" },
        preset_holiday_desc: { en: "Schedule a different look for a specific date range.", ar: "جدوِل مظهراً مختلفاً لفترة محددة.", ku: "ڕووخسارێکی جیاواز بۆ ماوەیەکی دیاریکراو خشتە بکە." },
        preset_mobile_title: { en: "Mobile-only change", ar: "تغيير للهاتف فقط", ku: "گۆڕانکاری تەنیا بۆ مۆبایل" },
        preset_mobile_desc: { en: "Show different content on phones.", ar: "اعرض محتوى مختلفاً على الهواتف.", ku: "ناوەڕۆکی جیاواز لەسەر مۆبایلەکان پیشان بدە." },
        preset_governorate_title: { en: "Different city / governorate", ar: "مدينة / محافظة مختلفة", ku: "شار / پارێزگای جیاواز" },
        preset_governorate_desc: { en: "Target a specific Iraqi governorate.", ar: "استهدف محافظة عراقية محددة.", ku: "پارێزگایەکی عێراقی دیاریکراو ئامانج بکە." },
        preset_ab_title: { en: "A/B test two versions", ar: "قارن بين نسختين", ku: "تاقیکردنەوەی A/B بۆ دوو وەشان" },
        preset_ab_desc: { en: "Split traffic to find the winner.", ar: "قسّم الزوار لإيجاد الفائز.", ku: "سەردانیکەران دابەش بکە بۆ دۆزینەوەی براوە." },
        preset_advanced: { en: "Advanced — choose any rule", ar: "متقدم — اختر أي قاعدة", ku: "پێشکەوتوو — هەر ڕێسایەک هەڵبژێرە" },
        preset_ab_auto_name: { en: "Test on {section}", ar: "اختبار على {section}", ku: "تاقیکردنەوە لەسەر {section}" },

        // Iraqi-market preset shortcuts
        preset_baghdad_same_day_title: { en: "Baghdad same-day promise", ar: "وعد التوصيل خلال اليوم في بغداد", ku: "بەڵێنی گەیاندنی هەمان ڕۆژ لە بەغدا" },
        preset_baghdad_same_day_desc: { en: "Show a faster delivery promise to shoppers in Baghdad.", ar: "اعرض وعد توصيل أسرع لزوار بغداد.", ku: "بەڵێنی گەیاندنی خێراتر بۆ کڕیارانی بەغدا پیشان بدە." },
        preset_baghdad_same_day_label: { en: "Baghdad same-day", ar: "بغداد — نفس اليوم", ku: "بەغدا — هەمان ڕۆژ" },
        preset_ramadan_title: { en: "Ramadan banner", ar: "لافتة رمضان", ku: "بانەری ڕەمەزان" },
        preset_ramadan_desc: { en: "Activate a Ramadan-themed version during the holy month.", ar: "فعّل نسخة بطابع رمضاني خلال الشهر الفضيل.", ku: "وەشانێکی بە تەمای ڕەمەزان لە مانگی پیرۆزدا چالاک بکە." },
        preset_ramadan_label: { en: "Ramadan banner", ar: "لافتة رمضان", ku: "بانەری ڕەمەزان" },
        preset_whatsapp_first_title: { en: "WhatsApp-first CTA", ar: "زر واتساب أولاً", ku: "دوگمەی واتساپ یەکەم" },
        preset_whatsapp_first_desc: { en: "Push WhatsApp ordering as the primary call-to-action.", ar: "اجعل الطلب عبر واتساب هو الإجراء الأساسي.", ku: "داواکاری لە ڕێی واتساپەوە بکە بە سەرەکی ترین کردار." },
        preset_whatsapp_first_label: { en: "WhatsApp first", ar: "واتساب أولاً", ku: "واتساپ یەکەم" },

        // Wizard
        wizard_add_variant_title: { en: "Add a version", ar: "إضافة نسخة", ku: "زیادکردنی وەشان" },
        wizard_add_condition_title: { en: "Add a rule", ar: "إضافة قاعدة", ku: "زیادکردنی ڕێسا" },
        wizard_close: { en: "Close wizard", ar: "إغلاق المعالج", ku: "داخستنی ڕێبەر" },
        wizard_step_label: { en: "Step {n} of 3", ar: "الخطوة {n} من 3", ku: "هەنگاوی {n} لە ٣" },
        wizard_step_label_short: { en: "Step {n}", ar: "الخطوة {n}", ku: "هەنگاوی {n}" },
        wizard_step1_prompt: { en: "When should this version show?", ar: "متى يجب أن تظهر هذه النسخة؟", ku: "کەی دەبێت ئەم وەشانە دەربکەوێت؟" },
        wizard_back: { en: "Back", ar: "رجوع", ku: "گەڕانەوە" },
        wizard_next: { en: "Next", ar: "التالي", ku: "دواتر" },
        wizard_submit_variant: { en: "Add version", ar: "إضافة نسخة", ku: "زیادکردنی وەشان" },
        wizard_submit_condition: { en: "Add rule", ar: "إضافة قاعدة", ku: "زیادکردنی ڕێسا" },
        wizard_label_field: { en: "Version name", ar: "اسم النسخة", ku: "ناوی وەشان" },
        wizard_label_hint: { en: "Used only in the editor — visitors never see it.", ar: "يُستخدم في المحرر فقط — لا يراه الزوار.", ku: "تەنیا لە دەستکاریکەردا بەکاردێت — سەردانکەران نایبینن." },

        // Editor (modal) — merchant-friendly labels
        editor_close: { en: "Close version editor", ar: "إغلاق محرر النسخة", ku: "داخستنی دەستکاریکەری وەشان" },
        editor_label_field: { en: "Version name", ar: "اسم النسخة", ku: "ناوی وەشان" },
        editor_conditions_heading: { en: "When", ar: "متى", ku: "کاتێک" },
        editor_conditions_empty: { en: "Always shown — add a rule to limit when this version appears.", ar: "تظهر دائماً — أضف قاعدة لتقييد ظهور هذه النسخة.", ku: "هەمیشە پیشاندەدرێت — ڕێسایەک زیاد بکە بۆ سنووردارکردنی دەرکەوتنی ئەم وەشانە." },
        editor_add_condition: { en: "Add rule", ar: "إضافة قاعدة", ku: "زیادکردنی ڕێسا" },
        editor_overrides_heading: { en: "Different values", ar: "القيم المختلفة", ku: "بەها جیاوازەکان" },
        editor_overrides_hint: { en: "Pick which fields are different in this version. Other fields stay the same as the base.", ar: "اختر الحقول التي تختلف في هذه النسخة. تبقى الحقول الأخرى كما هي في الأساس.", ku: "ئەو خانانە هەڵبژێرە کە لەم وەشانەدا جیاوازن. خانە کانی تر وەک بنەڕەت دەمێننەوە." },
        editor_overrides_empty: { en: "No different values yet. Use \"+ Different value\" to pick fields that should differ from the base.", ar: "لا توجد قيم مختلفة بعد. استخدم \"+ قيمة مختلفة\" لاختيار الحقول التي تختلف عن الأساس.", ku: "هێشتا هیچ بەهای جیاوازێک نییە. \"+ بەهای جیاواز\" بەکاربهێنە بۆ هەڵبژاردنی ئەو خانانەی پێویستە لە بنەڕەت جیاواز بن." },
        editor_override_field_button: { en: "Different value", ar: "قيمة مختلفة", ku: "بەهای جیاواز" },
        editor_override_disabled_hint: { en: "Every field already has a different value", ar: "كل الحقول لديها قيمة مختلفة بالفعل", ku: "پێشتر هەموو خانەکان بەهای جیاوازیان هەیە" },
        editor_priority: { en: "Order", ar: "الترتيب", ku: "ڕیزبەندی" },
        editor_priority_hint: { en: "Top wins when multiple versions match.", ar: "تفوز النسخة الأعلى عند تطابق عدة نسخ.", ku: "ئەو وەشانە سەرکەوتوو دەبێت کە لە سەرەوەیە، کاتێک چەند وەشانێک یەکدەگرنەوە." },
        editor_enabled: { en: "Enabled", ar: "مفعّل", ku: "چالاککراو" },
        editor_on: { en: "On", ar: "تشغيل", ku: "هەڵکراو" },
        editor_off: { en: "Off", ar: "إيقاف", ku: "کوژاوەتەوە" },
        editor_done: { en: "Done", ar: "تم", ku: "تەواو" },
        editor_remove: { en: "Remove", ar: "إزالة", ku: "لابردن" },
        editor_replaces_base: { en: "Replaces base", ar: "يستبدل الأساس", ku: "جێگرەوەی بنەڕەت دەبێت" },
        editor_array_hint: { en: "Array replaces base entirely.", ar: "المصفوفة تستبدل الأساس بالكامل.", ku: "ڕیزە بەتەواوەتی جێگرەوەی بنەڕەت دەبێت." },
        editor_field_schema_missing: { en: "Field schema not resolvable from path.", ar: "تعذّر استخراج مخطط الحقل من المسار.", ku: "نەخشەی خانە لە ڕێگاوە دەستەبەر نابێت." },

        // Wizard step labels
        wizard_locale_prompt: { en: "Which languages?", ar: "أي اللغات؟", ku: "کام زمانەکان؟" },
        wizard_breakpoint_prompt: { en: "Which devices?", ar: "أي الأجهزة؟", ku: "کام ئامێرەکان؟" },
        wizard_time_prompt: { en: "When should this variant be active?", ar: "متى يكون هذا الاختلاف فعّالاً؟", ku: "کەی دەبێت ئەم جیاوازییە چالاک بێت؟" },
        wizard_time_start: { en: "Starts at", ar: "يبدأ في", ku: "دەستپێدەکات لە" },
        wizard_time_end: { en: "Ends at", ar: "ينتهي في", ku: "کۆتایی دێت لە" },
        wizard_time_optional: { en: "(optional)", ar: "(اختياري)", ku: "(ئارەزوومەندانە)" },
        wizard_time_timezone: { en: "Timezone", ar: "المنطقة الزمنية", ku: "ناوچەی کاتی" },
        wizard_audience_label: { en: "Audience", ar: "الجمهور", ku: "بەشی کڕیار" },
        wizard_audience_placeholder: { en: "— pick an audience —", ar: "— اختر جمهوراً —", ku: "— بەشێک هەڵبژێرە —" },
        wizard_audience_empty: { en: "No audiences yet. Create one under Audiences in settings first.", ar: "لا يوجد جمهور بعد. أنشئ جمهوراً من «الجمهور» في الإعدادات أولاً.", ku: "هیچ بەشێک پێناسە نەکراوە. لە ڕێکخستنەکان ← بەشەکان پێناسە بکە پێش بەکارهێنانی ئەم جۆرە." },
        wizard_ab_experiment: { en: "Test", ar: "الاختبار", ku: "تاقیکردنەوە" },
        wizard_ab_experiment_placeholder: { en: "— pick a test —", ar: "— اختر اختباراً —", ku: "— تاقیکردنەوەیەک هەڵبژێرە —" },
        wizard_ab_arm: { en: "Version", ar: "النسخة", ku: "بازنە" },
        wizard_ab_arm_placeholder: { en: "— pick a version —", ar: "— اختر نسخة —", ku: "— بازنەیەک هەڵبژێرە —" },
        wizard_ab_empty: { en: "No tests yet. Create one under Tests in settings first.", ar: "لا توجد اختبارات بعد. أنشئ اختباراً من «الاختبارات» في الإعدادات أولاً.", ku: "هیچ تاقیکردنەوەیەک پێناسە نەکراوە. سەرەتا تاقیکردنەوەکان لە ڕێکخستنەکان ← تاقیکردنەوەکان دروست بکە." },
        wizard_governorate_prompt: { en: "Which governorates?", ar: "أي المحافظات؟", ku: "کام پارێزگاکان؟" },
        wizard_pages_prompt: { en: "Which pages?", ar: "أي الصفحات؟", ku: "کام پەڕەکان؟" },
        wizard_searching: { en: "Searching…", ar: "جاري البحث…", ku: "گەڕان دەکات…" },
        wizard_search_unavailable: { en: "Search unavailable — paste IDs separated by commas.", ar: "البحث غير متاح — الصق المعرّفات مفصولة بفواصل.", ku: "گەڕان بەردەست نییە — IDەکان بە کۆما لێکدابڕاو بدە." },
    },

    /* ── Experiments (merchant view of A/B tests) ──────────────── */
    experiment: {
        heading: { en: "Tests", ar: "الاختبارات", ku: "تاقیکردنەوەکان" },
        subtitle: { en: "Compare two versions side by side. Pick a goal, split your visitors, then promote the winner.", ar: "قارن نسختين جنباً إلى جنب. اختر هدفاً، قسّم زوارك بينهما، ثم اعتمد النسخة الفائزة.", ku: "دوو وەشان لەلای یەکدا بەراورد بکە. ئامانجێک هەڵبژێرە، سەردانیکەرانت دابەش بکە، پاشان براوەی پلەی بەرز بکەرەوە." },
        new: { en: "New test", ar: "اختبار جديد", ku: "تاقیکردنەوەی نوێ" },
        empty_title: { en: "No tests yet", ar: "لا توجد اختبارات بعد", ku: "هێشتا هیچ تاقیکردنەوەیەک نییە" },
        empty_hint: { en: "Test two versions of a section to see which one drives more orders.", ar: "اختبر نسختين من قسم لمعرفة أيهما يحقق طلبات أكثر.", ku: "دوو وەشانی بەشێک تاقی بکەرەوە بۆ زانینی ئەوەی کام داواکاری زیاتر دەهێنێت." },
        empty_new: { en: "Create your first test", ar: "أنشئ أول اختبار", ku: "یەکەم تاقیکردنەوەت دروست بکە" },
        // Status labels
        status_running: { en: "Running", ar: "قيد التشغيل", ku: "لە کارکردندایە" },
        status_paused: { en: "Paused", ar: "متوقف", ku: "ڕاگیراوە" },
        status_draft: { en: "Draft", ar: "مسودة", ku: "ڕەشنووس" },
        status_completed: { en: "Completed", ar: "مكتمل", ku: "تەواوبووە" },
        // Winning / Losing / Learning verdicts
        verdict_winning: { en: "WINNING", ar: "فائز", ku: "براوە" },
        verdict_losing: { en: "LOSING", ar: "خاسر", ku: "دۆڕاوە" },
        verdict_learning: { en: "NOT DECIDED YET", ar: "لم يُحسم بعد", ku: "هێشتا یەکلانەبووەتەوە" },
        verdict_winning_hint: { en: "This version is winning. Confidence is high enough to ship it.", ar: "هذه النسخة فائزة. الثقة مرتفعة كفاية للنشر.", ku: "ئەم وەشانە براوەیە. متمانە بەرزە بۆ بڵاوکردنەوەی." },
        verdict_losing_hint: { en: "This version is doing worse than the original.", ar: "هذه النسخة أسوأ من الأصلية.", ku: "ئەم وەشانە لە بنەڕەت خراپترە." },
        verdict_learning_hint: { en: "No winner yet. Keep the test running.", ar: "لم يتضح الفائز بعد. اترك الاختبار يعمل.", ku: "هێشتا براوە دیار نییە. تاقیکردنەوەکە بەردەوام بکە." },
        promote_winner: { en: "Promote this version to default", ar: "رقّ هذه النسخة كافتراضي", ku: "ئەم وەشانە وەکو بنەڕەت پلەی بەرز بکەرەوە" },
        // Goal (was: Primary metric)
        goal: { en: "Goal", ar: "الهدف", ku: "ئامانج" },
        goal_orders: { en: "More orders", ar: "طلبات أكثر", ku: "داواکاری زیاتر" },
        goal_add_to_cart: { en: "More add-to-cart", ar: "إضافة للسلة أكثر", ku: "زیاتر زیادکردن بۆ سەبەتە" },
        goal_click_through: { en: "More clicks", ar: "نقرات أكثر", ku: "کلیکی زیاتر" },
        goal_revenue: { en: "More revenue", ar: "إيرادات أكثر", ku: "داهاتی زیاتر" },
        visitors_pct: { en: "Visitors %", ar: "نسبة الزوار", ku: "ڕێژەی سەردانیکەران" },
        win_probability: { en: "Win probability", ar: "احتمالية الفوز", ku: "ڕێژەی سەرکەوتن" },
        confidence: { en: "Confidence", ar: "الثقة", ku: "متمانە" },
        details: { en: "Details", ar: "التفاصيل", ku: "وردەکارییەکان" },
        stat_visitors: { en: "Visitors", ar: "الزوار", ku: "سەردانیکەران" },
        stat_orders: { en: "Orders", ar: "الطلبات", ku: "داواکارییەکان" },
        stat_conversion: { en: "Conversion", ar: "التحويل", ku: "گۆڕین" },
        stat_uplift: { en: "Uplift vs original", ar: "التحسن مقابل الأصل", ku: "بەرزبوونەوە بەراورد بە بنەڕەت" },
        stat_revenue: { en: "Revenue (IQD)", ar: "الإيرادات (د.ع)", ku: "داهات (IQD)" },
        action_pause: { en: "Pause", ar: "إيقاف مؤقت", ku: "ڕاگرتن" },
        action_resume: { en: "Resume", ar: "استئناف", ku: "بەردەوامبوون" },
        action_stop: { en: "Stop test", ar: "إيقاف الاختبار", ku: "ڕاگرتنی تاقیکردنەوە" },
        action_view: { en: "View", ar: "عرض", ku: "بینین" },
        action_edit: { en: "Edit", ar: "تعديل", ku: "دەستکاری" },
        action_delete: { en: "Delete", ar: "حذف", ku: "سڕینەوە" },
        original: { en: "Original", ar: "الأصل", ku: "بنەڕەت" },
        new_version: { en: "New version", ar: "النسخة الجديدة", ku: "وەشانی نوێ" },
    },

    /* ── Segments (merchant terminology pass) ──────────────────── */
    segment: {
        heading: { en: "Audiences", ar: "الجمهور", ku: "بینەران" },
        subtitle: { en: "Group visitors by behavior, location, or device — then show them different versions of your store.", ar: "جمّع الزوار حسب السلوك أو الموقع أو الجهاز، ثم اعرض لهم نسخاً مختلفة من متجرك.", ku: "سەردانیکەران بەپێی ڕەفتار، شوێن، یان ئامێر کۆبکەرەوە — پاشان وەشانی جیاوازی فرۆشگاکەت پیشانیان بدە." },
        new: { en: "New audience", ar: "جمهور جديد", ku: "بینەری نوێ" },
        empty_title: { en: "No audiences yet", ar: "لا يوجد جمهور بعد", ku: "هێشتا هیچ بینەرێک نییە" },
        empty_hint: { en: "Audiences let you target versions at specific visitor types (new vs returning, by governorate, by cart value, etc).", ar: "حدّد مجموعة من الزوار (جدد أو عائدون، حسب المحافظة، حسب قيمة السلة) واعرض لها نسخة خاصة من متجرك.", ku: "بینەران ڕێگەت دەدەن وەشانەکان بۆ جۆری دیاریکراوی سەردانیکەران ئامانج بکەیت (نوێ بەرامبەر گەڕاو، بەپێی پارێزگا، بەپێی نرخی سەبەتە، هتد)." },
        empty_new: { en: "Create your first audience", ar: "أنشئ أول جمهور", ku: "یەکەم بینەرت دروست بکە" },
        delete_button: { en: "Delete audience", ar: "حذف الجمهور", ku: "سڕینەوەی بینەر" },
    },

    /* ── Publish ──────────────────────────────────────────────── */
    publish: {
        button: { en: "Publish", ar: "نشر", ku: "بڵاوکردنەوە" },
        publishing: { en: "Publishing…", ar: "جاري النشر…", ku: "بڵاودەکرێتەوە…" },
        confirm_title: { en: "Ready to publish?", ar: "جاهز للنشر؟", ku: "ئامادەی بۆ بڵاوکردنەوە؟" },
        // tFormat: {n}
        confirm_subtitle_one: { en: "{n} item we recommend fixing before going live. You can publish anyway and come back to these later.", ar: "عنصر واحد يُستحسن إصلاحه قبل النشر. يمكنك النشر على أي حال والعودة إليه لاحقاً.", ku: "{n} بڕگە کە پێشنیار دەکرێت پێش بڵاوکردنەوە چاکبکرێت. دەتوانی هەر بڵاوی بکەیتەوە و دواتر بگەڕێیتەوە." },
        confirm_subtitle_many: { en: "{n} items we recommend fixing before going live. You can publish anyway and come back to these later.", ar: "عناصر يُستحسن إصلاحها قبل النشر: {n}. يمكنك النشر على أي حال والعودة لاحقاً.", ku: "{n} بڕگە کە پێشنیار دەکرێت پێش بڵاوکردنەوە چاکبکرێن. دەتوانی هەر بڵاوی بکەیتەوە و دواتر بگەڕێیتەوە." },
        confirm_problems_one: { en: "1 problem shoppers will notice. Fix it before publishing.", ar: "مشكلة واحدة سيلاحظها الزبائن، أصلحها قبل النشر.", ku: "1 کێشە کە کڕیاران هەستی پێدەکەن. یەکەم چاکی بکە؛ هێشتا دەتوانی بڵاوی بکەیتەوە." },
        confirm_problems_many: { en: "{n} problems shoppers will notice. Fix them before publishing.", ar: "مشاكل سيلاحظها الزبائن: {n}، أصلحها قبل النشر.", ku: "{n} کێشە کە کڕیاران هەستی پێدەکەن. یەکەم چاکیان بکە؛ هێشتا دەتوانی بڵاوی بکەیتەوە." },
        confirm_all_clear: { en: "Nothing blocks publishing.", ar: "لا شيء يمنع النشر.", ku: "هیچ شتێک ڕێگری لە بڵاوکردنەوە ناکات." },
        publish_anyway: { en: "Publish anyway", ar: "نشر على أي حال", ku: "هەر بڵاویبکەرەوە" },
        // Positive CTA when nothing needs fixing — first publish should feel
        // like a win, not like overriding a safety warning.
        publish_cta: { en: "Publish my store", ar: "انشر متجري", ku: "فرۆشگاکەم بڵاوبکەرەوە" },
        // tFormat: {n} {list} — tooltip on the disabled/annotated publish button
        blocked_tooltip: { en: "{n} checks need attention before you publish: {list}", ar: "فحوصات تحتاج انتباهك قبل النشر ({n}): {list}", ku: "{n} پشکنین پێویستیان بە سەرنجە پێش بڵاوکردنەوە: {list}" },
        // tFormat: {n}
        blocked_tooltip_more: { en: ", +{n} more", ar: "، و{n} أخرى", ku: "، و {n}ی تر" },
        checks_heading: { en: "Recommended before you publish", ar: "توصيات قبل النشر", ku: "پێشنیارەکان پێش بڵاوکردنەوە" },
        cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوەوە" },
        // Publish is never actually blocked by health (the merchant stays in
        // control), so the chip must read as advice — not prohibition.
        blocks_chip: { en: "Blocks", ar: "يمنع النشر", ku: "ڕێگری لە بڵاوکردنەوە دەکات" },
        warn_chip: { en: "Recommended", ar: "ننصح بإصلاحه", ku: "پێشنیار دەکرێت" },
        fail_chip: { en: "Problem", ar: "مشكلة", ku: "کێشە" },
        diff_heading: { en: "Changes since last publish", ar: "التغييرات منذ آخر نشر", ku: "گۆڕانکارییەکان لە دوایین بڵاوکردنەوەوە" },
        diff_first_publish: { en: "First publish — everything is new.", ar: "أول نشر — كل شيء جديد.", ku: "یەکەم بڵاوکردنەوە — هەموو شتێک نوێیە." },
        diff_no_changes: { en: "No content changes — config matches what's already live.", ar: "لا توجد تغييرات — الإعدادات مطابقة لما هو منشور.", ku: "هیچ گۆڕانکارییەک نییە — ڕێکخستنەکان لەگەڵ ئەوەی بڵاوکراوەتەوە یەکدەگرنەوە." },
        diff_brand_kit: { en: "Brand kit", ar: "هوية العلامة", ku: "کیتی برێند" },
        diff_brand_kit_desc: { en: "— colors / fonts / shape updated", ar: "— تحديث الألوان / الخطوط / الشكل", ku: "— ڕەنگ / فۆنت / شێوە نوێکرانەوە" },
        diff_globals: { en: "Header, footer and top bar", ar: "الترويسة والتذييل والشريط العلوي", ku: "سەرپەڕە، پێپەڕە و شریتی سەرەوە" },
        diff_settings: { en: "Store settings", ar: "إعدادات المتجر", ku: "ڕێکخستنەکانی فرۆشگا" },
        diff_custom_css: { en: "Custom CSS", ar: "تنسيق CSS مخصّص", ku: "CSSی تایبەت" },
        global_header: { en: "Header", ar: "الترويسة", ku: "سەرپەڕە" },
        global_footer: { en: "Footer", ar: "التذييل", ku: "پێپەڕە" },
        global_promo_bar: { en: "Top bar", ar: "الشريط العلوي", ku: "شریتی سەرەوە" },
        global_sticky_bottom_bar: { en: "Bottom bar", ar: "الشريط السفلي", ku: "شریتی خوارەوە" },
        global_newsletter_popup: { en: "Sign-up popup", ar: "نافذة الاشتراك", ku: "پەنجەرەی بەشداربوون" },
        global_analytics_pixels: { en: "Pixels & tracking", ar: "البكسلات والتتبّع", ku: "پیکسڵ و شوێنکەوتن" },
        // tFormat: {n}
        diff_fields_one: { en: "1 field", ar: "حقل واحد", ku: "خانەیەک" },
        // tFormat: {n}
        diff_fields_many: { en: "{n} fields", ar: "الحقول: {n}", ku: "{n} خانە" },
        diff_hide: { en: "Hide", ar: "إخفاء", ku: "شاردنەوە" },
        // Simple-mode collapsed recommendations (S3-05): tFormat {n}
        recommendations_toggle: { en: "Recommendations ({n})", ar: "توصيات ({n})", ku: "پێشنیارەکان ({n})" },
        // Always-visible state beside the Publish button (no hover needed).
        state_up_to_date: { en: "Live store is up to date", ar: "المتجر المنشور محدَّث", ku: "فرۆشگای بڵاوکراوە نوێیە" },
        state_pending: { en: "Changes not live yet", ar: "تعديلات لم تُنشر بعد", ku: "گۆڕانکاری هێشتا بڵاونەکراونەتەوە" },
        disabled_no_changes: { en: "Nothing to publish — make a change first.", ar: "لا شيء للنشر — قم بإجراء تغيير أولاً.", ku: "هیچ شت بۆ بڵاوکردنەوە نییە — سەرەتا گۆڕانکارییەک بکە." },
        failed: { en: "Publish failed — please try again.", ar: "فشل النشر — يرجى المحاولة مرة أخرى.", ku: "بڵاوکردنەوە سەرنەکەوت — تکایە دووبارە هەوڵبدەرەوە." },
        retry: { en: "Retry publish", ar: "إعادة المحاولة", ku: "دووبارە هەوڵبدەرەوە" },
        conflict_message: { en: "Someone else published changes since you opened the editor. Reload to get the latest before publishing again — your draft is kept.", ar: "قام شخص آخر بنشر تغييرات منذ فتحك المحرر. أعد التحميل للحصول على الأحدث قبل النشر مجدداً — مسودتك محفوظة.", ku: "کەسێکی تر گۆڕانکاری بڵاوکردەوە لەو کاتەوەی دەستکاریکەرەکەت کردەوە. دووبارە باری بکەرەوە بۆ وەرگرتنی نوێترین پێش بڵاوکردنەوە — ڕەشنووسەکەت پارێزراوە." },
        conflict_reload: { en: "Reload", ar: "إعادة التحميل", ku: "دووبارە بارکردنەوە" },
        // Another editor open at the same time: whole-draft saves overwrite
        // each other, so warn before work is lost.
        co_editor_people: { en: "{names} is also editing the store. Edit one at a time, or your changes can overwrite each other.", ar: "{names} يعدّل المتجر الآن. عدّلوا واحداً تلو الآخر حتى لا تمحو تعديلات أحدكم تعديلات الآخر.", ku: "{names} ئێستا دەستکاری فرۆشگا دەکات. یەک یەک دەستکاری بکەن، دەنا گۆڕانکارییەکان یەکتر دەسڕنەوە." },
        co_editor_tab: { en: "The editor is open in another tab too. Close one, or your changes can overwrite each other.", ar: "المحرر مفتوح في تبويب آخر أيضاً. أغلق أحدهما حتى لا تُلغي التعديلات بعضها.", ku: "دەستکاریکەر لە تابێکی تریشدا کراوەیە. یەکێکیان دابخە، دەنا گۆڕانکارییەکان یەکتر دەسڕنەوە." },
        // Post-publish success dialog — the peak moment. Celebrate + hand
        // over the live link.
        success_title: { en: "Your store is live!", ar: "أصبح متجرك مباشراً!", ku: "فرۆشگاکەت بڵاوبووەوە!" },
        success_subtitle: { en: "Share the link with your customers — orders can start right now.", ar: "شارك الرابط مع زبائنك، يمكنك استقبال الطلبات من الآن.", ku: "بەستەرەکە لەگەڵ کڕیارەکانت هاوبەش بکە — لە ئێستاوە داواکاری وەربگرە." },
        success_view: { en: "View my store", ar: "شاهد متجرك", ku: "فرۆشگاکەم ببینە" },
        success_copy: { en: "Copy link", ar: "نسخ الرابط", ku: "بەستەر کۆپی بکە" },
        success_copied: { en: "Copied!", ar: "تم النسخ!", ku: "کۆپی کرا!" },
        success_whatsapp: { en: "Share on WhatsApp", ar: "مشاركة عبر واتساب", ku: "هاوبەشکردن لە واتساپ" },
        success_close: { en: "Keep editing", ar: "متابعة التعديل", ku: "بەردەوامبوون لە دەستکاری" },
    },

    /* ── Save state pill / toolbar status ──────────────────────── */
    save_state: {
        saving: { en: "Saving…", ar: "جاري الحفظ…", ku: "خەزن دەکرێ…" },
        saved_just_now: { en: "Saved just now", ar: "تم الحفظ الآن", ku: "ئێستا خەزنکرا" },
        // tFormat: {n}
        saved_seconds: { en: "Saved {n}s ago", ar: "تم الحفظ منذ {n}ث", ku: "{n}س لەمەوبەر خەزنکرا" },
        saved_minutes: { en: "Saved {n}m ago", ar: "تم الحفظ منذ {n}د", ku: "{n}خ لەمەوبەر خەزنکرا" },
        saved_hours: { en: "Saved {n}h ago", ar: "تم الحفظ منذ {n}س", ku: "{n}ک لەمەوبەر خەزنکرا" },
        saved_days: { en: "Saved {n}d ago", ar: "تم الحفظ منذ {n}ي", ku: "{n} ڕۆژ لەمەوبەر خەزنکرا" },
        saved_pulse: { en: "Saved", ar: "تم الحفظ", ku: "خەزنکرا" },
        // Shown before the first save of the session. Deliberately calm —
        // "changes save automatically" reassures instead of alarming.
        not_saved_yet: { en: "Autosaves as you edit", ar: "يُحفظ تلقائياً أثناء التعديل", ku: "بە خۆکار خەزن دەکرێت لە کاتی دەستکاری" },
        error: { en: "Save failed", ar: "فشل الحفظ", ku: "خەزنکردن سەرکەوتوو نەبوو" },
        retry: { en: "Retry save", ar: "إعادة محاولة الحفظ", ku: "دووبارە هەوڵبدەرەوە بۆ خەزنکردن" },
        retry_hint: { en: "Click to try saving again.", ar: "اضغط لمحاولة الحفظ مرة أخرى.", ku: "کلیک بکە بۆ هەوڵدانەوەی خەزنکردن." },
        // Settings screen strip: the edit is kept and retried, never lost.
        screen_failed: { en: "Your last change is not saved yet. We keep retrying.", ar: "لم يُحفظ آخر تعديل بعد. نعيد المحاولة تلقائياً.", ku: "دوایین گۆڕانکاری هێشتا خەزن نەکراوە. بەردەوام هەوڵ دەدەینەوە." },
        screen_retry: { en: "Retry now", ar: "أعد المحاولة الآن", ku: "ئێستا هەوڵبدەرەوە" },
    },

    /* ── Brand kit — theme gallery ────────────────────────────── */
    brand_kit: {
        contrast_aaa: { en: "Excellent", ar: "ممتاز", ku: "نایاب" },
        contrast_aa: { en: "Good", ar: "جيد", ku: "باش" },
        contrast_fail: { en: "Too low", ar: "غير كافٍ", ku: "کەمە" },
        sample_display: { en: "Aa — Your store starts here 1234567890", ar: "أب — متجرك يبدأ من هنا 1234567890", ku: "ئا — فرۆشگاکەت لێرەوە دەست پێدەکات 1234567890" },
        sample_body: { en: "This is how paragraphs and product descriptions will read.", ar: "هكذا ستظهر الفقرات ووصف المنتجات في متجرك.", ku: "پەرەگراف و وەسفی بەرهەمەکان بەم شێوەیە دەردەکەون." },
        themes_title: { en: "Ready-made looks", ar: "إطلالات جاهزة", ku: "ڕووخسارە ئامادەکان" },
        themes_hint: { en: "One tap applies colors, fonts and shape together — you can fine-tune everything after.", ar: "ضغطة واحدة تطبّق الألوان والخطوط والشكل معاً، ويمكنك تعديل كل شيء بعدها.", ku: "یەک کرتە ڕەنگ و فۆنت و شێوە پێکەوە جێبەجێ دەکات — دواتر دەتوانی هەموو شتێک ورد بکەیت." },
        // tFormat: {name}
        theme_apply_aria: { en: "Apply the {name} look", ar: "تطبيق إطلالة {name}", ku: "جێبەجێکردنی ڕووخساری {name}" },
        theme_applied: { en: "Applied", ar: "مُطبَّق", ku: "جێبەجێکرا" },
        // ── Full brand-kit editor chrome ──
        heading: { en: "Brand Kit", ar: "هوية العلامة", ku: "کیتی برێند" },
        intro: { en: "Single source of truth for your storefront's visual identity. Edit any field — the right preview updates instantly.", ar: "المصدر الوحيد لهوية متجرك البصرية. عدّل أي حقل — والمعاينة على اليمين تتحدّث فوراً.", ku: "سەرچاوەی یەکگرتووی ناسنامەی دیداری فرۆشگاکەت. هەر خانەیەک دەستکاری بکە — پێشبینینەکەی لای ڕاست دەستبەجێ نوێ دەبێتەوە." },
        card_identity: { en: "Identity", ar: "الهوية", ku: "ناسنامە" },
        card_colors: { en: "Colors", ar: "الألوان", ku: "ڕەنگەکان" },
        card_typography: { en: "Typography", ar: "الخطوط", ku: "فۆنتەکان" },
        card_shape: { en: "Shape", ar: "الشكل", ku: "شێوە" },
        card_motion: { en: "Motion", ar: "الحركة", ku: "جوڵە" },
        card_voice: { en: "Voice & tone", ar: "الصوت والنبرة", ku: "دەنگ و شێوازی قسە" },
        reset: { en: "Use default", ar: "استخدم الافتراضي", ku: "بنەڕەت بەکاربهێنە" },
        // Field labels
        field_store_name: { en: "Store name", ar: "اسم المتجر", ku: "ناوی فرۆشگا" },
        field_tagline: { en: "Slogan", ar: "العبارة التعريفية", ku: "دروشم" },
        field_logo: { en: "Logo", ar: "الشعار", ku: "لۆگۆ" },
        field_favicon: { en: "Favicon", ar: "أيقونة الموقع", ku: "ئایکۆنی ماڵپەڕ" },
        field_og_image: { en: "OG image", ar: "صورة المشاركة", ku: "وێنەی هاوبەشکردن" },
        field_display_font: { en: "Display font", ar: "خط العناوين", ku: "فۆنتی ناونیشانەکان" },
        field_display_font_ar: { en: "Arabic font: headings", ar: "الخط العربي: العناوين", ku: "فۆنتی عەرەبی: ناونیشانەکان" },
        field_body_font_ar: { en: "Arabic font: text", ar: "الخط العربي: النصوص", ku: "فۆنتی عەرەبی: دەقەکان" },
        help_display_font_ar: { en: "Used for headings on Arabic and Kurdish pages. Latin fonts have no Arabic letters.", ar: "يُستخدم للعناوين بالعربية والكردية، فالخطوط اللاتينية لا تحتوي أحرفاً عربية.", ku: "بۆ ناونیشانەکان لە پەڕە عەرەبی و کوردییەکان بەکاردێت. فۆنتە لاتینییەکان پیتی عەرەبییان تێدا نییە." },
        help_body_font_ar: { en: "Used for paragraphs and descriptions on Arabic and Kurdish pages.", ar: "يُستخدم للفقرات والأوصاف بالعربية والكردية.", ku: "بۆ پەرەگراف و وەسفەکان لە پەڕە عەرەبی و کوردییەکان بەکاردێت." },
        font_auto: { en: "Automatic (system font)", ar: "تلقائي (خط النظام)", ku: "خۆکار (فۆنتی سیستەم)" },
        field_body_font: { en: "Body font", ar: "خط النصوص", ku: "فۆنتی دەقەکان" },
        field_scale: { en: "Scale", ar: "الحجم", ku: "قەبارە" },
        field_radius: { en: "Radius", ar: "استدارة الزوايا", ku: "خڕی گۆشەکان" },
        field_border_thickness: { en: "Border thickness", ar: "سماكة الحدود", ku: "ئەستووری چوارچێوە" },
        field_shadow_style: { en: "Shadow style", ar: "نمط الظل", ku: "شێوازی سێبەر" },
        field_rotation: { en: "Rotation intensity", ar: "شدة الميلان", ku: "توندی لارکردنەوە" },
        field_motion_enabled: { en: "Motion enabled", ar: "الحركة مفعّلة", ku: "جوڵە چالاکە" },
        field_speed: { en: "Speed", ar: "السرعة", ku: "خێرایی" },
        field_formality: { en: "Formality", ar: "الرسمية", ku: "ڕەسمییەت" },
        field_notes: { en: "Notes", ar: "ملاحظات", ku: "تێبینییەکان" },
        // Helper texts + placeholders
        store_name_placeholder: { en: "Your store name", ar: "اسم متجرك", ku: "ناوی فرۆشگاکەت" },
        help_store_name: { en: "Used as the storefront wordmark and in the header by default.", ar: "يُستخدم كعلامة المتجر النصية وفي الترويسة افتراضياً.", ku: "بە شێوەی بنەڕەتی وەکو ناوی فرۆشگا و لە سەرپەڕەدا بەکاردێت." },
        help_tagline: { en: "A short line under your store name. If a language is left empty, the English line shows.", ar: "سطر قصير تحت اسم متجرك. إذا تركت لغة فارغة يظهر السطر الإنجليزي بدلها.", ku: "دێڕێکی کورت لە ژێر ناوی فرۆشگاکەت. ئەگەر زمانێک بەتاڵ بێت، دێڕە ئینگلیزییەکە دەردەکەوێت." },
        help_logo: { en: "PNG or SVG. Max 2MB. Appears in header + on receipts.", ar: "صورة PNG أو SVG، حجمها 2MB كحد أقصى. يظهر في الترويسة وعلى الفواتير.", ku: "وێنەی PNG یان SVG، زۆرترین 2MB. لە سەرپەڕە و لەسەر پسوولەکان دەردەکەوێت." },
        help_favicon: { en: "32×32 PNG or ICO. Max 512KB.", ar: "صورة PNG أو ICO بمقاس 32×32، حجمها 512KB كحد أقصى.", ku: "وێنەی PNG یان ICO بە قەبارەی 32×32، زۆرترین 512KB." },
        help_og_image: { en: "1200×630 JPG/PNG. Used when your store is shared on social.", ar: "صورة JPG أو PNG بمقاس 1200×630. تُستخدم عند مشاركة متجرك على وسائل التواصل.", ku: "وێنەی JPG یان PNG بە قەبارەی 1200×630. بەکاردێت کاتێک فرۆشگاکەت لە سۆشیال میدیا هاوبەش دەکرێت." },
        help_display_font: { en: "Used for headlines and the wordmark.", ar: "يُستخدم للعناوين وعلامة المتجر.", ku: "بۆ ناونیشانەکان و ناوی فرۆشگا بەکاردێت." },
        help_body_font: { en: "Used for paragraphs, descriptions, and UI labels.", ar: "يُستخدم للفقرات والأوصاف وعناصر الواجهة.", ku: "بۆ پەرەگرافەکان، وەسفەکان و ناولێنانەکانی ڕووکار بەکاردێت." },
        help_motion_enabled: { en: "Adds subtle animations to interactive elements.", ar: "يضيف حركات خفيفة للعناصر التفاعلية.", ku: "جوڵەی نەرم بۆ توخمە کارلێککارەکان زیاد دەکات." },
        // Buttons
        extract_palette: { en: "Extract palette from logo", ar: "استخراج الألوان من الشعار", ku: "ڕەنگەکان لە لۆگۆوە دەربهێنە" },
        extract_reading: { en: "Reading logo…", ar: "جاري قراءة الشعار…", ku: "لۆگۆ دەخوێنرێتەوە…" },
        random_palette: { en: "Random palette", ar: "لوحة ألوان عشوائية", ku: "پاڵێتی هەڕەمەکی" },
        // Live preview pane
        live_preview: { en: "Live preview", ar: "معاينة حية", ku: "پێشبینینی ڕاستەوخۆ" },
        realtime: { en: "Real-time", ar: "لحظي", ku: "ڕاستەوخۆ" },
        resolved_tokens: { en: "Resolved tokens", ar: "الرموز الناتجة", ku: "تۆکنە ئامادەکراوەکان" },
        resolved_palette_live: { en: "Resolved palette · live", ar: "اللوحة الناتجة · حية", ku: "پاڵێتی ئامادەکراو · ڕاستەوخۆ" },
        // Contrast card
        accessibility_contrast: { en: "Accessibility · contrast", ar: "إتاحة الوصول · التباين", ku: "گەیشتن · جیاوازی ڕەنگ" },
        contrast_primary_surface: { en: "Primary on surface", ar: "الأساسي على الخلفية", ku: "سەرەکی لەسەر ڕووکار" },
        contrast_ink_surface: { en: "Text on background", ar: "النص على الخلفية", ku: "دەق لەسەر باکگراوند" },
        contrast_primary_ink: { en: "Main colour on text colour", ar: "الأساسي على لون النص", ku: "سەرەکی لەسەر ڕەنگی دەق" },
        // Segmented option labels (shared across scale/shape/motion/voice)
        opt_compact: { en: "Compact", ar: "مضغوط", ku: "چڕ" },
        opt_comfortable: { en: "Comfortable", ar: "مريح", ku: "ئاسوودە" },
        opt_spacious: { en: "Spacious", ar: "فسيح", ku: "فراوان" },
        opt_sharp: { en: "Sharp", ar: "حاد", ku: "تیژ" },
        opt_soft: { en: "Soft", ar: "ناعم", ku: "نەرم" },
        opt_round: { en: "Round", ar: "دائري", ku: "خڕ" },
        opt_pill: { en: "Pill", ar: "بيضوي", ku: "هێلکەیی" },
        opt_none: { en: "None", ar: "بدون", ku: "هیچ" },
        opt_thin: { en: "Thin", ar: "رفيع", ku: "باریک" },
        opt_thick: { en: "Thick", ar: "سميك", ku: "ئەستوور" },
        opt_chunky: { en: "Chunky", ar: "غليظ", ku: "زۆر ئەستوور" },
        opt_flat: { en: "Flat", ar: "مسطّح", ku: "تەخت" },
        opt_offset: { en: "Offset", ar: "مُزاح", ku: "لادراو" },
        opt_elevated: { en: "Elevated", ar: "مرتفع", ku: "بەرزکراوە" },
        opt_subtle: { en: "Subtle", ar: "خفيف", ku: "کەم" },
        opt_playful: { en: "Playful", ar: "مرح", ku: "یاریانە" },
        opt_wild: { en: "Wild", ar: "جامح", ku: "سەرکێش" },
        opt_slow: { en: "Slow", ar: "بطيء", ku: "هێواش" },
        opt_normal: { en: "Normal", ar: "عادي", ku: "ئاسایی" },
        opt_snappy: { en: "Snappy", ar: "سريع", ku: "خێرا" },
        opt_formal: { en: "Formal", ar: "رسمي", ku: "ڕەسمی" },
        opt_casual: { en: "Casual", ar: "ودّي", ku: "دۆستانە" },
        opt_luxe: { en: "Luxe", ar: "فاخر", ku: "لوکس" },
    },

    /* ── AutoForm control affordances ─────────────────────────── */
    template_updates: {
        title: { en: "Template updates", ar: "تحديثات القالب", ku: "نوێکارییەکانی ڕووکار" },
        close: { en: "Close template updates", ar: "إغلاق تحديثات القالب", ku: "داخستنی نوێکارییەکان" },
        subtitle: {
            en: "New sections from the template your store started from.",
            ar: "أقسام جديدة من القالب الذي بدأ منه متجرك.",
            ku: "بەشە نوێیەکان لەو ڕووکارەی فرۆشگاکەت لێیەوە دەستی پێکرد.",
        },
        intro: {
            en: "Your store's look came from {template}. When we improve it, the new sections show up here — you choose which to take. Nothing you wrote is ever replaced, and nothing is removed.",
            ar: "شكل متجرك مأخوذ من قالب {template}. عندما نطوّره تظهر الأقسام الجديدة هنا وتختار أنت ما تأخذه. لن تتغير أي كلمة كتبتها ولن يُحذف شيء.",
            ku: "ڕووکاری فرۆشگاکەت لە {template}ەوە هاتووە. کاتێک باشتری دەکەین، بەشە نوێیەکان لێرە دەردەکەون و تۆ هەڵدەبژێریت. هیچ شتێکی نووسیوت نەدەگۆڕدرێت.",
        },
        unknown_origin: {
            en: "This store wasn't set up from one of our templates, so there is nothing to compare it against. You can still add any section from the page editor.",
            ar: "لم يُبنَ هذا المتجر من أحد قوالبنا، فلا يوجد ما نقارنه به. يمكنك إضافة أي قسم من محرر الصفحة.",
            ku: "ئەم فرۆشگایە لە ڕووکارەکانی ئێمەوە دروست نەکراوە، بۆیە هیچ شتێک نییە بەراوردی پێ بکرێت.",
        },
        up_to_date: { en: "Your store has everything this template offers.", ar: "متجرك يضم كل ما يقدمه هذا القالب.", ku: "فرۆشگاکەت هەموو شتێکی ئەم ڕووکارەی هەیە." },
        placement: { en: "On {page}, after {after}", ar: "في صفحة {page}، بعد {after}", ku: "لە {page}، دوای {after}" },
        at_top: { en: "the top", ar: "البداية", ku: "سەرەوە" },
        apply: { en: "Add {count} to my store", ar: "أضف {count} إلى متجري", ku: "{count} زیاد بکە" },
        applied: {
            en: "Added to your draft. Look them over in the page editor, then publish when you're happy.",
            ar: "أُضيفت إلى المسودة. راجعها في محرر الصفحة وانشرها عندما تعجبك.",
            ku: "زیادکرا بۆ ڕەشنووسەکەت. لە دەستکاریکەری پەڕەدا سەیریان بکە، پاشان بڵاوی بکەرەوە.",
        },
        draft_note: {
            en: "This changes your draft only — nothing reaches your customers until you publish.",
            ar: "هذا يغيّر المسودة فقط، ولن يصل شيء إلى زبائنك حتى تنشر.",
            ku: "ئەمە تەنها ڕەشنووسەکەت دەگۆڕێت — هیچ شتێک نەگاتە کڕیارەکانت هەتا بڵاوی نەکەیتەوە.",
        },
        yours_heading: { en: "Yours, left alone", ar: "تعديلاتك، لا نغيّرها", ku: "هی تۆ، دەستی لێنادرێت" },
        yours_body: {
            en: "You've edited these, so an update never touches them. Change them yourself in the page editor.",
            ar: "عدّلت هذه بنفسك، لذلك لا يغيّرها التحديث أبداً. يمكنك تعديلها من محرّر الصفحة.",
            ku: "ئەمانەت دەستکاری کردووە، بۆیە نوێکردنەوە هەرگیز دەستیان لێنادات.",
        },
        page_other: { en: "another page", ar: "صفحة أخرى", ku: "پەڕەیەکی تر" },
    },
    order_status: {
        title: { en: "Order tracking messages", ar: "رسائل تتبّع الطلب", ku: "پەیامەکانی شوێنکەوتنی داواکاری" },
        close: { en: "Close order tracking messages", ar: "إغلاق رسائل التتبّع", ku: "داخستنی پەیامەکان" },
        intro: {
            en: "What a shopper reads when they look up their order, stage by stage. Leave a field blank to keep the built-in line. Write {contact} anywhere and your store's contact number is filled in — if no number is set, that sentence is left out rather than shown with a hole.",
            ar: "ما يقرؤه الزبون عند متابعة طلبه، مرحلة بمرحلة. اترك الحقل فارغاً ليبقى النص الجاهز. اكتب {contact} في أي مكان ليظهر رقم تواصل متجرك، وإذا لم يوجد رقم لا تظهر الجملة بدل أن تظهر ناقصة.",
            ku: "ئەوەی کڕیار دەیخوێنێتەوە کاتێک داواکارییەکەی دەگەڕێت، قۆناغ بە قۆناغ. خانەکە بەتاڵ بهێڵەرەوە بۆ پاراستنی دەقی ئامادە. {contact} بنووسە و ژمارەی پەیوەندی فرۆشگاکەت دادەنرێت.",
        },
        no_contact: {
            en: "No contact number is set for this store, so every line that mentions {contact} — and every WhatsApp or call button — is hidden until you add one in your business settings.",
            ar: "لا يوجد رقم تواصل للمتجر، لذا تبقى كل جملة فيها {contact} وكل زر واتساب أو اتصال مخفية حتى تضيف رقماً في إعدادات المتجر.",
            ku: "هیچ ژمارەیەکی پەیوەندی بۆ ئەم فرۆشگایە دانەنراوە، بۆیە هەموو دێڕێک کە {contact} تێدایە شاراوە دەبێت.",
        },
        off_path: { en: "Exception", ar: "حالة استثنائية", ku: "حاڵەتی تایبەت" },
        edited: { en: "Edited", ar: "معدّل", ku: "دەستکاریکراو" },
        field_title: { en: "Headline", ar: "العنوان", ku: "سەردێڕ" },
        field_body: { en: "What is happening", ar: "ماذا يحدث", ku: "چی ڕوودەدات" },
        field_next: { en: "What happens next", ar: "ما الخطوة التالية", ku: "دواتر چی دەبێت" },
        contact_hint: { en: "{contact} becomes your store's contact number.", ar: "يصبح {contact} رقم التواصل لمتجرك.", ku: "{contact} دەبێتە ژمارەی پەیوەندی فرۆشگاکەت." },
        field_cta: { en: "Button", ar: "الزر", ku: "دوگمە" },
        field_cta_label: { en: "Button text", ar: "نص الزر", ku: "دەقی دوگمە" },
        cta_default: { en: "Built-in button", ar: "الزر الجاهز", ku: "دوگمەی ئامادە" },
        cta_none: { en: "No button", ar: "بدون زر", ku: "بێ دوگمە" },
        cta_whatsapp: { en: "Message us on WhatsApp", ar: "راسلنا على واتساب", ku: "لە واتسئاپ پەیاممان بۆ بنێرە" },
        cta_phone: { en: "Call us", ar: "اتصل بنا", ku: "پەیوەندیمان پێوە بکە" },
        cta_link: { en: "Open a page", ar: "افتح صفحة", ku: "پەڕەیەک بکەرەوە" },
        cta_review: { en: "Rate the order", ar: "قيّم الطلب", ku: "داواکارییەکە هەڵسەنگێنە" },
        cta_reorder: { en: "Order again", ar: "اطلب مرة أخرى", ku: "دووبارە داوا بکە" },
        reset: { en: "Back to the built-in text", ar: "استعد النص الجاهز", ku: "گەڕانەوە بۆ دەقی ئامادە" },
        history_edit: { en: "Edited order tracking messages", ar: "تعديل رسائل التتبّع", ku: "دەستکاریکردنی پەیامەکان" },
        history_reset: { en: "Reset an order tracking message", ar: "استعادة رسالة تتبّع", ku: "گەڕاندنەوەی پەیامێک" },
        stage_placed: { en: "Order received", ar: "تم استلام الطلب", ku: "داواکاری گەیشت" },
        stage_awaiting_confirmation: { en: "Waiting for the customer to confirm", ar: "بانتظار تأكيد الزبون", ku: "چاوەڕوانی پشتڕاستکردنەوەی کڕیار" },
        stage_confirmed: { en: "Confirmed", ar: "مؤكد", ku: "پشتڕاستکراوە" },
        stage_shipped: { en: "With the courier", ar: "مع المندوب", ku: "لەگەڵ گەیەنەر" },
        stage_delivered: { en: "Delivered", ar: "تم التسليم", ku: "گەیەنرا" },
        stage_no_response: { en: "Customer not answering", ar: "الزبون لا يرد", ku: "کڕیار وەڵام نادات" },
        stage_on_hold: { en: "On hold", ar: "متوقف مؤقتاً", ku: "ڕاگیراوە" },
        stage_cancelled: { en: "Cancelled", ar: "ملغي", ku: "هەڵوەشێنرایەوە" },
        stage_returning: { en: "Coming back to you", ar: "قيد الإرجاع", ku: "دەگەڕێتەوە" },
        stage_refunded: { en: "Refunded", ar: "تم استرداد المبلغ", ku: "پارە گەڕێنرایەوە" },
    },
    free_gift: {
        title: { en: "Free gift", ar: "الهدية المجانية", ku: "دیاری بەخۆڕایی" },
        close: { en: "Close free gift", ar: "إغلاق الهدية المجانية", ku: "داخستنی دیاری" },
        intro: {
            en: "Add a gift to every order above a spending threshold. It is added at checkout, at no charge — the cart shows how much is left to unlock it. Nothing is promised until you turn it on, pick the gift, and set the threshold.",
            ar: "أضف هدية لكل طلب يتجاوز مبلغاً معيناً. تُضاف مجاناً عند إتمام الطلب، وتعرض السلة للزبون كم بقي ليحصل عليها. لا يُوعد الزبون بشيء حتى تشغّلها وتختار الهدية وتحدد المبلغ.",
            ku: "دیارییەک بۆ هەر داواکارییەک زیاد بکە کە لە سنوورێکی خەرجکردن تێپەڕێت. لە کاتی پارەداندا بەبێ نرخ زیاد دەکرێت.",
        },
        enable: { en: "Enable the free gift", ar: "تشغيل الهدية المجانية", ku: "چالاککردنی دیاری بەخۆڕایی" },
        product: { en: "The gift", ar: "الهدية", ku: "دیارییەکە" },
        product_hint: { en: "Added to the order at 0 IQD. Only while it is in stock.", ar: "تُضاف إلى الطلب بسعر 0 د.ع، فقط إذا كانت متوفرة في المخزون.", ku: "بە ٠ دینار زیاد دەکرێت. تەنها کاتێک لە کۆگادایە." },
        threshold: { en: "Spend at least (IQD)", ar: "الحد الأدنى للطلب (د.ع)", ku: "لانیکەم بخەرجێنە (دینار)" },
        threshold_hint: { en: "Item subtotal, before delivery. The gift itself never counts toward it.", ar: "مجموع المنتجات قبل التوصيل. لا تُحتسب الهدية نفسها.", ku: "کۆی کاڵاکان پێش گەیاندن." },
        incomplete: { en: "Not live yet — the store will not promise a gift until all three are set.", ar: "غير مفعّلة بعد. لن يعرض المتجر الهدية حتى تكمل الحقول الثلاثة.", ku: "هێشتا کارا نییە — فرۆشگا بەڵێنی دیاری نادات هەتا هەرسێکیان دانەنرێن." },
    },
    picker: {
        choose_product: { en: "Choose a product", ar: "اختر منتجاً", ku: "بەرهەمێک هەڵبژێرە" },
        choose_products: { en: "Choose products", ar: "اختر المنتجات", ku: "بەرهەمەکان هەڵبژێرە" },
        choose_category: { en: "Choose a category", ar: "اختر فئة", ku: "بەشێک هەڵبژێرە" },
        choose_attribute: { en: "Choose an attribute", ar: "اختر خاصية", ku: "تایبەتمەندییەک هەڵبژێرە" },
        choose_attributes: { en: "Choose attributes", ar: "اختر الخصائص", ku: "تایبەتمەندییەکان هەڵبژێرە" },
        choose_categories: { en: "Choose categories", ar: "اختر الفئات", ku: "بەشەکان هەڵبژێرە" },
        search: { en: "Search", ar: "بحث", ku: "گەڕان" },
        none_selected: { en: "Nothing chosen", ar: "لم يُختر شيء", ku: "هیچ هەڵنەبژێردراوە" },
        no_results: { en: "Nothing matches that", ar: "لا توجد نتائج", ku: "هیچ نەدۆزرایەوە" },
        hidden_product: { en: "Hidden from the store", ar: "مخفي من المتجر", ku: "شاراوەیە لە فرۆشگا" },
        missing: { en: "No longer exists", ar: "لم يعد موجوداً", ku: "چیتر نییە" },
        link_to: { en: "Links to", ar: "يؤدي إلى", ku: "دەچێتە" },
        target_page: { en: "A store page", ar: "صفحة بالمتجر", ku: "پەڕەیەکی فرۆشگا" },
        target_custom_page: { en: "A custom page", ar: "صفحة أنشأتها", ku: "پەڕەیەکی خۆت" },
        target_category: { en: "A category", ar: "فئة", ku: "بەشێک" },
        target_product: { en: "A product", ar: "منتج", ku: "بەرهەمێک" },
        target_external: { en: "A web address", ar: "رابط خارجي", ku: "بەستەرێکی دەرەکی" },
        external_placeholder: { en: "https://…", ar: "https://…", ku: "https://…" },
        choose_custom_page: { en: "Choose a custom page", ar: "اختر صفحة", ku: "پەڕەیەک هەڵبژێرە" },
        no_custom_pages: { en: "You have no custom pages yet. Make one under Custom pages.", ar: "لا توجد صفحات خاصة بعد. أنشئ صفحة من «الصفحات الخاصة».", ku: "هێشتا هیچ پەڕەیەکی تایبەتت نییە. یەکێک لە «پەڕە تایبەتەکان» دروست بکە." },
        hidden_page: { en: "Hidden", ar: "مخفية", ku: "شاراوە" },
        page_other: { en: "Another store address…", ar: "عنوان آخر في المتجر…", ku: "ناونیشانێکی تری فرۆشگا…" },
        page_other_label: { en: "Store address", ar: "عنوان في المتجر", ku: "ناونیشانی فرۆشگا" },
        still_opens: { en: "Until you pick one it still opens", ar: "إلى أن تختار، يبقى الرابط يفتح", ku: "تا هەڵدەبژێریت هێشتا دەکاتەوە" },
        page_other_placeholder: { en: "/products?sort=sale", ar: "/products?sort=sale", ku: "/products?sort=sale" },
        page_home: { en: "Home", ar: "الرئيسية", ku: "سەرەکی" },
        page_products: { en: "All products", ar: "كل المنتجات", ku: "هەموو بەرهەمەکان" },
        page_search: { en: "Search", ar: "البحث", ku: "گەڕان" },
        page_cart: { en: "Cart", ar: "السلة", ku: "سەبەتە" },
        page_checkout: { en: "Checkout", ar: "إتمام الطلب", ku: "تەواوکردنی داواکاری" },
        page_track: { en: "Track order", ar: "تتبع الطلب", ku: "بەدواداچوونی داواکاری" },
        page_about: { en: "About", ar: "من نحن", ku: "دەربارە" },
        page_faq: { en: "FAQ", ar: "الأسئلة الشائعة", ku: "پرسیارە باوەکان" },
        page_contact: { en: "Contact", ar: "تواصل معنا", ku: "پەیوەندی" },
        page_policyShipping: { en: "Shipping policy", ar: "سياسة التوصيل", ku: "سیاسەتی گەیاندن" },
        page_policyReturns: { en: "Returns policy", ar: "سياسة الإرجاع", ku: "سیاسەتی گەڕاندنەوە" },
        page_policyPrivacy: { en: "Privacy policy", ar: "سياسة الخصوصية", ku: "سیاسەتی تایبەتێتی" },
        page_policyTerms: { en: "Terms", ar: "الشروط والأحكام", ku: "مەرجەکان" },
    },
    auto_form: {
        reset: { en: "Reset to default", ar: "إعادة للوضع الافتراضي", ku: "گەڕاندنەوە بۆ بنەڕەت" },
        reset_title: { en: "Reset this section to its default content", ar: "إعادة هذا القسم إلى محتواه الافتراضي", ku: "گەڕاندنەوەی ئەم بەشە بۆ ناوەڕۆکی بنەڕەتی" },
        set: { en: "Add", ar: "إضافة", ku: "زیادکردن" },
        clear: { en: "Clear", ar: "مسح", ku: "سڕینەوە" },
        // Field-header link on optional fields: unsets the value so the section's own default shows.
        use_default: { en: "Use default", ar: "استخدم الافتراضي", ku: "بنەڕەت بەکاربهێنە" },
        add: { en: "Add", ar: "إضافة", ku: "زیادکردن" },
        no_items: { en: "No items yet", ar: "لا توجد عناصر بعد", ku: "هێشتا هیچ بڕگەیەک نییە" },
        // tFormat: {n}
        item_n: { en: "Item {n}", ar: "عنصر {n}", ku: "بڕگە {n}" },
        move_up: { en: "Move up", ar: "نقل للأعلى", ku: "بردنە سەرەوە" },
        move_down: { en: "Move down", ar: "نقل للأسفل", ku: "بردنە خوارەوە" },
        remove_item: { en: "Remove item", ar: "حذف العنصر", ku: "سڕینەوەی بڕگە" },
        duplicate_item: { en: "Duplicate item", ar: "تكرار العنصر", ku: "لەبەرگرتنەوەی بڕگە" },
        expand_item: { en: "Expand item", ar: "فتح العنصر", ku: "کردنەوەی بڕگە" },
        collapse_item: { en: "Collapse item", ar: "طي العنصر", ku: "داخستنی بڕگە" },
        // An optional choice left unset: the section's built-in look.
        enum_default: { en: "Default", ar: "الافتراضي", ku: "بنەڕەت" },
        upload_image: { en: "Upload image", ar: "رفع صورة", ku: "بارکردنی وێنە" },
        uploading: { en: "Uploading…", ar: "جاري الرفع…", ku: "باردەکرێت…" },
        image_url_placeholder: { en: "https://… or paste an image URL", ar: "https://… أو الصق رابط صورة", ku: "https://… یان بەستەری وێنەیەک دابنێ" },
        // Video link field. A merchant pastes a link; the editor says back what
        // it recognised, because a link it cannot read renders no section at all
        // on the storefront and there is otherwise nothing to see.
        video_url_placeholder: { en: "Paste a YouTube, Vimeo, or MP4 link", ar: "الصق رابط يوتيوب أو فيميو أو ملف MP4", ku: "بەستەری YouTube، Vimeo، یان MP4 دابنێ" },
        video_detected_youtube: { en: "YouTube video", ar: "فيديو يوتيوب", ku: "ڤیدیۆی YouTube" },
        video_detected_vimeo: { en: "Vimeo video", ar: "فيديو فيميو", ku: "ڤیدیۆی Vimeo" },
        video_detected_file: { en: "Direct video file", ar: "ملف فيديو مباشر", ku: "فایلی ڤیدیۆی ڕاستەوخۆ" },
        video_unrecognized: { en: "Not a link this can play — the section stays hidden. YouTube, Vimeo, and .mp4 / .webm / .mov links work.", ar: "هذا الرابط لا يعمل، وسيبقى القسم مخفياً. تعمل روابط يوتيوب وفيميو وملفات mp4 و webm و mov.", ku: "بەستەرێک نییە کە بتوانرێت لێبدرێت — بەشەکە شاراوە دەمێنێتەوە. بەستەری YouTube، Vimeo، و .mp4 / .webm / .mov کاردەکەن." },
        // tFormat: {label}
        unsupported_field: { en: "Unsupported field: {label}", ar: "حقل غير مدعوم: {label}", ku: "خانەی پشتگیرینەکراو: {label}" },
        // Breakpoint override editor chrome. tFormat: {bp}
        bp_override_label: { en: "{bp} override", ar: "تخصيص {bp}", ku: "دەستکاری {bp}" },
        bp_use_base: { en: "Use base value", ar: "استخدم القيمة الأساسية", ku: "بەهای بنەڕەت بەکاربهێنە" },
        bp_unavailable: { en: "Override unavailable for this field type.", ar: "التخصيص غير متاح لهذا النوع من الحقول.", ku: "دەستکاری بەردەست نییە بۆ ئەم جۆرە خانەیە." },
        // tFormat: {min} {max} — numeric bound hints
        min_hint: { en: "Min: {min}", ar: "الأدنى: {min}", ku: "کەمترین: {min}" },
        max_hint: { en: "Max: {max}", ar: "الأقصى: {max}", ku: "زۆرترین: {max}" },
    },

    /* ── Undo-history entry descriptions (UX2-12) ─────────────── */
    history: {
        add_section: { en: "Add section", ar: "إضافة قسم", ku: "زیادکردنی بەش" },
        delete_section: { en: "Delete section", ar: "حذف قسم", ku: "سڕینەوەی بەش" },
        reorder_sections: { en: "Reorder sections", ar: "إعادة ترتيب الأقسام", ku: "ڕیزکردنەوەی بەشەکان" },
        edit_section: { en: "Edit section", ar: "تعديل قسم", ku: "دەستکاری بەش" },
        edit_brand_kit: { en: "Edit brand kit", ar: "تعديل هوية العلامة", ku: "دەستکاری کیتی برێند" },
        edit_page_seo: { en: "Edit page SEO", ar: "تعديل سيو الصفحة", ku: "دەستکاری SEO ی پەڕە" },
        resize_spacing: { en: "Resize spacing", ar: "تغيير التباعد", ku: "گۆڕینی بۆشایی" },
        edit_field: { en: "Edit field", ar: "تعديل حقل", ku: "دەستکاری خانە" },
        // Settings screens. tFormat: {name} = the screen heading.
        edit_named: { en: "Edit {name}", ar: "تعديل {name}", ku: "دەستکاری {name}" },
    },

    /* ── Simple ⇄ Advanced editor mode ────────────────────────── */
    mode: {
        group_aria: { en: "Editor mode", ar: "وضع المحرر", ku: "دۆخی دەستکاریکەر" },
        simple: { en: "Simple", ar: "بسيط", ku: "سادە" },
        advanced: { en: "Advanced", ar: "متقدم", ku: "پێشکەوتوو" },
        // One-time intro shown on the first switch to Advanced.
        intro_title: { en: "Advanced mode", ar: "الوضع المتقدم", ku: "دۆخی پێشکەوتوو" },
        intro_body: { en: "Advanced shows every option: translations, versions, per-device tweaks, visibility rules and more. Switch back to Simple anytime.", ar: "الوضع المتقدم يعرض كل الخيارات: الترجمات، والنسخ، والتخصيص لكل جهاز، وقواعد الظهور وغيرها. يمكنك العودة إلى «بسيط» في أي وقت.", ku: "دۆخی پێشکەوتوو هەموو هەڵبژاردنەکان پیشان دەدات: وەرگێڕانەکان، وەشانەکان، دەستکاری بۆ هەر ئامێرێک، ڕێساکانی دەرکەوتن و زیاتر. هەر کاتێک دەتوانی بگەڕێیتەوە بۆ «سادە»." },
        intro_dismiss: { en: "Got it", ar: "فهمت", ku: "تێگەیشتم" },
        // Toast shown when a deep link forces Advanced for this visit.
        elevated_for_link: { en: "Opened Advanced mode for this screen.", ar: "فتحنا الوضع المتقدم لهذه الشاشة.", ku: "دۆخی پێشکەوتوو کرایەوە بۆ ئەم پەردەیە." },
        // Chips shown in Simple when hidden-but-live data exists.
        // tFormat: {n}
        live_rules_chip: { en: "{n} active rules — open Advanced", ar: "قواعد مفعّلة: {n}. افتح الوضع المتقدم", ku: "{n} ڕێسای چالاک — پێشکەوتوو بکەرەوە" },
        live_versions_chip: { en: "{n} active versions — open Advanced", ar: "{n} نسخ مفعّلة — افتح المتقدم", ku: "{n} وەشانی چالاک — پێشکەوتوو بکەرەوە" },
        more_options: { en: "More options? Advanced mode", ar: "خيارات أكثر؟ الوضع المتقدم", ku: "هەڵبژاردنی زیاتر؟ دۆخی پێشکەوتوو" },
    },

    /* ── I18nStringInput (per-field translation tuck-away) ────── */
    i18n_input: {
        // tFormat: {state} e.g. "EN ✓ · KU –"
        translations_toggle: { en: "Translations ({state})", ar: "الترجمات ({state})", ku: "وەرگێڕانەکان ({state})" },
        translations_toggle_empty: { en: "Translations", ar: "الترجمات", ku: "وەرگێڕانەکان" },
        // tFormat: {lang}
        lang_filled: { en: "{lang} done", ar: "{lang} مكتملة", ku: "{lang} تەواوە" },
        // tFormat: {lang}
        lang_missing: { en: "{lang} missing", ar: "{lang} غير مترجمة", ku: "{lang} وەرنەگێڕدراوە" },
        hide_translations: { en: "Hide translations", ar: "إخفاء الترجمات", ku: "وەرگێڕانەکان بشارەوە" },
        // tFormat: {locale} — short code label, e.g. AR
        copy_from_active: { en: "Copy from {locale}", ar: "نسخ من {locale}", ku: "کۆپی لە {locale}" },
        fallback_prefix: { en: "Currently shown from EN:", ar: "يُعرض حالياً من الإنجليزية:", ku: "لە ئێستادا لە ئینگلیزییەوە پیشاندەدرێت:" },
        // tFormat: {locale} — full locale label
        collapse_aria: { en: "Collapse {locale}", ar: "طي {locale}", ku: "داخستنی {locale}" },
        locale_aria: { en: "Locale", ar: "اللغة", ku: "زمان" },
    },

    /* ── Section categories (picker chips, row sublabels) ─────── */
    section_category: {
        hero: { en: "Hero", ar: "الغلاف", ku: "سەرپەڕە" },
        trust: { en: "Trust", ar: "الثقة", ku: "متمانە" },
        products: { en: "Products", ar: "المنتجات", ku: "بەرهەمەکان" },
        story: { en: "Story", ar: "القصة", ku: "چیرۆک" },
        content: { en: "Content", ar: "المحتوى", ku: "ناوەڕۆک" },
        conversion: { en: "Conversion", ar: "التحويل", ku: "گۆڕین" },
        page: { en: "Page", ar: "الصفحة", ku: "پەڕە" },
    },

    /* ── Inspector rail (right) ───────────────────────────────── */
    inspector: {
        aria_label: { en: "Inspector", ar: "لوحة التحرير", ku: "پانێڵی دەستکاری" },
        tabs_aria_label: { en: "Inspector tabs", ar: "تبويبات لوحة التحرير", ku: "تابەکانی پانێڵی دەستکاری" },
        tab_blocks: { en: "Sections", ar: "الأقسام", ku: "بەشەکان" },
        tab_style: { en: "Style", ar: "هوية العلامة", ku: "شێواز" },
        tab_seo: { en: "SEO", ar: "جوجل", ku: "گووگڵ" },
        tab_health: { en: "Store health", ar: "صحة المتجر", ku: "تەندروستی فرۆشگا" },
        // Style tab routes to the full-screen Brand Kit — the full editor
        // is a two-pane layout that cannot fit in the 380px rail.
    },

    /* ── Top toolbar chrome ───────────────────────────────────── */
    toolbar: {
        back_to_hub: { en: "Back to store builder", ar: "العودة إلى مركز المتجر", ku: "گەڕانەوە بۆ ناوەندی فرۆشگا" },
        subtitle: { en: "Store builder", ar: "محرر المتجر", ku: "دروستکەری فرۆشگا" },
        breakpoint_group: { en: "Preview breakpoint", ar: "حجم المعاينة", ku: "قەبارەی پێشبینین" },
        breakpoint_mobile: { en: "Mobile", ar: "هاتف", ku: "مۆبایل" },
        breakpoint_tablet: { en: "Tablet", ar: "لوحي", ku: "تابلێت" },
        breakpoint_desktop: { en: "Desktop", ar: "حاسوب", ku: "کۆمپیوتەر" },
        locale_select: { en: "Editor and preview language", ar: "لغة المحرر والمعاينة", ku: "زمانی دەستکاریکەر و پێشبینین" },
        undo: { en: "Undo", ar: "تراجع", ku: "پاشگەزبوونەوە" },
        redo: { en: "Redo", ar: "إعادة", ku: "دووبارەکردنەوە" },
        // tFormat: {desc}
        undo_titled: { en: "Undo: {desc}", ar: "تراجع: {desc}", ku: "پاشگەزبوونەوە: {desc}" },
        redo_titled: { en: "Redo: {desc}", ar: "إعادة: {desc}", ku: "دووبارەکردنەوە: {desc}" },
        history_generic: { en: "Last change", ar: "آخر تعديل", ku: "دوایین گۆڕانکاری" },
        nothing_to_undo: { en: "Nothing to undo", ar: "لا شيء للتراجع عنه", ku: "هیچ شت نییە بۆ پاشگەزبوونەوە" },
        nothing_to_redo: { en: "Nothing to redo", ar: "لا شيء لإعادته", ku: "هیچ شت نییە بۆ دووبارەکردنەوە" },
        preview: { en: "Preview", ar: "معاينة", ku: "پێشبینین" },
        preview_title: { en: "Preview at a real device viewport", ar: "معاينة بحجم جهاز حقيقي", ku: "پێشبینین بە قەبارەی ئامێری ڕاستەقینە" },
        open: { en: "Open", ar: "فتح", ku: "کردنەوە" },
        open_title: { en: "Open your store in a new tab", ar: "افتح متجرك في تبويب جديد", ku: "فرۆشگاکەت لە تابێکی نوێدا بکەرەوە" },
        loading_preview: { en: "Loading preview…", ar: "جاري تحميل المعاينة…", ku: "پێشبینین باردەکرێت…" },
        back_to_canvas: { en: "Back to editor", ar: "العودة إلى المحرر", ku: "گەڕانەوە بۆ دەستکاریکەر" },
        zoom_group: { en: "Canvas zoom", ar: "تكبير المعاينة", ku: "زووم" },
        zoom_fit: { en: "Fit", ar: "ملاءمة", ku: "گونجاندن" },
    },

    /* ── Draft crash-recovery banner ──────────────────────────── */
    recovery: {
        // tFormat: {time}
        message: { en: "Unsaved changes from {time} were recovered.", ar: "تم استرداد تغييرات غير محفوظة من {time}.", ku: "گۆڕانکارییە خەزننەکراوەکانی {time} گەڕێندرانەوە." },
        restore: { en: "Restore", ar: "استرداد", ku: "گەڕاندنەوە" },
        dismiss: { en: "Dismiss recovery banner", ar: "إغلاق شريط الاسترداد", ku: "داخستنی شریتی گەڕاندنەوە" },
        time_just_now: { en: "just now", ar: "قبل لحظات", ku: "هەر ئێستا" },
    },

    /* ── Post-wizard welcome (one-time overlay) ───────────────── */
    welcome: {
        title: { en: "Your store is ready!", ar: "متجرك جاهز!", ku: "فرۆشگاکەت ئامادەیە!" },
        subtitle: { en: "We built it from your answers — here's all you need to know:", ar: "بنيناه من إجاباتك — هذا كل اللي تحتاج تعرفه:", ku: "لە وەڵامەکانتەوە دروستمان کرد — ئەمە هەموو ئەوەیە کە پێویستە بیزانیت:" },
        bullet_edit: { en: "Click any text or image on the page to edit it.", ar: "اضغط على أي نص أو صورة بالصفحة لتعديلها.", ku: "کلیک لە هەر دەق یان وێنەیەک بکە لە پەڕەکە بۆ دەستکاری." },
        bullet_autosave: { en: "Everything saves automatically as you work.", ar: "كل شيء يُحفظ تلقائياً وأنت تشتغل.", ku: "هەموو شتێک بە خۆکار خەزن دەبێت کاتێک کاردەکەیت." },
        bullet_publish: { en: "Hit Publish whenever you're ready — you can keep editing after.", ar: "اضغط «نشر» عندما تكون جاهزاً، ويمكنك متابعة التعديل بعدها.", ku: "«بڵاوکردنەوە» دابگرە هەر کاتێک ئامادەبوویت — دواتریش دەتوانی بەردەوام بیت لە دەستکاری." },
        cta: { en: "Let's go", ar: "يلا نبدأ", ku: "با دەستپێبکەین" },
    },

    /* ── First-run banner (canvas top) ────────────────────────── */
    first_run: {
        message_home: { en: "This is your homepage. Click any text to edit it, and hit Publish when you're ready.", ar: "هذه صفحتك الرئيسية. اضغط على أي نص لتعديله، واضغط «نشر» عندما تكون جاهزاً.", ku: "ئەمە پەڕەی سەرەکیتە. کلیک لە هەر دەقێک بکە بۆ دەستکاری، و «بڵاوکردنەوە» دابگرە کاتێک ئامادەبوویت." },
        // tFormat: {page}
        message_page: { en: "You're editing “{page}”. Click any text to edit it.", ar: "أنت تعدّل صفحة «{page}». اضغط على أي نص لتعديله.", ku: "تۆ پەڕەی «{page}» دەستکاری دەکەیت. کلیک لە هەر دەقێک بکە بۆ دەستکاری." },
        dismiss: { en: "Dismiss", ar: "إغلاق", ku: "داخستن" },
    },

    /* ── Version history ──────────────────────────────────────── */
    version_history: {
        heading: { en: "Version history", ar: "سجل التغييرات", ku: "مێژووی گۆڕانکارییەکان" },
        subtitle: { en: "Restore any previous version of your store. Named snapshots never expire.", ar: "استرجع أي نسخة سابقة من متجرك. اللقطات المسمّاة لا تنتهي صلاحيتها.", ku: "هەر وەشانێکی پێشووی فرۆشگاکەت بگەڕێنەوە. وێنە ناودارەکان بەسەرنایەن." },
        back: { en: "Back", ar: "رجوع", ku: "گەڕانەوە" },
        refresh: { en: "Refresh", ar: "تحديث", ku: "نوێکردنەوە" },
        save_snapshot: { en: "Save snapshot", ar: "حفظ لقطة", ku: "هەڵگرتنی وێنە" },
        snapshot_placeholder: { en: "Label, e.g. 'Before Eid sale'", ar: "اسم، مثال: «قبل تخفيضات العيد»", ku: "ناو، نموونە: 'پێش فرۆشتنی جەژن'" },
        save: { en: "Save", ar: "حفظ", ku: "هەڵگرتن" },
        cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوەوە" },
        empty_title: { en: "No versions yet", ar: "لا توجد نسخ بعد", ku: "هێشتا وەشان نییە" },
        empty_hint: { en: "Snapshots are created automatically on publish, or you can save a named snapshot right now.", ar: "تُنشأ اللقطات تلقائياً عند النشر، أو يمكنك حفظ لقطة مسمّاة الآن.", ku: "وێنەکان بەشێوەی ئۆتۆماتیکی لە کاتی بڵاوکردنەوەدا دروستدەکرێن، یان دەتوانی ئێستا وێنەی ناودار هەڵبگریت." },
        untitled_snapshot: { en: "Untitled snapshot", ar: "لقطة بدون عنوان", ku: "وێنەی بێ ناونیشان" },
        auto_save: { en: "Auto-save", ar: "حفظ تلقائي", ku: "خەزنی ئۆتۆماتیک" },
        select_to_view: { en: "Select a version to view its details and changes.", ar: "اختر نسخة لعرض تفاصيلها وتغييراتها.", ku: "وەشانێک هەڵبژێرە بۆ بینینی وردەکارییەکانی و گۆڕانکارییەکانی." },
        restore: { en: "Restore this version", ar: "استرجاع هذه النسخة", ku: "گەڕاندنەوەی ئەم وەشانە" },
        save_as_named: { en: "Save as named snapshot", ar: "حفظ كلقطة مسمّاة", ku: "هەڵگرتن وەکو وێنەی ناودار" },
        restore_title: { en: "Restore this version?", ar: "استرجاع هذه النسخة؟", ku: "ئەم وەشانە بگەڕێنیتەوە؟" },
        restore_confirm: { en: "Restore", ar: "استرجاع", ku: "گەڕاندنەوە" },
        diff_heading_count: { en: "What restoring changes: {n}", ar: "ما سيتغيّر عند الاسترجاع: {n}", ku: "ئەوەی بە گەڕاندنەوە دەگۆڕێت: {n}" },
        diff_empty: { en: "No differences vs your current draft.", ar: "لا توجد فروقات مقارنة بمسودتك الحالية.", ku: "هیچ جیاوازییەک نییە بەراورد بە ڕەشنووسی ئێستات." },
        diff_added: { en: "adds", ar: "سيُضاف", ku: "زیاد دەکرێت" },
        diff_removed: { en: "removes", ar: "سيُحذف", ku: "لادەبرێت" },
        diff_changed: { en: "changes", ar: "سيتغيّر", ku: "دەگۆڕێت" },
        diff_to_default: { en: "back to default", ar: "سيعود للافتراضي", ku: "دەگەڕێتەوە بۆ بنەڕەت" },
        // tFormat: {n} — an unnamed list item in a change trail
        diff_item_n: { en: "Item {n}", ar: "العنصر {n}", ku: "بڕگەی {n}" },
        // Past tense, for the publish sheet (what you changed in the draft).
        changed_past: { en: "changed", ar: "تغيّر", ku: "گۆڕا" },
        restore_stops_title: { en: "Restoring this stops what is live now:", ar: "استرجاع هذه النسخة يوقف ما يعمل الآن:", ku: "گەڕاندنەوەی ئەمە ئەوەی ئێستا کار دەکات ڕادەگرێت:" },
        restore_stops_tests: { en: "Running tests:", ar: "اختبارات قيد التشغيل:", ku: "تاقیکردنەوە چالاکەکان:" },
        // Diff group titles, by the config's top-level field.
        group_pages: { en: "Pages", ar: "الصفحات", ku: "پەڕەکان" },
        group_globals: { en: "Header, footer and top bar", ar: "الترويسة والتذييل والشريط العلوي", ku: "سەرپەڕە، ژێرپەڕە و شریتی سەرەوە" },
        group_brand_kit: { en: "Look and brand", ar: "هوية العلامة", ku: "برێند و ڕووکار" },
        group_commerce: { en: "Selling settings", ar: "إعدادات البيع", ku: "ڕێکخستنەکانی فرۆشتن" },
        group_languages: { en: "Languages", ar: "اللغات", ku: "زمانەکان" },
        group_custom_pages: { en: "Your own pages", ar: "صفحاتك الخاصة", ku: "پەڕە تایبەتەکانت" },
        group_redirects: { en: "Link redirects", ar: "إعادة توجيه الروابط", ku: "گواستنەوەی بەستەرەکان" },
        group_other: { en: "Other settings", ar: "إعدادات أخرى", ku: "ڕێکخستنی تر" },
        group_segments: { en: "Audiences", ar: "الجمهور", ku: "بینەران" },
        group_experiments: { en: "Tests", ar: "الاختبارات", ku: "تاقیکردنەوەکان" },
        group_schedules: { en: "Scheduled changes", ar: "التغييرات المجدولة", ku: "گۆڕانکارییە خشتەکراوەکان" },
        area_whatsapp: { en: "WhatsApp", ar: "واتساب", ku: "واتسئاپ" },
        area_socials: { en: "Social links", ar: "روابط التواصل الاجتماعي", ku: "بەستەرە کۆمەڵایەتییەکان" },
        area_returns: { en: "Returns policy", ar: "سياسة الإرجاع", ku: "سیاسەتی گەڕاندنەوە" },
        area_delivery_promise: { en: "Delivery promise", ar: "وعد التوصيل", ku: "بەڵێنی گەیاندن" },
        area_contact: { en: "Contact details", ar: "بيانات التواصل", ku: "زانیاری پەیوەندی" },
        area_referral: { en: "Referrals", ar: "الإحالات", ku: "ناساندن" },
        key_default_rate: { en: "Standard fee", ar: "الأجرة العادية", ku: "کرێی ئاسایی" },
        key_rates: { en: "Fees by governorate", ar: "الأجور حسب المحافظة", ku: "کرێ بەپێی پارێزگا" },
        key_eta_hours: { en: "Delivery time (hours)", ar: "مدة التوصيل (ساعات)", ku: "کاتی گەیاندن (کاتژمێر)" },
        key_variants: { en: "Versions", ar: "النسخ", ku: "وەشانەکان" },
        key_kind: { en: "Type", ar: "النوع", ku: "جۆر" },
        key_rules: { en: "Conditions", ar: "الشروط", ku: "مەرجەکان" },
        key_values: { en: "Values", ar: "القيم", ku: "بەهاکان" },
        key_sections: { en: "Sections", ar: "الأقسام", ku: "بەشەکان" },
        key_meta: { en: "Google listing", ar: "الظهور في جوجل", ku: "دەرکەوتن لە گووگڵ" },
        key_fee_iqd: { en: "Delivery fee (IQD)", ar: "أجرة التوصيل (د.ع)", ku: "کرێی گەیاندن (د.ع)" },
        key_free_threshold_iqd: { en: "Free delivery from (IQD)", ar: "توصيل مجاني من (د.ع)", ku: "گەیاندنی بەخۆڕایی لە (د.ع)" },
        // Diff value words: on/off fields and a list of ids.
        value_on: { en: "On", ar: "مفعّل", ku: "چالاک" },
        value_off: { en: "Off", ar: "متوقف", ku: "ناچالاک" },
        // tFormat: {n}
        value_iqd: { en: "{n} IQD", ar: "{n} د.ع", ku: "{n} د.ع" },
        value_reordered: { en: "The order changes.", ar: "سيتغيّر الترتيب.", ku: "ڕیزبەندی دەگۆڕێت." },
        value_items_swapped: { en: "Same number of items, but different ones.", ar: "العدد نفسه، لكن بعناصر مختلفة.", ku: "هەمان ژمارە، بەڵام بڕگەی جیاواز." },
        value_items_n: { en: "{n} items", ar: "{n} عناصر", ku: "{n} بڕگە" },
        key_code: { en: "Code", ar: "الكود", ku: "کۆد" },
        key_value: { en: "Value", ar: "القيمة", ku: "بەها" },
        key_min_subtotal_iqd: { en: "Minimum order", ar: "الحد الأدنى للطلب", ku: "کەمترین داواکاری" },
        key_max_discount_iqd: { en: "Maximum discount", ar: "أقصى خصم", ku: "زۆرترین داشکاندن" },
    },

    /* ── Scheduled changes ────────────────────────────────────── */
    scheduled: {
        heading: { en: "Scheduled changes", ar: "التغييرات المجدولة", ku: "گۆڕانکارییە خشتەکراوەکان" },
        subtitle: { en: "Time-windowed variants you’ve set up across your store.", ar: "اختلافات محدّدة زمنياً قمت بإعدادها في متجرك.", ku: "جیاوازییە کاتدارەکانی فرۆشگاکەت کە دایناون." },
        new: { en: "New schedule", ar: "جدولة جديدة", ku: "خشتەی نوێ" },
        empty_title: { en: "No scheduled changes", ar: "لا توجد تغييرات مجدولة", ku: "هیچ گۆڕانکارییەکی خشتەکراو نییە" },
        empty_hint: { en: "Use this screen to schedule future variants of any section — promo banners, hero swaps, free-shipping notices, and more.", ar: "استخدم هذه الشاشة لجدولة اختلافات مستقبلية لأي قسم — لافتات ترويجية، تبديل الغلاف، إشعارات الشحن المجاني، والمزيد.", ku: "ئەم پەردەیە بەکاربهێنە بۆ خشتەکردنی جیاوازی داهاتووی هەر بەشێک — بانەری بانگەشە، گۆڕینی هیرۆ، ئاگادارکردنەوەی گەیاندنی بەخۆڕایی، و زیاتر." },
        bucket_active: { en: "Active", ar: "نشط", ku: "چالاک" },
        bucket_upcoming: { en: "Upcoming", ar: "قادم", ku: "داهاتوو" },
        bucket_expired: { en: "Expired", ar: "منتهي", ku: "بەسەرچوو" },
        show: { en: "show", ar: "إظهار", ku: "پیشاندان" },
        hide: { en: "hide", ar: "إخفاء", ku: "شاردنەوە" },
        view: { en: "View", ar: "عرض", ku: "بینین" },
        end_early: { en: "End early", ar: "إنهاء مبكر", ku: "زوو کۆتاییپێهێنان" },
        edit_start: { en: "Edit start", ar: "تعديل البداية", ku: "دەستکاری دەستپێک" },
        cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوەوە" },
        delete: { en: "Delete", ar: "حذف", ku: "سڕینەوە" },
        targets_heading: { en: "Targets", ar: "الأهداف", ku: "ئامانجەکان" },
    },

    /* ── Health checklist ─────────────────────────────────────── */
    health: {
        heading: { en: "Store health", ar: "صحة المتجر", ku: "تەندروستی فرۆشگا" },
        // tFormat: {tenant}
        subtitle: { en: "{tenant} — what to check before you publish", ar: "{tenant} — ما يجب فحصه قبل النشر", ku: "{tenant} — چی پێویستە بپشکنرێت پێش بڵاوکردنەوە" },
        out_of_100: { en: "out of 100", ar: "من 100", ku: "لە ١٠٠" },
        score_needs_work: { en: "Needs work", ar: "يحتاج عملاً", ku: "پێویستی بە کار هەیە" },
        score_almost: { en: "Almost there", ar: "اقتربت", ku: "نزیکی" },
        score_ready: { en: "Ready to publish", ar: "جاهز للنشر", ku: "ئامادەیە بۆ بڵاوکردنەوە" },
        score_great: { en: "Looking great", ar: "ممتاز", ku: "زۆر باشە" },
        cat_ad_compliance: { en: "Ad compliance", ar: "الامتثال الإعلاني", ku: "گونجاندنی ڕیکلام" },
        cat_conversion: { en: "Conversion", ar: "التحويل", ku: "گۆڕین" },
        cat_seo: { en: "Search (Google)", ar: "الظهور في جوجل", ku: "دەرکەوتن لە گووگڵ" },
        cat_trust: { en: "Trust", ar: "الثقة", ku: "متمانە" },
        cat_content: { en: "Content", ar: "المحتوى", ku: "ناوەڕۆک" },
        cat_performance: { en: "Performance", ar: "الأداء", ku: "کارایی" },
        // tFormat: {n}
        blocks_publish: { en: "Blocks publish ({n})", ar: "يحظر النشر ({n})", ku: "ڕێگری لە بڵاوکردنەوە دەکات ({n})" },
        blocks_publish_hint: { en: "— fix these before you can publish.", ar: "— أصلحها قبل أن تتمكّن من النشر.", ku: "— پێش بڵاوکردنەوە چاکیانبکە." },
        blocks_publish_chip: { en: "Blocks publish", ar: "يحظر النشر", ku: "ڕێگری لە بڵاوکردنەوە دەکات" },
        close: { en: "Close health screen", ar: "إغلاق شاشة الصحة", ku: "داخستنی پەردەی تەندروستی" },
        filter_all: { en: "all", ar: "الكل", ku: "هەموو" },
        filter_failing: { en: "Problems + advice", ar: "مشاكل ونصائح", ku: "کێشە و ئامۆژگاری" },
        filter_warn: { en: "Advice", ar: "ننصح بإصلاحه", ku: "پێشنیار دەکرێت" },
        filter_passing: { en: "passing", ar: "ناجح", ku: "سەرکەوتوو" },
        // tFormat: {visible} {total}
        checks_count: { en: "{visible} of {total} checks", ar: "الفحوصات: {visible} من {total}", ku: "{visible} لە {total} پشکنین" },
        no_checks_match: { en: "No checks match this filter — nice work.", ar: "لا توجد فحوصات تطابق هذا الفلتر — عمل ممتاز.", ku: "هیچ پشکنینێک لەگەڵ ئەم پاڵاوتنە ناگونجێت — کاری باش." },
        // First-launch ordered checklist (2.3)
        launch_title: { en: "Ready to launch?", ar: "جاهز للإطلاق؟", ku: "ئامادەی بۆ دەستپێکردن؟" },
        // tFormat: {done} {total}
        launch_progress: { en: "{done} of {total} steps done", ar: "أنجزت {done} من {total} خطوات", ku: "{done} لە {total} هەنگاو تەواوبوو" },
        launch_step_logo: { en: "Upload your logo", ar: "ارفع شعارك", ku: "لۆگۆکەت باربکە" },
        launch_step_whatsapp: { en: "Add your WhatsApp number", ar: "أضف رقم الواتساب", ku: "ژمارەی واتساپەکەت زیاد بکە" },
        launch_step_home: { en: "Build your home page", ar: "ابنِ صفحتك الرئيسية", ku: "پەڕەی سەرەکیت دروست بکە" },
        launch_step_policies: { en: "Fill your policy pages", ar: "أكمل صفحات السياسات", ku: "پەڕەکانی ڕێساکان تەواو بکە" },
        launch_step_publish: { en: "Publish your store", ar: "انشر متجرك", ku: "فرۆشگاکەت بڵاوبکەرەوە" },
        launch_step_publish_hint: { en: "Use the Publish button at the top when the steps above are done.", ar: "استخدم زر «نشر» في الأعلى بعد إكمال الخطوات.", ku: "دوگمەی «بڵاوکردنەوە» لە سەرەوە بەکاربهێنە دوای تەواوکردنی هەنگاوەکان." },
        launch_fix: { en: "Do it", ar: "أكملها", ku: "تەواوی بکە" },
        launch_all_done: { en: "All set — your store is live!", ar: "اكتمل الإعداد، ومتجرك مباشر الآن.", ku: "هەموو شت تەواوە — فرۆشگاکەت بڵاوە!" },
        // Inline WhatsApp capture inside the checklist row (S3-01)
        launch_whatsapp_placeholder: { en: "07XXXXXXXXX", ar: "07XXXXXXXXX", ku: "07XXXXXXXXX" },
        launch_whatsapp_save: { en: "Save", ar: "حفظ", ku: "پاشەکەوت" },
        launch_whatsapp_invalid: { en: "Enter a valid Iraqi number, e.g. 07701234567.", ar: "أدخل رقماً عراقياً صحيحاً، مثل 07701234567.", ku: "ژمارەیەکی عێراقی دروست بنووسە، وەک 07701234567." },
        launch_whatsapp_history: { en: "Set WhatsApp number", ar: "تعيين رقم الواتساب", ku: "دانانی ژمارەی واتساپ" },
        // Inline delivery-fee capture (S3-09 — moved out of the wizard)
        launch_step_delivery: { en: "Set your delivery fee", ar: "حدد رسوم التوصيل", ku: "کرێی گەیاندن دیاری بکە" },
        // tFormat: {page}
        on_page: { en: "Page: {page}", ar: "الصفحة: {page}", ku: "پەڕە: {page}" },
        // Finished launch steps read as a fact, not a crossed-out order.
        launch_done_logo: { en: "Logo uploaded", ar: "تم رفع الشعار", ku: "لۆگۆ بارکرا" },
        launch_done_whatsapp: { en: "WhatsApp number added", ar: "تمت إضافة رقم الواتساب", ku: "ژمارەی واتساپ زیادکرا" },
        launch_done_delivery: { en: "Delivery fee set", ar: "تم تحديد رسوم التوصيل", ku: "کرێی گەیاندن دیاریکرا" },
        launch_done_home: { en: "Home page built", ar: "الصفحة الرئيسية جاهزة", ku: "پەڕەی سەرەکی ئامادەیە" },
        launch_done_policies: { en: "Policy pages filled", ar: "صفحات السياسات مكتملة", ku: "پەڕەکانی ڕێساکان تەواون" },
        launch_done_publish: { en: "Store published", ar: "المتجر منشور", ku: "فرۆشگاکە بڵاوکراوەتەوە" },
        launch_delivery_placeholder: { en: "5000", ar: "5000", ku: "5000" },
        launch_delivery_invalid: { en: "Enter the fee in whole dinars, e.g. 5000, or 0 for free delivery.", ar: "أدخل الرسوم بالدينار، مثل 5000، أو 0 للتوصيل المجاني.", ku: "کرێیەکە بە دینار بنووسە، وەک 5000، یان 0 بۆ گەیاندنی بێبەرامبەر." },
        launch_delivery_history: { en: "Set delivery fee", ar: "تحديد رسوم التوصيل", ku: "دیاریکردنی کرێی گەیاندن" },
    },

    /* ── Page SEO panel ───────────────────────────────────────── */
    seo: {
        // tFormat: {page}
        heading: { en: "Google — {page}", ar: "الظهور في جوجل — {page}", ku: "دەرکەوتن لە گووگڵ — {page}" },
        subtitle: { en: "How this page appears in Google and when it's shared.", ar: "كيف تظهر هذه الصفحة في جوجل وعند مشاركتها.", ku: "ئەم پەڕەیە چۆن لە گووگڵ و لە کاتی هاوبەشکردندا دەردەکەوێت." },
        serp_preview: { en: "Search preview", ar: "معاينة البحث", ku: "پێشبینینی گەڕان" },
        title_label: { en: "Title in Google", ar: "العنوان في جوجل", ku: "ناونیشان لە گووگڵ" },
        title_help: { en: "About 60 characters. The blue headline in search results.", ar: "حوالي 60 حرفاً. العنوان الأزرق في نتائج البحث.", ku: "نزیکەی 60 پیت. ناونیشانە شینەکە لە ئەنجامەکانی گەڕاندا." },
        description_label: { en: "Description in Google", ar: "الوصف في جوجل", ku: "وەسف لە گووگڵ" },
        description_help: { en: "About 155 characters. The grey text under the title.", ar: "حوالي 155 حرفاً. النص الرمادي تحت العنوان.", ku: "نزیکەی 155 پیت. دەقە خۆڵەمێشییەکەی ژێر ناونیشانەکە." },
        description_fallback: { en: "Add a description so Google doesn't generate its own.", ar: "أضف وصفاً حتى لا يولّد جوجل وصفاً من عنده.", ku: "وەسفێک زیاد بکە بۆ ئەوەی گووگڵ خۆی وەسف دروست نەکات." },
        og_label: { en: "Social share image", ar: "صورة المشاركة الاجتماعية", ku: "وێنەی هاوبەشکردنی سۆشیال" },
        og_help: { en: "1200×630 recommended. Shown when the page is shared on WhatsApp or social. Falls back to your store's brand-kit image.", ar: "يُنصح بمقاس 1200×630. تظهر عند مشاركة الصفحة على واتساب أو وسائل التواصل. تُستخدم صورة هوية العلامة إن لم تُحدَّد.", ku: "قەبارەی 1200×630 پێشنیار دەکرێت. دەردەکەوێت کاتێک پەڕەکە لە واتساپ یان سۆشیال میدیا هاوبەش دەکرێت. ئەگەر دانەنرێت وێنەی کیتی برێند بەکاردێت." },
        noindex_label: { en: "Hide from search engines", ar: "إخفاء عن محركات البحث", ku: "شاردنەوە لە بزوێنەرەکانی گەڕان" },
        noindex_help: { en: "Google won't list this page in search results.", ar: "لن يعرض جوجل هذه الصفحة في نتائج البحث.", ku: "گووگڵ ئەم پەڕەیە لە ئەنجامەکانی گەڕاندا پیشان نادات." },
        noindex_aria: { en: "Hide this page from search engines", ar: "إخفاء هذه الصفحة عن محركات البحث", ku: "ئەم پەڕەیە لە بزوێنەرەکانی گەڕان بشارەوە" },
    },

    /* ── Live-preview context menu ────────────────────────────── */
    context_menu: {
        add_variant: { en: "Add variant", ar: "إضافة نسخة", ku: "زیادکردنی وەشان" },
    },

    /* ── Mobile editor shell ──────────────────────────────────── */
    mobile: {
        first_run_message: { en: "Tap any text to edit. Hit Publish when ready.", ar: "اضغط على أي نص لتعديله. اضغط «نشر» عندما تكون جاهزاً.", ku: "کلیک لە هەر دەقێک بکە بۆ دەستکاری. «بڵاوکردنەوە» دابگرە کاتێک ئامادەبوویت." },
        open_pages_menu: { en: "Open pages menu", ar: "فتح قائمة الصفحات", ku: "کردنەوەی مێنیوی پەڕەکان" },
        more_options: { en: "More options", ar: "خيارات إضافية", ku: "هەڵبژاردنی زیاتر" },
        more_title: { en: "Preview & history", ar: "المعاينة والسجل", ku: "پێشبینین و مێژوو" },
        history_heading: { en: "History", ar: "السجل", ku: "مێژوو" },
        language_heading: { en: "Language", ar: "اللغة", ku: "زمان" },
        preview_size_heading: { en: "Preview size", ar: "حجم المعاينة", ku: "قەبارەی پێشبینین" },
        pages_subtitle: { en: "Tap a page to edit", ar: "اضغط على صفحة لتعديلها", ku: "کلیک لە پەڕەیەک بکە بۆ دەستکاری" },
        edit_properties: { en: "Edit properties", ar: "تعديل الخصائص", ku: "دەستکاری تایبەتمەندییەکان" },
        // Desktop-only stub. tFormat: {name}
        stub_title: { en: "Open on a larger screen to edit {name}", ar: "افتح على شاشة أكبر لتعديل {name}", ku: "لە شاشەیەکی گەورەتردا بیکەرەوە بۆ دەستکاری {name}" },
        stub_body: { en: "This section has lots of fine-grained controls that don't fit on a phone. Open this editor on a tablet or laptop to make changes.", ar: "يحتوي هذا القسم على الكثير من الإعدادات الدقيقة التي لا تناسب شاشة الهاتف. افتح هذا المحرر على جهاز لوحي أو حاسوب لإجراء التغييرات.", ku: "ئەم بەشە کۆنترۆڵی وردی زۆری تێدایە کە لە مۆبایلدا جێی نابێتەوە. ئەم دەستکاریکەرە لە تابلێت یان لاپتۆپدا بکەرەوە بۆ گۆڕانکاری." },
        // Stub labels whose wording differs from the page-tree entries.
        stub_label_brand_kit: { en: "Brand Kit", ar: "هوية العلامة", ku: "کیتی برێند" },
        stub_label_versions: { en: "Version history", ar: "سجل النسخ", ku: "مێژووی وەشانەکان" },
        stub_label_i18n: { en: "Translations", ar: "الترجمات", ku: "وەرگێڕانەکان" },
    },

    /* ── Brand-kit editor body (agent A region — UX2-06/07/08/09) ── */
    /* ── Brand-kit live preview card (S3-03 localization) ────────── */
    brand_kit_preview: {
        heading: { en: "Live preview", ar: "معاينة حية", ku: "پێشبینینی ڕاستەوخۆ" },
        realtime: { en: "Real-time", ar: "مباشر", ku: "ڕاستەوخۆ" },
        wordmark_caption: { en: "Brand wordmark + body type", ar: "شعار العلامة وخط النص", ku: "لۆگۆی برێند و فۆنتی دەق" },
        cta_label: { en: "Button", ar: "زر", ku: "دوگمە" },
        cta_sample: { en: "Shop now", ar: "تسوّق الآن", ku: "ئێستا بکڕە" },
        surface_label: { en: "Surface", ar: "سطح", ku: "ڕووکار" },
        surface_sample: { en: "Hello", ar: "مرحباً", ku: "سڵاو" },
        ink_label: { en: "Text", ar: "النص", ku: "دەق" },
        ink_sample: { en: "Aa Bb", ar: "أب جد", ku: "ئا ب" },
        sale_sample: { en: "SALE!", ar: "تخفيض!", ku: "داشکاندن!" },
        tokens_heading: { en: "Resolved palette", ar: "الألوان الناتجة", ku: "ڕەنگە دەرئەنجامەکان" },
        store_fallback: { en: "Your Store", ar: "متجرك", ku: "فرۆشگاکەت" },
    },

    brand_kit_body: {
        // Identity
        tagline_placeholder: { en: "A short line that describes your store", ar: "سطر قصير يصف متجرك", ku: "دێڕێکی کورت کە فرۆشگاکەت وەسف دەکات" },
        // Color swatch labels
        color_primary: { en: "Primary", ar: "الأساسي", ku: "سەرەکی" },
        color_secondary: { en: "Secondary", ar: "الثانوي", ku: "لاوەکی" },
        color_accent: { en: "Accent", ar: "المميّز", ku: "جیاکەرەوە" },
        color_surface: { en: "Surface", ar: "الخلفية", ku: "ڕووکار" },
        color_surface_alt: { en: "Surface alt", ar: "الخلفية البديلة", ku: "ڕووکاری لاوەکی" },
        color_ink: { en: "Text colour", ar: "لون النص", ku: "ڕەنگی دەق" },
        color_success: { en: "Success", ar: "النجاح", ku: "سەرکەوتن" },
        color_danger: { en: "Danger", ar: "الخطر", ku: "مەترسی" },
        // Palette extraction errors
        extract_error_no_colors: { en: "Couldn't find dominant colors in this logo.", ar: "تعذّر العثور على ألوان بارزة في هذا الشعار.", ku: "نەتوانرا ڕەنگە سەرەکییەکان لەم لۆگۆیەدا بدۆزرێنەوە." },
        extract_error_cors: { en: "Couldn't read logo — make sure it's hosted with CORS enabled.", ar: "تعذّرت قراءة الشعار — تأكد من أنه مستضاف مع تفعيل CORS.", ku: "نەتوانرا لۆگۆکە بخوێنرێتەوە — دڵنیابە لەوەی لە شوێنێک دانراوە کە CORS چالاککراوە." },
        // Toasts. tFormat: {hex} {slot}
        toast_applied_color: { en: "Applied {hex} to {slot}", ar: "تم تطبيق {hex} على {slot}", ku: "{hex} بۆ {slot} جێبەجێکرا" },
        toast_palette_generated: { en: "New palette generated", ar: "تم إنشاء لوحة ألوان جديدة", ku: "پاڵێتێکی نوێ دروستکرا" },
        // Voice — formality option subtitles
        formality_sub_formal: { en: "Precise, polite", ar: "دقيق ومهذّب", ku: "ورد و بەڕێز" },
        formality_sub_casual: { en: "Friendly, easy", ar: "ودود وبسيط", ku: "دۆستانە و ئاسان" },
        formality_sub_playful: { en: "Fun, cheeky", ar: "مرح وجريء", ku: "خۆش و شۆخ" },
        formality_sub_luxe: { en: "Elevated, refined", ar: "راقٍ وأنيق", ku: "بەرز و ناسک" },
        notes_placeholder: { en: "Anything else worth knowing about how you want to speak…", ar: "أي شيء آخر يجدر معرفته عن أسلوب مخاطبتك لعملائك…", ku: "هەر شتێکی تر کە پێویستە بزانرێت دەربارەی شێوازی قسەکردنت…" },
        help_notes: { en: "Used as guidance for content writers and templates.", ar: "تُستخدم كإرشادات لكتّاب المحتوى والقوالب.", ku: "وەکو ڕێنمایی بۆ نووسەرانی ناوەڕۆک و قاڵبەکان بەکاردێت." },
        // Color popover
        hue: { en: "Hue", ar: "درجة اللون", ku: "تۆنی ڕەنگ" },
        saturation: { en: "Saturation", ar: "التشبّع", ku: "تێربوونی ڕەنگ" },
        lightness: { en: "Lightness", ar: "الإضاءة", ku: "ڕووناکی" },
        suggested: { en: "Suggested", ar: "مقترحة", ku: "پێشنیارکراو" },
        pick: { en: "Pick", ar: "التقاط", ku: "هەڵگرتن" },
        // Aria templates. tFormat: {label}
        edit_color_aria: { en: "Edit {label} color", ar: "تعديل لون {label}", ku: "دەستکاری ڕەنگی {label}" },
        clear_aria: { en: "Clear {label}", ar: "مسح {label}", ku: "سڕینەوەی {label}" },
        // Upload toasts. tFormat: {label} {mb}
        upload_too_large: { en: "{label} must be under {mb}MB", ar: "يجب أن يكون {label} أقل من {mb}MB", ku: "پێویستە {label} لە {mb}MB کەمتر بێت" },
        upload_missing_tenant: { en: "Missing tenant context for upload", ar: "سياق المتجر مفقود — تعذّر الرفع", ku: "زانیاری فرۆشگا بەردەست نییە — بارکردن نەکرا" },
        upload_success: { en: "{label} uploaded", ar: "تم رفع {label}", ku: "{label} بارکرا" },
        upload_failed_title: { en: "Upload failed", ar: "فشل الرفع", ku: "بارکردن شکستی هێنا" },
        upload_failed_body: { en: "Something went wrong while uploading. Please try again.", ar: "حدث خطأ أثناء الرفع. يرجى المحاولة مرة أخرى.", ku: "هەڵەیەک ڕوویدا لە کاتی بارکردندا. تکایە دووبارە هەوڵبدەوە." },
    },

    /* ── Store Command Center hub chrome (UX2-14) ────────────────── */
    // The `/store` hub the merchant lands on before opening the editor:
    // header bar, live-preview card, KPI strip, health card, pages card,
    // quick-settings tiles and the share / custom-domain dialogs.
    // Health-check MESSAGES are NOT duplicated here — they resolve via
    // `lib/health-check-copy.ts` (checkCopyMessage / checkCopyFixLabel).
    command_center: {
        /* Header bar */
        status_live: { en: "Live", ar: "مباشر", ku: "ڕاستەوخۆ" },
        status_unpublished_changes: { en: "Unpublished changes", ar: "تغييرات غير منشورة", ku: "گۆڕانکاری بڵاونەکراوە" },
        status_draft: { en: "Draft", ar: "مسودة", ku: "ڕەشنووس" },
        visit_store: { en: "Visit store", ar: "زيارة المتجر", ku: "سەردانی فرۆشگا" },
        visit_store_disabled_title: { en: "Publish your store first", ar: "انشر متجرك أولاً", ku: "سەرەتا فرۆشگاکەت بڵاو بکەرەوە" },
        set_up_store: { en: "Set up store", ar: "إعداد المتجر", ku: "ڕێکخستنی فرۆشگا" },
        customize: { en: "Customize", ar: "تخصيص", ku: "تایبەتکردن" },

        /* Live preview card */
        live_preview: { en: "Live preview", ar: "معاينة مباشرة", ku: "پێشبینینی ڕاستەوخۆ" },
        preview_desktop: { en: "Desktop", ar: "سطح المكتب", ku: "کۆمپیوتەر" },
        preview_mobile: { en: "Mobile", ar: "الجوال", ku: "مۆبایل" },
        preview_unpublished_title: { en: "Your store isn't published yet", ar: "لم يتم نشر متجرك بعد", ku: "فرۆشگاکەت هێشتا بڵاو نەکراوەتەوە" },
        preview_unpublished_body_new: { en: "Set up your store to get a branded home page, then publish to see it live here.", ar: "أعدّ متجرك للحصول على صفحة رئيسية بهويتك، ثم انشره لتراه مباشرة هنا.", ku: "فرۆشگاکەت ڕێکبخە بۆ ئەوەی پەڕەیەکی سەرەکی بە برێندی خۆت هەبێت، پاشان بڵاوی بکەرەوە تا لێرە بە زیندوویی بیبینیت." },
        preview_unpublished_body_built: { en: "Build your home page in the editor and hit Publish — your live storefront will appear here.", ar: "ابنِ صفحتك الرئيسية في المحرّر ثم اضغط نشر — سيظهر متجرك المباشر هنا.", ku: "پەڕەی سەرەکی لە دەستکاریکەردا دروست بکە و کلیکی بڵاوکردنەوە بکە — فرۆشگا زیندووەکەت لێرە دەردەکەوێت." },
        preview_set_up_your_store: { en: "Set up your store", ar: "أعدّ متجرك", ku: "فرۆشگاکەت ڕێکبخە" },
        preview_open_editor: { en: "Open editor", ar: "فتح المحرّر", ku: "کردنەوەی دەستکاریکەر" },
        preview_loading: { en: "Loading preview…", ar: "جارٍ تحميل المعاينة…", ku: "پێشبینین بار دەکرێت…" },
        preview_iframe_title: { en: "Store preview", ar: "معاينة المتجر", ku: "پێشبینینی فرۆشگا" },

        /* Handle claim (UX2-13) */
        handle_edit: { en: "Change link", ar: "تغيير الرابط", ku: "گۆڕینی بەستەر" },
        handle_title: { en: "Your store link", ar: "رابط متجرك", ku: "بەستەری فرۆشگاکەت" },
        handle_body: { en: "Pick a short name for your store's link — letters, numbers and dashes.", ar: "اختر اسماً قصيراً لرابط متجرك — أحرف إنجليزية وأرقام وشرطات.", ku: "ناوێکی کورت بۆ بەستەری فرۆشگاکەت هەڵبژێرە — پیت و ژمارە و هێڵ." },
        handle_redirect_note: { en: "Your old link will keep working — it redirects to the new one.", ar: "رابطك القديم سيبقى يعمل — سيحوّل تلقائياً إلى الجديد.", ku: "بەستەرە کۆنەکەت هەر کاردەکات — خۆکارانە دەگوازرێتەوە بۆ نوێکە." },
        handle_available: { en: "Available ✓", ar: "متاح ✓", ku: "بەردەستە ✓" },
        handle_taken: { en: "Taken — try another", ar: "محجوز — جرّب اسماً آخر", ku: "گیراوە — یەکێکی تر تاقی بکەرەوە" },
        handle_invalid: { en: "3–30 chars: english letters, numbers, dashes.", ar: "من 3 إلى 30 حرفاً: أحرف إنجليزية وأرقام وشرطات.", ku: "لە ٣ بۆ ٣٠: پیتی ئینگلیزی و ژمارە و هێڵ." },
        handle_reserved: { en: "That name is reserved — try another.", ar: "هذا الاسم محجوز للمنصة — جرّب اسماً آخر.", ku: "ئەو ناوە بۆ پلاتفۆرمەکە پارێزراوە — یەکێکی تر تاقی بکەرەوە." },
        handle_check_failed: { en: "Couldn't check this name — try again in a moment.", ar: "تعذّر التحقق من هذا الاسم — حاول بعد قليل.", ku: "نەتوانرا ئەم ناوە بپشکنرێت — کەمێکی تر هەوڵ بدەرەوە." },
        handle_save: { en: "Save link", ar: "حفظ الرابط", ku: "پاشەکەوتکردنی بەستەر" },
        handle_saving: { en: "Saving…", ar: "جارٍ الحفظ…", ku: "پاشەکەوت دەکرێت…" },
        handle_error: { en: "Couldn't change the link — try again.", ar: "تعذّر تغيير الرابط — حاول مرة أخرى.", ku: "نەتوانرا بەستەرەکە بگۆڕدرێت — دووبارە هەوڵ بدەرەوە." },

        /* KPI strip */
        kpi_orders: { en: "Orders", ar: "الطلبات", ku: "داواکارییەکان" },
        kpi_revenue: { en: "Revenue", ar: "الإيرادات", ku: "داهات" },
        kpi_aov: { en: "Avg. order value", ar: "متوسط قيمة الطلب", ku: "ناوەندی بەهای داواکاری" },
        kpi_last_7_days: { en: "Last 7 days", ar: "آخر 7 أيام", ku: "٧ ڕۆژی ڕابردوو" },
        kpi_error: { en: "Couldn't load. Refresh to retry.", ar: "تعذّر التحميل. حدّث الصفحة وحاول مجدداً.", ku: "نەتوانرا باربکرێت. نوێ بکەرەوە." },
        kpi_no_orders_yet: { en: "No orders yet", ar: "لا توجد طلبات بعد", ku: "هێشتا داواکاری نییە" },
        funnel_title: { en: "Storefront funnel", ar: "مسار الزبون بالمتجر", ku: "ڕێڕەوی کڕیار" },
        funnel_visitors: { en: "Visitors", ar: "زوّار", ku: "سەردانکەران" },
        funnel_product_viewers: { en: "Viewed a product", ar: "شاهدوا منتجاً", ku: "بەرهەمێکیان بینی" },
        funnel_checkout_starters: { en: "Started an order", ar: "بدؤوا طلباً", ku: "داواکارییان دەستپێکرد" },
        funnel_buyers: { en: "Sent an order", ar: "أرسلوا طلباً", ku: "داواکارییان نارد" },
        funnel_note: {
            en: "Counts everyone who sent an order from the store, even if it was cancelled later. \"Orders\" above counts sold orders from every channel.",
            ar: "يحسب كل من أرسل طلباً من المتجر حتى لو أُلغي لاحقاً. أما «الطلبات» في الأعلى فتحسب الطلبات المبيعة من كل القنوات.",
            ku: "هەموو ئەوانە دەژمێرێت کە داواکارییان لە فرۆشگاکە نارد، تەنانەت ئەگەر دواتر هەڵوەشێنرابێتەوە. «داواکارییەکان» لە سەرەوە داواکارییە فرۆشراوەکان لە هەموو کەناڵەکان دەژمێرێت.",
        },
        funnel_of_previous: { en: "Share of the previous step", ar: "نسبة من الخطوة السابقة", ku: "ڕێژە لە هەنگاوی پێشوو" },
        funnel_conversion: { en: "Visitors who ordered:", ar: "من الزوّار طلبوا:", ku: "لە سەردانکەران داوایان کرد:" },
        funnel_top_products: { en: "Most viewed → bought", ar: "الأكثر مشاهدة، وكم منها اشتُري", ku: "زۆرترین بینراو ← کڕدراو" },
        funnel_empty: { en: "No visits recorded yet. Once the store is live, visitors, product views, checkout starts and orders show here.", ar: "لا توجد زيارات مسجلة بعد. عندما يبدأ المتجر بالعمل سترى هنا الزوار ومشاهدات المنتجات وبدايات الطلب والطلبات.", ku: "هێشتا سەردان تۆمار نەکراوە. کاتێک فرۆشگاکە کارا بوو، لێرە دەردەکەون." },
        funnel_error: { en: "Couldn't load the funnel. Refresh the page to try again.", ar: "تعذّر تحميل أرقام المسار. حدّث الصفحة وحاول مجدداً.", ku: "نەتوانرا ژمارەکانی ڕێڕەوەکە باربکرێن. پەڕەکە نوێ بکەرەوە." },

        /* Health card */
        health_heading: { en: "Store health", ar: "صحة المتجر", ku: "تەندروستی فرۆشگا" },
        health_new_store_heading: { en: "Finish setting up your store", ar: "أكمل إعداد متجرك", ku: "ڕێکخستنی فرۆشگاکەت تەواو بکە" },
        health_new_store_body: { en: "Your store doesn't have any content yet. Open the editor to add sections and build out your home page — your store health score will appear once you've started.", ar: "متجرك لا يحتوي على أي محتوى بعد. افتح المحرّر لإضافة الأقسام وبناء صفحتك الرئيسية — ستظهر درجة صحة متجرك بمجرد أن تبدأ.", ku: "فرۆشگاکەت هێشتا هیچ ناوەڕۆکێکی نییە. دەستکاریکەر بکەرەوە بۆ زیادکردنی بەشەکان و دروستکردنی پەڕەی سەرەکی — خاڵی تەندروستی فرۆشگاکەت دەردەکەوێت هەر کە دەستت پێکرد." },
        health_get_started: { en: "Get started", ar: "ابدأ الآن", ku: "دەست پێبکە" },
        health_all_passing_detail: { en: "All checks passing.", ar: "جميع الفحوصات ناجحة.", ku: "هەموو پشکنینەکان سەرکەوتوون." },
        // tFormat: {n}
        health_items_to_address_one: { en: "{n} item blocks publishing.", ar: "عنصر واحد يمنع النشر.", ku: "{n} بابەت ڕێگری لە بڵاوکردنەوە دەکات." },
        health_items_to_address_other: { en: "{n} items block publishing.", ar: "عناصر تمنع النشر: {n}", ku: "{n} بابەت ڕێگری لە بڵاوکردنەوە دەکەن." },
        // tFormat: {n} — open checks that do not stop publishing.
        health_problems_one: { en: "1 problem shoppers will notice. Fix it first.", ar: "مشكلة واحدة سيلاحظها الزبائن، أصلحها أولاً.", ku: "1 کێشە کە کڕیاران هەستی پێدەکەن. یەکەم چاکی بکە." },
        health_problems_other: { en: "{n} problems shoppers will notice. Fix them first.", ar: "مشاكل سيلاحظها الزبائن: {n}، أصلحها أولاً.", ku: "{n} کێشە کە کڕیاران هەستی پێدەکەن. یەکەم چاکیان بکە." },
        health_suggestions_one: { en: "{n} suggestion to make the store better.", ar: "اقتراح واحد لتحسين المتجر.", ku: "{n} پێشنیار بۆ باشترکردنی فرۆشگا." },
        health_suggestions_other: { en: "{n} suggestions to make the store better.", ar: "اقتراحات لتحسين المتجر: {n}", ku: "{n} پێشنیار بۆ باشترکردنی فرۆشگا." },
        health_fix: { en: "Fix", ar: "إصلاح", ku: "چاککردن" },
        health_all_passing: { en: "All checks passing", ar: "جميع الفحوصات ناجحة", ku: "هەموو پشکنینەکان سەرکەوتوون" },
        health_full_checklist: { en: "Full checklist in editor", ar: "القائمة الكاملة في المحرّر", ku: "لیستی تەواو لە دەستکاریکەردا" },

        /* Pages card */
        pages_heading: { en: "Pages", ar: "الصفحات", ku: "پەڕەکان" },
        // tFormat: {n}
        pages_count: { en: "{n} pages", ar: "{n} صفحة", ku: "{n} پەڕە" },
        pages_empty: { en: "No pages configured. Open the editor to start.", ar: "لا توجد صفحات مُعدّة. افتح المحرّر للبدء.", ku: "هیچ پەڕەیەک ڕێکنەخراوە. دەستکاریکەر بکەرەوە بۆ دەستپێکردن." },
        pages_edit: { en: "Edit", ar: "تعديل", ku: "دەستکاری" },
        /* Quick-settings tiles */
        quick_settings: { en: "Quick settings", ar: "إعدادات سريعة", ku: "ڕێکخستنە خێراکان" },
        tile_brand_label: { en: "Brand & theme", ar: "هوية العلامة", ku: "برێند و ڕووکار" },
        tile_brand_desc: { en: "Logo, colors, fonts, shapes", ar: "الشعار والألوان والخطوط والأشكال", ku: "لۆگۆ، ڕەنگ، فۆنت، شێوە" },
        tile_languages_label: { en: "Languages", ar: "اللغات", ku: "زمانەکان" },
        tile_seo_label: { en: "Google search", ar: "الظهور في جوجل", ku: "دەرکەوتن لە گووگڵ" },
        tile_seo_desc: { en: "Page titles & meta descriptions", ar: "عناوين الصفحات والأوصاف التعريفية", ku: "ناونیشانی پەڕەکان و وەسفی مێتا" },
        tile_domain_label: { en: "Custom domain", ar: "نطاق مخصّص", ku: "دۆمەینی تایبەت" },
        tile_domain_desc: { en: "Connect your own domain", ar: "اربط نطاقك الخاص", ku: "دۆمەینی خۆت ببەستەوە" },
        tile_share_label: { en: "Share", ar: "مشاركة", ku: "هاوبەشکردن" },
        tile_share_desc: { en: "Get a link or QR code for your store", ar: "احصل على رابط أو رمز QR لمتجرك", ku: "بەستەر یان کۆدی QR بۆ فرۆشگاکەت وەربگرە" },

        /* Shared dialog chrome */
        dialog_close: { en: "Close", ar: "إغلاق", ku: "داخستن" },

        /* Share dialog */
        share_heading: { en: "Share your store", ar: "شارك متجرك", ku: "فرۆشگاکەت هاوبەش بکە" },
        share_qr_alt: { en: "Store QR code", ar: "رمز QR للمتجر", ku: "کۆدی QR ی فرۆشگا" },
        share_copied: { en: "Copied!", ar: "تم النسخ!", ku: "کۆپی کرا!" },
        share_copy: { en: "Copy", ar: "نسخ", ku: "کۆپی" },

        /* Custom-domain dialog */
        domain_heading: { en: "Custom domain", ar: "نطاق مخصّص", ku: "دۆمەینی تایبەت" },
        domain_intro: { en: "Connect your own domain to this store.", ar: "اربط نطاقك الخاص بهذا المتجر.", ku: "دۆمەینی خۆت بەم فرۆشگایەوە ببەستەوە." },
        domain_status_active: { en: "Active", ar: "نشط", ku: "چالاک" },
        domain_status_pending: { en: "Pending", ar: "قيد الانتظار", ku: "چاوەڕوان" },
        domain_verify: { en: "Verify", ar: "تحقّق", ku: "پشتڕاستکردنەوە" },
        domain_connect_cta: { en: "Connect Custom Domain", ar: "ربط نطاق مخصّص", ku: "بەستنەوەی دۆمەینی تایبەت" },
        domain_name_label: { en: "Domain Name", ar: "اسم النطاق", ku: "ناوی دۆمەین" },
        domain_dns_heading: { en: "DNS Configuration", ar: "إعدادات DNS", ku: "ڕێکخستنی DNS" },
        domain_dns_type: { en: "Type:", ar: "النوع:", ku: "جۆر:" },
        domain_dns_name: { en: "Name:", ar: "الاسم:", ku: "ناو:" },
        domain_dns_value: { en: "Value:", ar: "القيمة:", ku: "بەها:" },
        domain_connect: { en: "Connect", ar: "ربط", ku: "بەستنەوە" },
        domain_cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوونەوە" },
        domain_toast_added: { en: "Domain added. Configure your DNS to complete setup.", ar: "تمت إضافة النطاق. اضبط إعدادات DNS لإكمال الإعداد.", ku: "دۆمەین زیادکرا. DNS ڕێکبخە بۆ تەواوکردنی ڕێکخستن." },
        domain_toast_add_failed: { en: "Failed to add domain", ar: "تعذّرت إضافة النطاق", ku: "زیادکردنی دۆمەین سەرکەوتوو نەبوو" },
        domain_toast_verified: { en: "Domain verified!", ar: "تم التحقق من النطاق!", ku: "دۆمەین پشتڕاست کرایەوە!" },
        domain_toast_ssl_pending: {
            en: "Domain connected. Its SSL certificate is being issued, this takes a few minutes.",
            ar: "تم ربط النطاق. شهادة SSL قيد الإصدار، وتستغرق بضع دقائق.",
            ku: "دۆمەین بەستراوەتەوە. بڕوانامەی SSL ئامادە دەکرێت، چەند خولەکێک دەخایەنێت.",
        },
        domain_toast_ssl_misconfigured: {
            en: "Domain verified, but its DNS does not point to Scheniders yet.",
            ar: "تم التحقق من النطاق، لكن إعدادات DNS لا تشير إلى Scheniders بعد.",
            ku: "دۆمەین پشتڕاست کرایەوە، بەڵام DNS هێشتا ئاماژە بە Scheniders ناکات.",
        },
        domain_toast_verify_failed: { en: "Verification failed", ar: "فشل التحقق", ku: "پشتڕاستکردنەوە سەرکەوتوو نەبوو" },
        domain_toast_not_pointing: { en: "Not verified yet. Make sure the CNAME (or A) record is saved; DNS can take up to 48 hours.", ar: "لم يتم التحقق بعد. تأكد من حفظ سجل CNAME (أو A)؛ قد يستغرق DNS حتى 48 ساعة.", ku: "هێشتا پشتڕاست نەکراوەتەوە. دڵنیابە تۆماری CNAME (یان A) پاشەکەوت کراوە؛ DNS دەکرێت تا ٤٨ کاتژمێر بخایەنێت." },
        domain_steps_heading: { en: "How to connect, step by step", ar: "خطوات الربط", ku: "هەنگاوەکانی بەستنەوە" },
        domain_step_open: {
            en: "Open the DNS settings of your domain at the company you bought it from (Namecheap, GoDaddy, Cloudflare...).",
            ar: "افتح إعدادات DNS لنطاقك في الشركة التي اشتريته منها (Namecheap أو GoDaddy أو Cloudflare...).",
            ku: "ڕێکخستنەکانی DNS ی دۆمەینەکەت بکەرەوە لای ئەو کۆمپانیایەی لێی کڕیوە (Namecheap، GoDaddy، Cloudflare...).",
        },
        domain_step_cname: {
            en: "Add a CNAME record with the name and value below.",
            ar: "أضف سجل CNAME بالاسم والقيمة الظاهرين في الأسفل.",
            ku: "تۆمارێکی CNAME بەو ناو و بەهایەی خوارەوە زیاد بکە.",
        },
        domain_step_a: {
            en: "This is a main domain, so add an A record (not CNAME) with name @ and the value below. Delete any old A record on @ first.",
            ar: "هذا نطاق رئيسي، لذلك أضف سجل A (وليس CNAME) بالاسم @ والقيمة الظاهرة في الأسفل. احذف أولاً أي سجل A قديم على @.",
            ku: "ئەمە دۆمەینی سەرەکییە، بۆیە تۆماری A (نەک CNAME) بە ناوی @ و بەهای خوارەوە زیاد بکە. سەرەتا هەر تۆمارێکی A ی کۆن لەسەر @ بسڕەوە.",
        },
        domain_step_txt: {
            en: "Add the TXT record below too. It proves the domain is yours.",
            ar: "أضف سجل TXT الظاهر في الأسفل أيضاً، فهو يثبت أن النطاق ملكك.",
            ku: "تۆماری TXT ی خوارەوەش زیاد بکە. دەیسەلمێنێت دۆمەینەکە هی تۆیە.",
        },
        domain_step_verify: {
            en: "Save, come back and press Verify. DNS takes minutes to 48 hours; the SSL certificate is issued automatically.",
            ar: "احفظ، ثم ارجع هنا واضغط «تحقّق». يأخذ DNS من دقائق إلى 48 ساعة، وتُصدر شهادة الأمان SSL تلقائياً.",
            ku: "پاشەکەوت بکە، بگەڕێوە و پشتڕاستکردنەوە دابگرە. DNS لە چەند خولەکێکەوە تا ٤٨ کاتژمێر دەخایەنێت؛ بڕوانامەی SSL خۆکارانە دەردەچێت.",
        },
        domain_dns_records_heading: {
            en: "Add both records at your domain provider, then press Verify. The TXT record proves the domain is yours.",
            ar: "أضف السجلين عند مزوّد النطاق، ثم اضغط تحقّق. سجل TXT يثبت أن النطاق ملكك.",
            ku: "هەردوو تۆمارەکە لای دابینکەری دۆمەینەکەت زیاد بکە، پاشان پشتڕاستکردنەوە دابگرە. تۆماری TXT دەیسەلمێنێت دۆمەینەکە هی تۆیە.",
        },
        domain_toast_txt_missing: {
            en: "Not verified yet. Add the TXT record shown under the domain; DNS can take up to 48 hours.",
            ar: "لم يتم التحقق بعد. أضف سجل TXT الظاهر تحت النطاق؛ قد يستغرق DNS حتى 48 ساعة.",
            ku: "هێشتا پشتڕاست نەکراوەتەوە. تۆماری TXT ی ژێر دۆمەینەکە زیاد بکە؛ DNS دەکرێت تا ٤٨ کاتژمێر بخایەنێت.",
        },
        domain_invalid: { en: "Enter a valid domain like shop.example.com", ar: "أدخل نطاقاً صحيحاً مثل shop.example.com", ku: "دۆمەینێکی دروست بنووسە وەک shop.example.com" },
        domain_taken: { en: "This domain is already added to your store.", ar: "هذا النطاق مضاف إلى متجرك مسبقاً.", ku: "ئەم دۆمەینە پێشتر زیادکراوە بۆ فرۆشگاکەت." },
        domain_limit: { en: "You have 5 domains waiting to be verified. Remove one first.", ar: "لديك 5 نطاقات بانتظار التحقق. احذف واحداً أولاً.", ku: "5 دۆمەینت هەیە چاوەڕێی پشتڕاستکردنەوەن. سەرەتا یەکێکیان بسڕەوە." },
        domain_list_error: { en: "Couldn't load your domains. Close and try again.", ar: "تعذّر تحميل نطاقاتك. أغلق النافذة وحاول مجدداً.", ku: "نەتوانرا دۆمەینەکانت باربکرێن. دایبخە و دووبارە هەوڵبدەرەوە." },
        share_copy_failed: { en: "Couldn't copy. Select the link and copy it by hand.", ar: "تعذّر النسخ. حدّد الرابط وانسخه يدوياً.", ku: "کۆپی نەکرا. بەستەرەکە دیاری بکە و بە دەست کۆپی بکە." },
    },

    /* ── Advanced-screens chrome (agent B region — UX2-15) ───────── */
    advanced_chrome: {
        // Shared across the advanced screens
        adv_back: { en: "Back", ar: "رجوع", ku: "گەڕانەوە" },
        adv_untitled: { en: "Untitled", ar: "بدون عنوان", ku: "بێ ناونیشان" },
        adv_untitled_paren: { en: "(Untitled)", ar: "(بدون عنوان)", ku: "(بێ ناونیشان)" },
        adv_understand_continue: { en: "I understand, continue", ar: "أفهم ذلك، متابعة", ku: "تێدەگەم، بەردەوامبە" },
        // tFormat: {name}
        adv_delete_name_title: { en: "Delete “{name}”?", ar: "حذف “{name}”؟", ku: "“{name}” بسڕدرێتەوە؟" },
        adv_percent_off: { en: "% off", ar: "خصم %", ku: "% داشکاندن" },
        adv_iqd_off: { en: "IQD off", ar: "خصم د.ع", ku: "داشکاندنی IQD" },
        adv_value: { en: "Value", ar: "القيمة", ku: "بەها" },
        adv_active: { en: "Active", ar: "نشط", ku: "چالاک" },
        disc_active: { en: "Active", ar: "مفعّل", ku: "چالاک" },
        adv_field_name: { en: "Name", ar: "الاسم", ku: "ناو" },
        adv_close: { en: "Close", ar: "إغلاق", ku: "داخستن" },
        adv_cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوونەوە" },
        adv_refresh: { en: "Refresh", ar: "تحديث", ku: "نوێکردنەوە" },
        adv_upcoming: { en: "Upcoming", ar: "قادم", ku: "داهاتوو" },
        adv_expired: { en: "Expired", ar: "منتهٍ", ku: "بەسەرچووە" },

        // Experiments screen
        exp_empty_title: { en: "No tests yet", ar: "لا توجد اختبارات بعد", ku: "هێشتا هیچ تاقیکردنەوەیەک نییە" },
        exp_empty_body: { en: "Compare two versions of any section: pick a goal, split your visitors between them, then keep the better one.", ar: "قارن بين نسختين من أي قسم: اختر ما تريد قياسه، قسّم الزوار بينهما، ثم اعتمد النسخة الأفضل.", ku: "دوو وەشانی هەر بەشێک بەراورد بکە: ئامانجێک هەڵبژێرە، سەردانکەران دابەش بکە، پاشان باشترەکە بهێڵەوە." },
        exp_empty_new: { en: "Create your first test", ar: "أنشئ أول اختبار", ku: "یەکەم تاقیکردنەوەت دروست بکە" },
        exp_primary_metric_label: { en: "Goal:", ar: "الهدف:", ku: "پێوەری سەرەکی:" },
        exp_traffic_split: { en: "Traffic split:", ar: "تقسيم الزوار:", ku: "دابەشکردنی سەردانیکەران:" },
        exp_stop_promote: { en: "End test", ar: "إنهاء الاختبار", ku: "کۆتاییهێنان بە تاقیکردنەوە" },
        // tFormat: {control}
        exp_stop_confirm: {
            en: "Every visitor will see «{control}» again. To keep the better version, open «View» and adopt it first.",
            ar: "سيرى كل الزوار «{control}» من جديد. لاعتماد النسخة الأفضل افتح «عرض» واعتمدها أولاً.",
            ku: "هەموو سەردانکەران دووبارە «{control}» دەبینن. بۆ هێشتنەوەی وەشانی باشتر، «بینین» بکەرەوە و سەرەتا پەسەندی بکە.",
        },
        exp_stop_yes: { en: "End test", ar: "نعم، أنهِ الاختبار", ku: "بەڵێ، کۆتایی پێبهێنە" },
        exp_stop_cancel: { en: "Cancel", ar: "إلغاء", ku: "هەڵوەشاندنەوە" },
        exp_editor_title: { en: "Edit test", ar: "تعديل الاختبار", ku: "دەستکاری تاقیکردنەوە" },
        exp_editor_title_new: { en: "New test", ar: "اختبار جديد", ku: "تاقیکردنەوەی نوێ" },
        // Default name of the second version of a new test.
        exp_default_variant: { en: "Version A", ar: "النسخة أ", ku: "وەشانی A" },
        exp_field_primary_metric: { en: "Goal", ar: "الهدف", ku: "پێوەری سەرەکی" },
        exp_field_starts_at: { en: "Starts at", ar: "يبدأ في", ku: "دەستپێدەکات لە" },
        exp_field_ends_at: { en: "Ends at (optional)", ar: "ينتهي في (اختياري)", ku: "کۆتایی دێت لە (ئارەزوومەندانە)" },
        exp_arms: { en: "Versions", ar: "النسخ", ku: "لقەکان" },
        exp_add_arm: { en: "Add version", ar: "إضافة نسخة", ku: "زیادکردنی لق" },
        exp_delete_arm_aria: { en: "Delete version", ar: "حذف النسخة", ku: "سڕینەوەی لق" },
        exp_total_traffic: { en: "Total traffic:", ar: "إجمالي الزوار:", ku: "کۆی سەردانیکەران:" },
        exp_traffic_sum_error: { en: "(must add up to 100)", ar: "(يجب أن يساوي المجموع 100)", ku: "— کۆکەرەوەکە دەبێت 100 بێت" },
        exp_field_status: { en: "Status", ar: "الحالة", ku: "دۆخ" },
        exp_stats_error: { en: "Failed to load stats", ar: "فشل تحميل الإحصائيات", ku: "بارکردنی ئامارەکان سەرکەوتوو نەبوو" },
        exp_no_data: { en: "No data yet.", ar: "لا توجد بيانات بعد.", ku: "هێشتا هیچ داتایەک نییە." },
        exp_stats_error_body: {
            en: "Could not load the numbers. Your test keeps running; nothing changed.",
            ar: "تعذّر تحميل الأرقام. الاختبار ما زال يعمل ولم يتغير شيء.",
            ku: "ژمارەکان بار نەکران. تاقیکردنەوەکە هێشتا کار دەکات؛ هیچ نەگۆڕا.",
        },
        exp_retry: { en: "Try again", ar: "حاول مرة أخرى", ku: "دووبارە هەوڵ بدەوە" },
        // tFormat: {orders} {visitors}
        exp_card_arm: { en: "{orders} orders · {visitors} visitors", ar: "الطلبات {orders} · الزوار {visitors}", ku: "داواکاری {orders} · سەردانکەر {visitors}" },
        exp_control_badge: { en: "Original", ar: "الأصل", ku: "کۆنترۆڵ" },
        // tFormat: {n}
        exp_pct_traffic: { en: "{n}% traffic", ar: "{n}% من الزوار", ku: "{n}% سەردانیکەران" },
        exp_stat_atc: { en: "ATC", ar: "إضافة للسلة", ku: "بۆ سەبەتە" },
        exp_stat_checkout: { en: "Started order", ar: "بدأ الطلب", ku: "داواکاری دەستپێکرد" },
        exp_stat_aov: { en: "AOV (IQD)", ar: "متوسط الطلب (د.ع)", ku: "تێکڕای داواکاری (IQD)" },
        exp_stat_uplift_control: { en: "Conversion vs original", ar: "تحسن التحويل مقابل الأصل", ku: "گۆڕانی گۆڕین بەراورد بە بنەڕەت" },
        // tFormat: {n} — under a "still learning" version in the test drawer
        exp_needs_visitors: {
            en: "About {n} more visitors per version before a winner can be called.",
            ar: "يلزم نحو {n} زائر إضافي لكل نسخة قبل تحديد الفائز.",
            ku: "نزیکەی {n} سەردانکەری زیاتر بۆ هەر وەشانێک پێویستە پێش دیاریکردنی براوە.",
        },
        exp_gap_too_small: {
            en: "Enough visitors, but the gap between this version and the original is still too small to be sure. Keep it running.",
            ar: "عدد الزوار كافٍ، لكن الفرق بين هذه النسخة والأصل ما زال صغيراً لنتأكد منه. اترك الاختبار يعمل.",
            ku: "سەردانکەر بەسە، بەڵام جیاوازییەکە هێشتا بچووکە بۆ دڵنیابوون. با بەردەوام بێت.",
        },
        // Above the per-version numbers in the test drawer.
        exp_counts_note: {
            en: "Counts every order placed since the test started, cancelled ones included, so it can differ from last-7-days figures.",
            ar: "تُحسب كل الطلبات منذ بدء الاختبار، ومنها الملغاة، لذا قد تختلف عن أرقام آخر 7 أيام.",
            ku: "هەموو داواکارییەکان لە دەستپێکی تاقیکردنەوەوە دەژمێردرێن، هەڵوەشاوەکانیش، بۆیە لەوانەیە جیاواز بن لە ژمارەکانی 7 ڕۆژی ڕابردوو.",
        },
        exp_card_stats_error: {
            en: "Numbers did not load. Open View to try again.",
            ar: "تعذّر تحميل الأرقام. افتح «عرض» للمحاولة مرة أخرى.",
            ku: "ژمارەکان بار نەکران. «بینین» بکەرەوە بۆ دووبارە هەوڵدان.",
        },
        exp_delete_refs_prefix: { en: "This test is used by", ar: "هذا الاختبار مستخدم في", ku: "ئەم تاقیکردنەوەیە ئاماژەی پێدراوە لەلایەن" },
        exp_delete_refs_suffix_one: { en: "variant. Deleting it will leave those variants targeting a non-existent test. Proceed?", ar: "نسخة واحدة. حذفها سيترك تلك النسخ تستهدف اختباراً غير موجود. متابعة؟", ku: "وەشانێک. سڕینەوەی وا دەکات ئەو وەشانانە تاقیکردنەوەیەکی نەبوو ئامانج بکەن. بەردەوامبیت؟" },
        exp_delete_refs_suffix_many: { en: "variants. Deleting it will leave those variants targeting a non-existent test. Proceed?", ar: "نسخ. حذفها سيترك تلك النسخ تستهدف اختباراً غير موجود. متابعة؟", ku: "وەشان. سڕینەوەی وا دەکات ئەو وەشانانە تاقیکردنەوەیەکی نەبوو ئامانج بکەن. بەردەوامبیت؟" },
        exp_delete_body: { en: "This removes the test from your store.", ar: "سيُحذف هذا الاختبار من متجرك.", ku: "ئەمە تاقیکردنەوەکە لە ڕێکخستنی فرۆشگاکەت لادەبات." },
        exp_untitled: { en: "(Untitled)", ar: "(بلا اسم)", ku: "(بێ ناو)" },
        exp_default_name: { en: "New test", ar: "اختبار جديد", ku: "تاقیکردنەوەی نوێ" },
        exp_field_name: { en: "Name", ar: "الاسم", ku: "ناو" },
        // tFormat: {name}
        exp_delete_title: { en: "Delete «{name}»?", ar: "حذف «{name}»؟", ku: "«{name}» بسڕدرێتەوە؟" },
        exp_not_started: { en: "Not started", ar: "لم يبدأ", ku: "دەستی پێنەکردووە" },
        exp_starts_soon: { en: "Starts soon", ar: "يبدأ قريباً", ku: "بەم زووانە دەست پێدەکات" },
        exp_started_now: { en: "Started just now", ar: "بدأ للتو", ku: "ئێستا دەستی پێکرد" },
        // tFormat: {when} = a relative time such as "3 days ago"
        exp_started_when: { en: "Started {when}", ar: "بدأ {when}", ku: "دەستی پێکرد {when}" },
        exp_delete_confirm: { en: "Delete test", ar: "حذف الاختبار", ku: "سڕینەوەی تاقیکردنەوە" },

        // Empty states for the remaining advanced screens
        red_empty: { en: "No redirects yet — add your first", ar: "لا توجد قواعد إعادة توجيه بعد. أضف أول قاعدة.", ku: "هێشتا هیچ ڕەوانەکردنەوەیەک نییە — یەکەمیان زیاد بکە" },
        bun_empty: { en: "No bundles yet. Add your first", ar: "لا توجد حزم بعد. أضف أول حزمة", ku: "هێشتا هیچ کۆمەڵەیەک نییە. یەکەمیان زیاد بکە" },
        bun_heading: { en: "Bundles", ar: "الحزم", ku: "کۆمەڵەکان" },
        bun_close_aria: { en: "Close bundles", ar: "إغلاق الحزم", ku: "داخستنی کۆمەڵەکان" },
        bun_add: { en: "Add bundle", ar: "إضافة حزمة", ku: "زیادکردنی کۆمەڵە" },
        bun_intro: {
            en: "Group 2 or more products into a \"frequently bought together\" bundle with a discount on their combined price. It shows on the page of every product in the bundle.",
            ar: "اجمع منتجين أو أكثر في حزمة «يُشترى معاً عادةً» بخصم على سعرها المجمّع. تظهر الحزمة في صفحة كل منتج داخلها.",
            ku: "دوو بەرهەم یان زیاتر کۆبکەرەوە لە کۆمەڵەیەکی «زۆرجار پێکەوە دەکڕدرێن» بە داشکاندن لەسەر کۆی نرخەکەیان. لە پەڕەی هەر بەرهەمێکی ناو کۆمەڵەکە دەردەکەوێت.",
        },
        bun_kind_percent: { en: "% off", ar: "خصم %", ku: "داشکاندنی %" },
        bun_kind_fixed: { en: "IQD off", ar: "خصم د.ع", ku: "داشکاندن بە دینار" },
        bun_value: { en: "Value", ar: "القيمة", ku: "بڕ" },
        bun_active: { en: "Active", ar: "مفعّلة", ku: "چالاک" },
        // tFormat: {n}
        bun_count: { en: "Products: {n}", ar: "المنتجات: {n}", ku: "بەرهەمەکان: {n}" },
        bun_needs_products: { en: "Pick at least 2 products", ar: "اختر منتجين على الأقل", ku: "لانیکەم 2 بەرهەم هەڵبژێرە" },
        bun_remove_aria: { en: "Remove bundle", ar: "إزالة الحزمة", ku: "لابردنی کۆمەڵە" },
        row_removed_hint: { en: "You have 5 seconds to bring it back.", ar: "يمكنك استعادته خلال 5 ثوانٍ.", ku: "٥ چرکەت هەیە بۆ گەڕاندنەوەی." },
        disc_removed: { en: "Discount code removed", ar: "حُذف كود الخصم", ku: "کۆدی داشکاندن لابرا" },
        disc_restore: { en: "Restore code", ar: "استعادة الكود", ku: "گەڕاندنەوەی کۆد" },
        nav_removed: { en: "Menu link removed", ar: "حُذف الرابط", ku: "بەستەرەکە لابرا" },
        nav_restore: { en: "Restore link", ar: "استعادة الرابط", ku: "گەڕاندنەوەی بەستەر" },
        redir_removed: { en: "Redirect removed", ar: "حُذفت القاعدة", ku: "ئاراستەکردنەکە لابرا" },
        redir_restore: { en: "Restore redirect", ar: "استعادة القاعدة", ku: "گەڕاندنەوەی ئاراستەکردن" },
        bun_removed: { en: "Bundle removed", ar: "حُذفت الحزمة", ku: "کۆمەڵەکە لابرا" },
        bun_removed_hint: { en: "You have 5 seconds to bring it back.", ar: "يمكنك استعادتها خلال 5 ثوانٍ.", ku: "٥ چرکەت هەیە بۆ گەڕاندنەوەی." },
        bun_restore: { en: "Restore bundle", ar: "استعادة الحزمة", ku: "گەڕاندنەوەی کۆمەڵە" },
        // tFormat: {n}
        bun_off_hint: { en: "Products: {n} · Off, customers don't see it", ar: "المنتجات: {n} · متوقفة، لا يراها الزبون", ku: "بەرهەمەکان: {n} · وەستاوە، کڕیار نایبینێت" },
        bun_no_products: { en: "No products to add.", ar: "لا توجد منتجات لإضافتها.", ku: "هیچ بەرهەمێک نییە بۆ زیادکردن." },
        bun_products_error: { en: "Couldn't load your products. Refresh the page to try again.", ar: "تعذّر تحميل منتجاتك. حدّث الصفحة وحاول مجدداً.", ku: "نەتوانرا بەرهەمەکانت باربکرێن. پەڕەکە نوێ بکەرەوە." },
        bun_products_loading: { en: "Loading products…", ar: "جارٍ تحميل المنتجات…", ku: "بەرهەمەکان باردەکرێن…" },
        bun_name: { en: "Bundle name", ar: "اسم الحزمة", ku: "ناوی کۆمەڵە" },
        bun_name_hint: { en: "(customers see it)", ar: "(يظهر للزبون)", ku: "(کڕیار دەیبینێت)" },
        bun_name_placeholder: { en: "e.g. Summer duo", ar: "مثال: ثنائي الصيف", ku: "نموونە: دوانەی هاوین" },
        bun_search: { en: "Search products", ar: "ابحث عن منتج", ku: "گەڕان بۆ بەرهەم" },
        bun_no_match: { en: "No product matches this search.", ar: "لا يوجد منتج بهذا الاسم.", ku: "هیچ بەرهەمێک لەگەڵ ئەم گەڕانە ناگونجێت." },
        // tFormat: {name}
        bun_unpick_aria: { en: "Remove {name} from the bundle", ar: "إزالة {name} من الحزمة", ku: "{name} لە کۆمەڵەکە لابە" },
        // tFormat: {n}
        bun_price: { en: "{n} IQD", ar: "{n} د.ع", ku: "{n} د.ع" },
        ver_empty_title: { en: "No versions yet", ar: "لا توجد نسخ بعد", ku: "هێشتا هیچ وەشانێک نییە" },
        ver_empty_body: { en: "Snapshots are created automatically on publish, or you can save a named snapshot right now.", ar: "تُنشأ النسخ تلقائياً عند النشر، أو يمكنك حفظ نسخة باسم الآن.", ku: "وێنەگرتنەکان بە خۆکاری لە کاتی بڵاوکردنەوەدا دروست دەبن، یان دەتوانیت ئێستا وێنەیەکی ناودار هەڵبگریت." },
        sched_empty_title: { en: "No scheduled changes", ar: "لا توجد تغييرات مجدولة", ku: "هیچ گۆڕانکاریەکی کاتبەندیکراو نییە" },
        sched_empty_body: { en: "Use this screen to schedule future variants of any section — promo banners, hero swaps, free-shipping notices, and more.", ar: "استخدم هذه الشاشة لجدولة نسخ مستقبلية من أي قسم — لافتات العروض، تبديل الأغلفة، إشعارات التوصيل المجاني وغيرها.", ku: "ئەم پەردەیە بەکاربهێنە بۆ کاتبەندیکردنی وەشانی داهاتووی هەر بەشێک — بەنەڕی ئۆفەر، گۆڕینی بەرگ، ئاگاداری گەیاندنی بێبەرامبەر و زیاتر." },

        // Segments (audiences) screen
        seg_rule_first_visit: { en: "First visit", ar: "أول زيارة", ku: "یەکەم سەردان" },
        seg_rule_returning: { en: "Returning visitor", ar: "زائر عائد", ku: "سەردانیکەری گەڕاوە" },
        seg_rule_ordered: { en: "Has ordered before", ar: "طلب من قبل", ku: "پێشتر داواکاری کردووە" },
        seg_rule_cart_total: { en: "Cart total", ar: "إجمالي السلة", ku: "کۆی سەبەتە" },
        seg_rule_abandoned: { en: "Abandoned cart", ar: "سلة متروكة", ku: "سەبەتەی بەجێهێڵراو" },
        seg_rule_governorate: { en: "Governorate", ar: "المحافظة", ku: "پارێزگا" },
        seg_rule_traffic: { en: "Traffic source", ar: "مصدر الزيارات", ku: "سەرچاوەی سەردان" },
        seg_rule_device: { en: "Device", ar: "الجهاز", ku: "ئامێر" },
        // tFormat: {n}
        seg_rule_count_one: { en: "{n} rule", ar: "شرط واحد", ku: "{n} ڕێسا" },
        seg_rule_count_many: { en: "{n} rules", ar: "الشروط: {n}", ku: "{n} ڕێسا" },
        seg_rule_count_none: { en: "No rules: reaches no one", ar: "بلا شروط: لا يصل لأحد", ku: "بێ ڕێسا: ناگاتە کەس" },
        seg_select_to_edit: { en: "Select an audience to edit it.", ar: "اختر جمهوراً لتعديله.", ku: "بینەرێک هەڵبژێرە بۆ دەستکاریکردنی." },
        seg_edit_segment: { en: "Edit audience", ar: "تعديل الجمهور", ku: "دەستکاری بینەر" },
        seg_delete_segment: { en: "Delete audience", ar: "حذف الجمهور", ku: "سڕینەوەی بینەر" },
        seg_field_description: { en: "Description", ar: "الوصف", ku: "وەسف" },
        seg_field_name: { en: "Name", ar: "الاسم", ku: "ناو" },
        seg_default_name: { en: "New audience", ar: "جمهور جديد", ku: "بینەری نوێ" },
        seg_untitled: { en: "(Untitled)", ar: "(بلا اسم)", ku: "(بێ ناو)" },
        // tFormat: {name}
        seg_delete_title: { en: "Delete «{name}»?", ar: "حذف «{name}»؟", ku: "«{name}» بسڕدرێتەوە؟" },
        seg_field_combine: { en: "Who matches", ar: "من يدخل في الجمهور", ku: "لۆژیکی تێکەڵکردن" },
        seg_match_all: { en: "Meets every rule", ar: "يحقق كل الشروط", ku: "هەموو ڕێساکان بگونجێنە" },
        seg_match_any: { en: "Meets any rule", ar: "يحقق أي شرط", ku: "هەر ڕێسایەک بگونجێنە" },
        seg_rules_heading: { en: "Rules", ar: "الشروط", ku: "ڕێساکان" },
        seg_add_rule: { en: "Add rule", ar: "إضافة شرط", ku: "زیادکردنی ڕێسا" },
        seg_rules_empty: { en: "No rules yet, so this audience reaches no one. Add a rule to choose who it is for.", ar: "لا توجد شروط بعد، لذلك لا يصل هذا الجمهور لأحد. أضف شرطاً لتحدد لمن هو.", ku: "هێشتا هیچ ڕێسایەک نییە، بۆیە ئەم بینەرە ناگاتە کەس. ڕێسایەک زیاد بکە بۆ دیاریکردنی بۆ کێیە." },
        seg_delete_rule_aria: { en: "Delete rule", ar: "حذف الشرط", ku: "سڕینەوەی ڕێسا" },
        seg_within: { en: "Within", ar: "خلال", ku: "لە ماوەی" },
        seg_minutes_optional: { en: "minutes (optional)", ar: "دقيقة (اختياري)", ku: "خولەک (ئارەزوومەندانە)" },
        seg_no_config: { en: "No configuration.", ar: "لا إعدادات.", ku: "هیچ ڕێکخستنێک نییە." },
        seg_iqd: { en: "IQD", ar: "د.ع", ku: "دینار" },
        seg_inactive_for: { en: "Inactive for at least", ar: "غير نشط لمدة لا تقل عن", ku: "ناچالاک بۆ لانیکەم" },
        seg_minutes: { en: "minutes", ar: "دقيقة", ku: "خولەک" },
        seg_delete_refs_prefix: { en: "This audience is used by", ar: "هذا الجمهور مستخدم من قبل", ku: "ئەم بینەرە بەکارهاتووە لەلایەن" },
        seg_delete_refs_suffix_one: { en: "variant. Deleting it will leave those variants matching nothing. Proceed?", ar: "نسخة واحدة. حذفه سيترك تلك النسخ دون أي تطابق. متابعة؟", ku: "وەشانێک. سڕینەوەی وا دەکات ئەو وەشانانە هیچ نەگونجێنن. بەردەوامبیت؟" },
        seg_delete_refs_suffix_many: { en: "variants. Deleting it will leave those variants matching nothing. Proceed?", ar: "نسخ. حذفه سيترك تلك النسخ دون أي تطابق. متابعة؟", ku: "وەشان. سڕینەوەی وا دەکات ئەو وەشانانە هیچ نەگونجێنن. بەردەوامبیت؟" },
        seg_delete_body: { en: "This removes the audience from your store. Any version aimed at it will stop showing.", ar: "سيُحذف هذا الجمهور من متجرك، وأي نسخة موجهة له ستتوقف عن الظهور.", ku: "ئەمە بینەرەکە لە ڕێکخستنی فرۆشگاکەت لادەبات. هەر وەشانێک ئامانجی بکات چیتر ناگونجێت." },

        // Scheduled-changes screen
        sched_subtitle: { en: "Versions of your sections that show only during a set time.", ar: "نسخ من أقسام متجرك تظهر فقط في وقت محدد.", ku: "وەشانەکانی بەشەکانی فرۆشگاکەت کە تەنها لە کاتێکی دیاریکراودا دەردەکەون." },
        // tFormat: {when}
        sched_row_started: { en: "Started {when}", ar: "بدأ {when}", ku: "دەستیپێکرد {when}" },
        sched_row_ends: { en: "ends {when}", ar: "ينتهي {when}", ku: "کۆتایی دێت {when}" },
        sched_row_no_end: { en: "no end date", ar: "بدون تاريخ انتهاء", ku: "بەبێ بەرواری کۆتایی" },
        sched_row_starts: { en: "Starts {when}", ar: "يبدأ {when}", ku: "دەستپێدەکات {when}" },
        sched_row_ended: { en: "Ended {when}", ar: "انتهى {when}", ku: "کۆتایی هات {when}" },
        sched_history_end: { en: "Ended scheduled change early", ar: "إنهاء تغيير مجدول مبكراً", ku: "کۆتاییهێنانی گۆڕانکاری خشتەکراو زووتر" },
        sched_history_cancel: { en: "Cancelled scheduled change", ar: "إلغاء تغيير مجدول", ku: "هەڵوەشاندنەوەی گۆڕانکاری خشتەکراو" },
        sched_history_start: { en: "Changed scheduled start", ar: "تغيير موعد بدء التغيير المجدول", ku: "گۆڕینی کاتی دەستپێکی خشتەکراو" },
        sched_row_cancelled: { en: "Cancelled", ar: "ملغي", ku: "هەڵوەشێنراوەتەوە" },
        sched_target_label: { en: "Target:", ar: "الهدف:", ku: "ئامانج:" },
        sched_target_section_fallback: { en: "Section", ar: "قسم", ku: "بەش" },
        sched_target_unknown: { en: "Unknown", ar: "غير معروف", ku: "نەزانراو" },
        sched_no_targets: { en: "No targets.", ar: "لا توجد أهداف.", ku: "هیچ ئامانجێک نییە." },
        sched_section_label: { en: "Section:", ar: "القسم:", ku: "بەش:" },
        sched_variant_label: { en: "Variant:", ar: "النسخة:", ku: "وەشان:" },
        sched_variant_missing: { en: "(missing)", ar: "(مفقود)", ku: "(بزربووە)" },
        sched_variant_override: { en: "Variant override", ar: "تعديلات النسخة", ku: "گۆڕانکارییەکانی وەشان" },
        sched_creator_subtitle: { en: "Show a section variant for a fixed time window.", ar: "اعرض نسخة قسم لفترة زمنية محددة.", ku: "وەشانێکی بەش بۆ ماوەیەکی کاتی دیاریکراو پیشان بدە." },
        sched_field_label: { en: "Label", ar: "الاسم", ku: "ناونیشان" },
        sched_label_placeholder: { en: "e.g. «Black Friday banner»", ar: "مثال: «لافتة الجمعة السوداء»", ku: "نموونە: «بانەری هەینی ڕەش»" },
        sched_field_start: { en: "Start date / time", ar: "تاريخ / وقت البداية", ku: "بەروار / کاتی دەستپێک" },
        sched_field_end: { en: "End date / time (optional)", ar: "تاريخ / وقت الانتهاء (اختياري)", ku: "بەروار / کاتی کۆتایی (ئارەزوومەندانە)" },
        sched_field_timezone: { en: "Timezone", ar: "المنطقة الزمنية", ku: "ناوچەی کات" },
        sched_tz_baghdad: { en: "Baghdad", ar: "بغداد", ku: "بەغدا" },
        sched_tz_utc: { en: "UTC (world time)", ar: "التوقيت العالمي UTC", ku: "کاتی جیهانی UTC" },
        sched_tz_dubai: { en: "Dubai", ar: "دبي", ku: "دوبەی" },
        sched_tz_istanbul: { en: "Istanbul", ar: "إسطنبول", ku: "ئەستەنبوڵ" },
        sched_field_page: { en: "Page", ar: "الصفحة", ku: "پەڕە" },
        sched_field_section: { en: "Section", ar: "القسم", ku: "بەشی پەڕە" },
        sched_field_variant: { en: "Variant", ar: "النسخة", ku: "وەشان" },
        sched_choose_page: { en: "Choose a page…", ar: "اختر صفحة…", ku: "پەڕەیەک هەڵبژێرە…" },
        sched_choose_section: { en: "Choose a section…", ar: "اختر قسماً…", ku: "بەشێک هەڵبژێرە…" },
        sched_pick_page_first: { en: "Pick a page first", ar: "اختر صفحة أولاً", ku: "سەرەتا پەڕەیەک هەڵبژێرە" },
        sched_choose_variant: { en: "Choose a variant…", ar: "اختر نسخة…", ku: "وەشانێک هەڵبژێرە…" },
        sched_pick_section_first: { en: "Pick a section first", ar: "اختر قسماً أولاً", ku: "سەرەتا بەشێک هەڵبژێرە" },
        sched_create_variant_option: { en: "+ Create new variant for this schedule", ar: "+ إنشاء نسخة جديدة لهذه الجدولة", ku: "+ وەشانی نوێ بۆ ئەم خشتەیە دروست بکە" },
        sched_field_new_variant_label: { en: "New variant label", ar: "اسم النسخة الجديدة", ku: "ناونیشانی وەشانی نوێ" },
        sched_new_variant_placeholder: { en: "e.g. «Black Friday»", ar: "مثال: «الجمعة السوداء»", ku: "نموونە: «هەینی ڕەش»" },
        sched_new_variant_hint: { en: "A new version of this section will be made. It shows only between the start and end times above.", ar: "ستُنشأ نسخة جديدة من هذا القسم، تظهر فقط بين وقتَي البداية والنهاية أعلاه.", ku: "وەشانێکی نوێی ئەم بەشە دروست دەکرێت، تەنها لە نێوان کاتی دەستپێک و کۆتایی سەرەوە دەردەکەوێت." },
        sched_err_label_required: { en: "Label is required", ar: "الاسم مطلوب", ku: "ناونیشان پێویستە" },
        sched_err_start_required: { en: "Valid start date is required", ar: "تاريخ بداية صالح مطلوب", ku: "بەرواری دەستپێکی دروست پێویستە" },
        sched_err_end_invalid: { en: "End date is invalid", ar: "تاريخ الانتهاء غير صالح", ku: "بەرواری کۆتایی نادروستە" },
        sched_err_end_before_start: { en: "End must be after start", ar: "يجب أن يكون الانتهاء بعد البداية", ku: "کۆتایی دەبێت دوای دەستپێک بێت" },
        sched_err_pick_page: { en: "Pick a page", ar: "اختر صفحة", ku: "پەڕەیەک هەڵبژێرە" },
        sched_err_pick_section: { en: "Pick a section", ar: "اختر قسماً", ku: "بەشێک هەڵبژێرە" },
        sched_err_pick_variant: { en: "Pick or create a variant", ar: "اختر نسخة أو أنشئها", ku: "وەشانێک هەڵبژێرە یان دروستی بکە" },
        sched_create_submit: { en: "Create schedule", ar: "إنشاء الجدولة", ku: "دروستکردنی خشتە" },
        sched_error_load: { en: "Failed to load schedules", ar: "فشل تحميل الجدولات", ku: "بارکردنی خشتەکان سەرکەوتوو نەبوو" },
        sched_error_end: { en: "Failed to end schedule", ar: "فشل إنهاء الجدولة", ku: "کۆتاییهێنانی خشتە سەرکەوتوو نەبوو" },
        sched_error_cancel: { en: "Failed to cancel schedule", ar: "فشل إلغاء الجدولة", ku: "هەڵوەشاندنەوەی خشتە سەرکەوتوو نەبوو" },
        sched_error_delete: { en: "Failed to delete schedule", ar: "فشل حذف الجدولة", ku: "سڕینەوەی خشتە سەرکەوتوو نەبوو" },
        sched_error_update: { en: "Failed to update", ar: "فشل التحديث", ku: "نوێکردنەوە سەرکەوتوو نەبوو" },
        sched_error_create: { en: "Failed to create schedule", ar: "فشل إنشاء الجدولة", ku: "دروستکردنی خشتە سەرکەوتوو نەبوو" },

        // Version-history screen (extends STRINGS.version_history)
        vh_error_load: { en: "Failed to load versions", ar: "فشل تحميل النسخ", ku: "بارکردنی وەشانەکان سەرکەوتوو نەبوو" },
        vh_error_snapshot: { en: "Snapshot failed", ar: "فشل حفظ اللقطة", ku: "هەڵگرتنی وێنە سەرکەوتوو نەبوو" },
        vh_error_restore: { en: "Restore failed", ar: "فشل الاسترجاع", ku: "گەڕاندنەوە سەرکەوتوو نەبوو" },
        vh_error_no_config: { en: "Version has no config payload", ar: "لا تحتوي النسخة على بيانات إعدادات", ku: "ئەم وەشانە داتای ڕێکخستنی نییە" },
        // tFormat: {label}
        vh_restored_label: { en: "Restored \"{label}\"", ar: "استُرجعت \"{label}\"", ku: "\"{label}\" گەڕێنرایەوە" },
        vh_you: { en: "You", ar: "أنت", ku: "تۆ" },
        // tFormat: {name}
        // tFormat: {n} — diff chips on a version row
        vh_chip_added: { en: "{n} added", ar: "أُضيف {n}", ku: "{n} زیادکرا" },
        vh_chip_changed: { en: "{n} changed", ar: "عُدّل {n}", ku: "{n} گۆڕدرا" },
        vh_chip_removed: { en: "{n} removed", ar: "حُذف {n}", ku: "{n} سڕایەوە" },
        vh_by_author: { en: "by {name}", ar: "بواسطة {name}", ku: "لەلایەن {name}" },
        vh_restore_body_prefix: { en: "Restore", ar: "استرجاع", ku: "گەڕاندنەوەی" },
        // tFormat: {time}
        vh_restore_body_suffix: { en: "from {time}? This replaces your current draft. You can undo this in this session.", ar: "من {time}؟ سيستبدل هذا مسودتك الحالية. يمكنك التراجع خلال هذه الجلسة.", ku: "لە {time}؟ ئەمە ڕەشنووسی ئێستات دەگۆڕێت. دەتوانی لەم دانیشتنەدا پاشگەزبیتەوە." },
        vh_promote_body: { en: "Give this auto-save a memorable label so it doesn't get pruned.", ar: "أعطِ هذا الحفظ التلقائي اسماً لا يُنسى حتى لا يُحذف.", ku: "ناوێکی بیرهێنەرەوە بدە بەم خەزنە ئۆتۆماتیکە بۆ ئەوەی نەسڕدرێتەوە." },
        vh_diff_before: { en: "Now:", ar: "الآن:", ku: "ئێستا:" },
        vh_diff_after: { en: "After restoring:", ar: "بعد الاسترجاع:", ku: "دوای گەڕاندنەوە:" },

        // Nav-builder screen
        nav_close_aria: { en: "Close navigation", ar: "إغلاق التنقّل", ku: "داخستنی ناڤیگەیشن" },
        nav_heading: { en: "Navigation", ar: "التنقّل", ku: "ناڤیگەیشن" },
        nav_add_link: { en: "Add link", ar: "إضافة رابط", ku: "زیادکردنی بەستەر" },
        nav_intro_prefix: { en: "Header menu links. Point each at a path like", ar: "روابط قائمة الترويسة. وجّه كل رابط إلى مسار مثل", ku: "بەستەرەکانی مێنیوی سەرەوە. هەریەکەیان ئاراستەی ڕێچکەیەک بکە وەکو" },
        nav_intro_suffix: { en: ", or a full URL.", ar: "، أو رابط كامل.", ku: "، یان بەستەری تەواو." },
        nav_empty: { en: "No nav links yet — add your first", ar: "لا توجد روابط تنقل بعد — أضف أول رابط", ku: "هێشتا هیچ بەستەرێک نییە — یەکەمیان زیاد بکە" },
        nav_label_en_aria: { en: "Label (English)", ar: "التسمية (بالإنجليزية)", ku: "ناونیشان (ئینگلیزی)" },
        nav_label_en_placeholder: { en: "Label (EN)", ar: "التسمية (EN)", ku: "ناونیشان (EN)" },
        nav_label_ar_aria: { en: "Label (Arabic)", ar: "التسمية (بالعربية)", ku: "ناونیشان (عەرەبی)" },
        nav_href_aria: { en: "Link target", ar: "وجهة الرابط", ku: "ئامانجی بەستەر" },
        nav_move_up: { en: "Move up", ar: "تحريك لأعلى", ku: "بردنە سەرەوە" },
        nav_move_down: { en: "Move down", ar: "تحريك لأسفل", ku: "بردنە خوارەوە" },
        nav_remove_link: { en: "Remove link", ar: "إزالة الرابط", ku: "لابردنی بەستەر" },

        // Discounts screen
        disc_close_aria: { en: "Close discount codes", ar: "إغلاق أكواد الخصم", ku: "داخستنی کۆدەکانی داشکاندن" },
        disc_heading: { en: "Discount codes", ar: "أكواد الخصم", ku: "کۆدەکانی داشکاندن" },
        disc_add_code: { en: "Add code", ar: "إضافة كود", ku: "زیادکردنی کۆد" },
        disc_intro: { en: "Coupon codes customers type at checkout: a percent off or a fixed amount (IQD).", ar: "أكواد خصم يكتبها الزبون عند الطلب: نسبة من السلة أو مبلغ ثابت (د.ع).", ku: "کۆدی داشکاندن کە کڕیار لە کاتی داواکردن دەینووسێت: ڕێژەیەک یان بڕێکی جێگیر (IQD)." },
        disc_empty: { en: "No codes yet — add your first", ar: "لا توجد أكواد بعد — أضف أول كود", ku: "هێشتا هیچ کۆدێک نییە — یەکەمیان زیاد بکە" },
        disc_min_subtotal: { en: "Min order (IQD)", ar: "أقل طلب (د.ع)", ku: "کەمترین کۆ" },
        disc_max_off: { en: "Max off (IQD)", ar: "أقصى خصم (د.ع)", ku: "زۆرترین داشکاندن" },
        disc_code_label: { en: "Code", ar: "الكود", ku: "کۆد" },
        disc_kind_label: { en: "Type", ar: "النوع", ku: "جۆر" },
        disc_remove_aria: { en: "Remove code", ar: "إزالة الكود", ku: "لابردنی کۆد" },

        /* Shipping rates — the delivery fee a customer is quoted at checkout. */
        ship_heading: { en: "Delivery fees", ar: "أجور التوصيل", ku: "کرێی گەیاندن" },
        ship_close_aria: { en: "Close delivery fees", ar: "إغلاق أجور التوصيل", ku: "داخستنی کرێی گەیاندن" },
        ship_intro: { en: "What a customer is charged for delivery at checkout. The same figure is shown in the cart, quoted on the order, and recorded with it.", ar: "المبلغ الذي يُحتسب على الزبون للتوصيل عند إتمام الطلب. نفس الرقم يظهر في السلة ويُثبت مع الطلب.", ku: "ئەو بڕەی لە کڕیار وەردەگیرێت بۆ گەیاندن لە کاتی پارەدان. هەمان ژمارە لە سەبەتەدا دەردەکەوێت و لەگەڵ داواکاریەکەدا تۆمار دەکرێت." },
        ship_mode_free: { en: "Free delivery", ar: "توصيل مجاني", ku: "گەیاندنی بەخۆڕایی" },
        ship_mode_free_hint: { en: "Nobody is charged for delivery, anywhere.", ar: "لا أحد يدفع أجور توصيل، في أي محافظة.", ku: "کەس کرێی گەیاندن نادات، لە هیچ پارێزگایەک." },
        ship_mode_flat: { en: "One fee everywhere", ar: "أجرة واحدة لكل المحافظات", ku: "یەک کرێ بۆ هەموو شوێنێک" },
        ship_mode_flat_hint: { en: "The same fee for every governorate.", ar: "نفس الأجرة لكل محافظة.", ku: "هەمان کرێ بۆ هەموو پارێزگایەک." },
        ship_mode_by_gov: { en: "A fee per governorate", ar: "أجرة لكل محافظة", ku: "کرێیەک بۆ هەر پارێزگایەک" },
        ship_mode_by_gov_hint: { en: "A default fee, and your own figure wherever it differs.", ar: "أجرة افتراضية، ورقمك الخاص حيث تختلف.", ku: "کرێیەکی بنەڕەتی، و ژمارەی خۆت لە هەر شوێنێک کە جیاواز بێت." },
        ship_fee_label: { en: "Fee (IQD)", ar: "الأجرة (د.ع)", ku: "کرێ (IQD)" },
        ship_free_over_label: { en: "Free above", ar: "مجاني فوق", ku: "بەخۆڕایی لەسەروو" },
        ship_free_over_hint: { en: "Leave blank to charge the fee on every order.", ar: "اتركه فارغاً لاحتساب الأجرة على كل طلب.", ku: "بەتاڵی بهێڵەوە بۆ وەرگرتنی کرێ لە هەموو داواکارییەک." },
        ship_default_fee: { en: "Default fee", ar: "الأجرة الافتراضية", ku: "کرێی بنەڕەتی" },
        ship_override_col: { en: "Governorate", ar: "المحافظة", ku: "پارێزگا" },
        ship_override_placeholder: { en: "default", ar: "الافتراضي", ku: "بنەڕەت" },
        ship_unset_warning: { en: "Delivery fees are not set. Until they are, the platform charges a flat 5,000 IQD and waives it above 75,000 — figures you did not choose. Pick an option below.", ar: "أجور التوصيل غير محددة. حتى تحددها، تحتسب المنصة 5,000 د.ع ثابتة وتعفيها فوق 75,000 — أرقام لم تخترها. اختر خياراً أدناه.", ku: "کرێی گەیاندن دیاری نەکراوە. تاکو دیاری دەکەیت، پلاتفۆرمەکە 5,000 IQD وەردەگرێت و لەسەروو 75,000 چاوپۆشی دەکات — ژمارەی تۆ هەڵنەبژاردوون. خوارەوە هەڵبژێرە." },
        ship_door_heading: { en: "Promise at the door", ar: "وعد عند الباب", ku: "بەڵێن لەبەردەم دەرگا" },
        ship_door_label: { en: "Customers may open and check the parcel before paying", ar: "يستطيع الزبون فتح الطلب وفحصه قبل الدفع", ku: "کڕیار دەتوانێت پاکەتەکە بکاتەوە و بیپشکنێت پێش پارەدان" },
        ship_door_help: {
            en: "Shown on the product page and delivery promise as «افتح الطلب وتأكد قبل ما تدفع». Only turn this on if your courier honours it.",
            ar: "تظهر في صفحة المنتج ووعد التوصيل بعبارة «افتح الطلب وتأكد قبل ما تدفع». شغّلها فقط إذا كانت شركة التوصيل تلتزم بها.",
            ku: "لە پەڕەی بەرهەم و بەڵێنی گەیاندن وەک «افتح الطلب وتأكد قبل ما تدفع» دەردەکەوێت. تەنها هەڵیبکە ئەگەر کۆمپانیای گەیاندنەکەت پابەندی بێت.",
        },
        ship_door_off_note: {
            en: "Off: we add nothing. Lines you wrote yourself in your sections and pages still show as written.",
            ar: "متوقف: لا نضيف شيئاً. النصوص التي كتبتها بنفسك في الأقسام والصفحات تبقى كما كتبتها.",
            ku: "کوژاوە: هیچ زیاد ناکەین. ئەو دەقانەی خۆت لە بەشەکان و پەڕەکاندا نووسیوتن وەک خۆیان دەمێننەوە.",
        },
        ship_door_on: { en: "Promised open-before-paying", ar: "تفعيل الفحص قبل الدفع", ku: "چالاککردنی پشکنین پێش پارەدان" },
        ship_door_off: { en: "Removed open-before-paying", ar: "إلغاء الفحص قبل الدفع", ku: "لابردنی پشکنین پێش پارەدان" },
        ship_preview_heading: { en: "What a customer pays", ar: "ما يدفعه الزبون", ku: "ئەوەی کڕیار دەیدات" },
        ship_preview_free: { en: "Free", ar: "مجاني", ku: "بەخۆڕایی" },
        ship_preview_free_everywhere: { en: "Delivery is free to every governorate, whatever the basket.", ar: "التوصيل مجاني لكل المحافظات مهما كانت قيمة السلة.", ku: "گەیاندن بۆ هەموو پارێزگاکان بەخۆڕاییە، بەهەر بڕێکی سەبەتە." },
        ship_preview_basket: { en: "For a basket of {n} IQD", ar: "على سلة بـ {n} د.ع", ku: "لەسەر سەبەتەی {n} IQD" },

        // Redirects screen
        redir_close_aria: { en: "Close redirects", ar: "إغلاق إعادة التوجيه", ku: "داخستنی ئاراستەکردنەکان" },
        redir_heading: { en: "Redirects", ar: "إعادة التوجيه", ku: "ئاراستەکردنەکان" },
        redir_add: { en: "Add redirect", ar: "إضافة قاعدة", ku: "زیادکردنی ئاراستەکردن" },
        redir_intro: {
            en: "Send an old link to a new one, so links you shared on WhatsApp, in ads or found on Google keep working after you change a product or category link.",
            ar: "حوّل رابطاً قديماً إلى رابط جديد، حتى تبقى الروابط التي شاركتها على واتساب أو في الإعلانات أو التي يعرضها جوجل تعمل بعد تغيير رابط منتج أو فئة.",
            ku: "بەستەرێکی کۆن بنێرە بۆ نوێیەک، بۆ ئەوەی ئەو بەستەرانەی لە واتسئاپ و ڕیکلامەکان بڵاوتکردوونەتەوە یان گووگڵ پیشانیان دەدات دوای گۆڕینی بەستەری بەرهەم یان پۆل کار بکەن.",
        },
        redir_empty: { en: "No redirects yet. Add your first", ar: "لا توجد قواعد إعادة توجيه بعد. أضف أول قاعدة", ku: "هێشتا هیچ ئاراستەکردنێک نییە. یەکەمیان زیاد بکە" },
        redir_issue_missing: { en: "Both source and destination are required.", ar: "الرابط القديم والجديد مطلوبان.", ku: "هەردوو بەستەری کۆن و نوێ پێویستن." },
        redir_issue_self: { en: "Source and destination are the same.", ar: "الرابط القديم والجديد متطابقان.", ku: "بەستەری کۆن و نوێ وەک یەکن." },
        // tFormat: {n} = the earlier rule's 1-based number.
        redir_issue_duplicate: { en: "Same source as rule {n}.", ar: "نفس الرابط القديم في القاعدة رقم {n}.", ku: "هەمان بەستەری کۆن لە ئاراستەکردنی ژمارە {n}." },
        redir_issue_chain: { en: "Destination is itself redirected, so visitors take two hops.", ar: "الرابط الجديد يُعاد توجيهه هو أيضاً، فيمرّ الزائر بخطوتين.", ku: "بەستەری نوێ خۆی ئاراستە کراوە، بۆیە سەردانکەر دوو جار دەگوازرێتەوە." },
        redir_permanent: { en: "Permanent (Google updates its link)", ar: "دائم (يحدّث جوجل الرابط)", ku: "هەمیشەیی (گووگڵ بەستەرەکە نوێ دەکاتەوە)" },
        redir_col_from: { en: "Old link", ar: "الرابط القديم", ku: "بەستەری کۆن" },
        redir_col_to: { en: "New link", ar: "الرابط الجديد", ku: "بەستەری نوێ" },
        redir_permanent_hint: {
            en: "Leave «Permanent» ticked when the old link is gone for good. Untick it for a short move, like a sale page you will bring back.",
            ar: "اترك «دائم» مفعّلاً إذا انتهى الرابط القديم نهائياً. ألغِه لنقل مؤقت، مثل صفحة تخفيضات ستعيدها لاحقاً.",
            ku: "«هەمیشەیی» هەڵبژێردراو بهێڵەوە ئەگەر بەستەری کۆن بۆ هەمیشە نەماوە. بۆ گواستنەوەی کاتی لای ببە، وەک پەڕەی داشکاندن کە دەیگەڕێنیتەوە.",
        },
        redir_remove_aria: { en: "Remove redirect", ar: "إزالة القاعدة", ku: "لابردنی ئاراستەکردن" },

        // Bundles screen
        bundle_close_aria: { en: "Close bundles", ar: "إغلاق الباقات", ku: "داخستنی پاکێجەکان" },
        bundle_heading: { en: "Bundles", ar: "الباقات", ku: "پاکێجەکان" },
        bundle_add: { en: "Add bundle", ar: "إضافة باقة", ku: "زیادکردنی پاکێج" },
        bundle_intro: { en: "Group 2+ products into a \"frequently bought together\" bundle with a discount on their combined price. It shows on the PDP of any product in the bundle.", ar: "اجمع منتجين أو أكثر في باقة «يُشترى معاً عادةً» مع خصم على سعرها الإجمالي. تظهر في صفحة أي منتج ضمن الباقة.", ku: "دوو بەرهەم یان زیاتر کۆبکەرەوە لە پاکێجی «زۆرجار پێکەوە دەکڕدرێن» لەگەڵ داشکاندن لەسەر نرخە کۆکراوەکەیان. لە پەڕەی هەر بەرهەمێکی ناو پاکێجەکە دەردەکەوێت." },
        bundle_empty: { en: "No bundles yet — add your first", ar: "لا توجد باقات بعد — أضف أول باقة", ku: "هێشتا هیچ پاکێجێک نییە — یەکەمیان زیاد بکە" },
        // tFormat: {n}
        bundle_product_count: { en: "{n} product(s)", ar: "{n} منتج", ku: "{n} بەرهەم" },
        bundle_remove_aria: { en: "Remove bundle", ar: "إزالة الباقة", ku: "لابردنی پاکێج" },
        bundle_no_products: { en: "No products to add.", ar: "لا توجد منتجات للإضافة.", ku: "هیچ بەرهەمێک نییە بۆ زیادکردن." },

        // Loyalty screen
        loyal_close_aria: { en: "Close loyalty", ar: "إغلاق نقاط الولاء", ku: "داخستنی خاڵی وەفاداری" },
        loyal_heading: { en: "Loyalty points", ar: "نقاط الولاء", ku: "خاڵەکانی وەفاداری" },
        loyal_intro: { en: "Reward repeat customers: they earn points when an order is delivered and redeem them for a discount at checkout. If a delivered order is later returned or cancelled, the points it earned are taken back. Off by default — turn it on to start the program.", ar: "كافئ الزبائن الدائمين: يكسبون نقاطاً عند استلام الطلب ويستبدلونها بخصم في الطلب التالي. إذا أُرجع الطلب أو أُلغي بعد التوصيل تُسحب نقاطه. البرنامج متوقف افتراضياً، شغّله لتبدأ.", ku: "کڕیارە دووبارەکان خەڵات بکە: کاتێک داواکارییەک دەگەیەنرێت خاڵ بەدەستدەهێنن و لە کاتی پارەدان بە داشکاندن دەیگۆڕنەوە. ئەگەر داواکارییەکە بگەڕێنرێتەوە یان هەڵبوەشێنرێتەوە خاڵەکان دەگەڕێنەوە. بە بنەڕەت کوژاوەتەوە." },
        loyal_enable: { en: "Enable loyalty points", ar: "تفعيل نقاط الولاء", ku: "چالاککردنی خاڵی وەفاداری" },
        loyal_earn_label: { en: "Points earned per IQD", ar: "النقاط المكتسبة لكل 1 د.ع", ku: "خاڵی بەدەستهاتوو بۆ هەر IQD" },
        loyal_earn_hint: { en: "e.g. 0.001 = 1 point per 1,000 IQD spent", ar: "مثال: 0.001 = نقطة واحدة لكل 1,000 د.ع", ku: "نموونە: 0.001 = خاڵێک بۆ هەر 1,000 IQD" },
        loyal_redeem_label: { en: "IQD value per point", ar: "قيمة النقطة (د.ع)", ku: "بەهای IQD بۆ هەر خاڵێک" },
        loyal_redeem_hint: { en: "e.g. 10 = each point is worth 10 IQD off", ar: "مثال: 10 = كل نقطة تساوي خصم 10 د.ع", ku: "نموونە: 10 = هەر خاڵێک 10 IQD داشکاندنە" },
        loyal_min_label: { en: "Minimum points to redeem", ar: "الحد الأدنى من النقاط للاستبدال", ku: "کەمترین خاڵ بۆ گۆڕینەوە" },
        loyal_min_hint: { en: "Customers can't redeem below this balance", ar: "لا يستطيع الزبون الاستبدال تحت هذا الرصيد", ku: "کڕیاران ناتوانن لە خوار ئەم باڵانسە بیگۆڕنەوە" },
        loyal_max_label: { en: "Max % of order from points", ar: "أقصى نسبة من الطلب بالنقاط", ku: "زۆرترین % ی داواکاری بە خاڵ" },
        loyal_max_hint: { en: "Cap redemption to this share of the subtotal (0–100)", ar: "حدّد الاستبدال بهذه الحصة من الإجمالي الفرعي (0–100)", ku: "گۆڕینەوە بەم بەشەی کۆ سنووردار بکە (0–100)" },

        // Cart-recovery screen
        cr_close_aria: { en: "Close cart recovery", ar: "إغلاق استرداد السلة", ku: "داخستنی گەڕاندنەوەی سەبەتە" },
        cr_heading: { en: "Cart recovery", ar: "استرداد السلة", ku: "گەڕاندنەوەی سەبەتە" },
        cr_intro: { en: "Send a WhatsApp nudge to customers who reached checkout but didn't complete their order. Off by default — turn it on to start recovering carts.", ar: "أرسل تذكيراً عبر واتساب للزبائن الذين وصلوا إلى صفحة الطلب ولم يكملوه. متوقف افتراضياً، شغّله لتبدأ باسترجاع السلات.", ku: "ئاگادارکردنەوەی واتساپ بنێرە بۆ ئەو کڕیارانەی گەیشتنە پارەدان بەڵام داواکارییەکەیان تەواو نەکرد. بە بنەڕەت کوژاوەتەوە — هەڵیبکە بۆ دەستپێکردنی گەڕاندنەوەی سەبەتەکان." },
        cr_enable: { en: "Enable cart recovery", ar: "تفعيل استرداد السلة", ku: "چالاککردنی گەڕاندنەوەی سەبەتە" },
        cr_delay_label: { en: "Wait before messaging", ar: "الانتظار قبل المراسلة", ku: "چاوەڕوانی پێش ناردنی نامە" },
        cr_delay_hint: { en: "(minutes, 5–1440)", ar: "(دقيقة، 5–1440)", ku: "(خولەک، 5–1440)" },

        // Preview modal
        pv_device_mobile: { en: "Mobile", ar: "الهاتف", ku: "مۆبایل" },
        pv_device_tablet: { en: "Tablet", ar: "جهاز لوحي", ku: "تابلێت" },
        pv_device_desktop: { en: "Desktop", ar: "سطح المكتب", ku: "دێسکتۆپ" },
        pv_dialog_aria: { en: "Accurate device preview", ar: "معاينة دقيقة للجهاز", ku: "پێشبینینی وردی ئامێر" },
        pv_title: { en: "Accurate preview", ar: "معاينة دقيقة", ku: "پێشبینینی ورد" },
        pv_subtitle: { en: "— real device viewport", ar: "— أبعاد جهاز حقيقية", ku: "— ڕوانگەی ئامێری ڕاستەقینە" },
        pv_open_tab_title: { en: "Open this preview in a new tab", ar: "افتح هذه المعاينة في تبويب جديد", ku: "ئەم پێشبینینە لە تابێکی نوێدا بکەرەوە" },
        pv_new_tab: { en: "New tab", ar: "تبويب جديد", ku: "تابی نوێ" },
        pv_close_aria: { en: "Close preview", ar: "إغلاق المعاينة", ku: "داخستنی پێشبینین" },
    },

    /* ── i18n screen ──────────────────────────────────────────── */

    /* ── Page templates ───────────────────────────────────────── */
    page_template: {
        title: { en: "Start from a template", ar: "ابدأ من قالب", ku: "لە قاڵبێکەوە دەستپێبکە" },
        subtitle: { en: "Pick a starter pack, then edit each of its sections as you like.", ar: "اختر باقة بداية، ثم عدّل كل قسم فيها كما تريد.", ku: "پاکێجێکی دەستپێک هەڵبژێرە، پاشان هەر بەشێکی دەستکاری بکە." },
        close: { en: "Close template picker", ar: "إغلاق منتقي القوالب", ku: "داخستنی هەڵبژێرەری قاڵب" },
        // tFormat: {name}
        apply_title: { en: "Apply “{name}”?", ar: "تطبيق «{name}»؟", ku: "“{name}” جێبەجێبکرێت؟" },
        // tFormat: {n}
        warning_replace_one: { en: "The template replaces the section already on this page. You can undo right after.", ar: "سيحلّ القالب محل القسم الموجود في هذه الصفحة. يمكنك التراجع بعد التطبيق.", ku: "ئەمە بەشێکی ئەم پەڕەیە دەگۆڕێت. ئەو بەشە بنەڕەتییە لاندەبرێت." },
        warning_replace_many: { en: "The template replaces the {n} sections already on this page. You can undo right after.", ar: "سيحلّ القالب محل أقسام هذه الصفحة الحالية (عددها: {n}). يمكنك التراجع بعد التطبيق.", ku: "ئەمە {n} بەشی ئەم پەڕەیە دەگۆڕێت. ئەو بەشە بنەڕەتییەکان لاندەبرێن." },
        includes_count_one: { en: "Includes 1 section", ar: "يحتوي على قسم واحد", ku: "بەشێک لەخۆدەگرێت" },
        includes_count_many: { en: "Includes {n} sections", ar: "عدد الأقسام: {n}", ku: "{n} بەش لەخۆدەگرێت" },
        cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوەوە" },
        apply: { en: "Apply template", ar: "تطبيق القالب", ku: "جێبەجێکردنی قاڵب" },
        toast_applied: { en: "Template applied", ar: "طُبّق القالب", ku: "قاڵبەکە جێبەجێکرا" },
        toast_restore: { en: "Restore previous sections", ar: "استعادة الأقسام السابقة", ku: "گەڕاندنەوەی بەشەکانی پێشوو" },
        toast_applied_hint: { en: "You have 5 seconds to bring back the previous sections.", ar: "يمكنك استعادة الأقسام السابقة خلال 5 ثوانٍ.", ku: "٥ چرکەت هەیە بۆ گەڕاندنەوەی بەشەکانی پێشوو." },
        start_blank: { en: "Or start blank ↓", ar: "أو ابدأ من الصفر ↓", ku: "یان بەتاڵ دەستپێبکە ↓" },
    },

    /* ── Save preset dialog ───────────────────────────────────── */
    save_preset: {
        title: { en: "Save section as preset", ar: "حفظ القسم كقالب جاهز", ku: "هەڵگرتنی بەش وەکو قاڵبی ئامادە" },
        description: { en: "Give this preset a memorable name — you can reuse it on any page from the Add panel.", ar: "أعطِ هذا القالب اسماً لا يُنسى — يمكنك إعادة استخدامه في أي صفحة من لوحة الإضافة.", ku: "ناوێکی بیرهێنەرەوە بدە بەم قاڵبە — دەتوانی لە هەر پەڕەیەکدا لە پانێڵی زیادکردن دووبارە بەکاریبهێنیتەوە." },
        name_label: { en: "Preset name", ar: "اسم القالب", ku: "ناوی قاڵب" },
        placeholder: { en: "e.g. Ramadan trust strip", ar: "مثال: شريط الثقة لرمضان", ku: "نموونە: شریتی متمانە بۆ ڕەمەزان" },
        cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوەوە" },
        save: { en: "Save preset", ar: "حفظ القالب", ku: "هەڵگرتنی قاڵب" },
    },

    /* ── Preview-as controls ──────────────────────────────────── */
    preview_as: {
        button: { en: "Preview as a visitor", ar: "معاينة كزائر", ku: "پێشبینین وەک سەردانکەر" },
        heading: { en: "Simulate visitor", ar: "محاكاة زائر", ku: "لاسایی سەردانکەر" },
        reset: { en: "Reset", ar: "إعادة", ku: "ڕێکخستنەوە" },
        governorate: { en: "Governorate", ar: "المحافظة", ku: "پارێزگا" },
        any: { en: "— Any —", ar: "— أي —", ku: "— هەرکام —" },
        segments: { en: "Audiences", ar: "الجمهور", ku: "بەشەکانی بینەران" },
        no_segments: { en: "No audiences yet.", ar: "لا يوجد جمهور بعد.", ku: "هیچ بەشێک پێناسە نەکراوە." },
        ab_experiments: { en: "Tests", ar: "الاختبارات", ku: "تاقیکردنەوەکانی A/B" },
        no_experiments: { en: "No tests yet.", ar: "لا توجد اختبارات بعد.", ku: "هیچ تاقیکردنەوەیەک پێناسە نەکراوە." },
        auto: { en: "— Auto —", ar: "— تلقائي —", ku: "— ئۆتۆماتیک —" },
    },

    /* ── Common ──────────────────────────────────────────────── */
    /** Language names, written in the UI's own language. */
    languages: {
        ar: { en: "Arabic", ar: "العربية", ku: "عەرەبی" },
        en: { en: "English", ar: "الإنجليزية", ku: "ئینگلیزی" },
        ku: { en: "Kurdish", ar: "الكردية", ku: "کوردی" },
    },
    i18n_screen: {
        title: { en: "Languages", ar: "اللغات", ku: "زمانەکان" },
        back: { en: "Back to preview", ar: "رجوع للمعاينة", ku: "گەڕانەوە بۆ پێشبینین" },
        // tFormat: {lang}
        showing: { en: "Text not yet written in {lang}. Pick a language above.", ar: "نصوص لم تُترجم بعد إلى {lang}. اختر لغة من الأعلى.", ku: "دەقەکانی هێشتا بە {lang} نەنووسراون. زمانێک لە سەرەوە هەڵبژێرە." },
        globals: { en: "Top bar, header and footer", ar: "الشريط العلوي والرأس والتذييل", ku: "شریتی سەرەوە، سەرپەڕە و پێپەڕە" },
        translate: { en: "Translate", ar: "ترجم", ku: "وەرگێڕان" },
        page_meta: { en: "Page title and description in Google", ar: "عنوان الصفحة ووصفها في جوجل", ku: "ناونیشان و وەسفی پەڕە لە گووگڵ" },
        section_fallback: { en: "Section", ar: "قسم", ku: "بەش" },
        // tFormat: {n}
        more: { en: "+ {n} more", ar: "+ {n} أخرى", ku: "+ {n}ی تر" },
        // tFormat: {pct}
        pill_word: { en: "Translated", ar: "مترجم", ku: "وەرگێڕدراو" },
        pill_title: { en: "See what still needs translating", ar: "اعرض ما يحتاج ترجمة", ku: "ئەوەی هێشتا وەرگێڕانی دەوێت ببینە" },
    },
    loyalty: {
        heading: { en: "Loyalty points", ar: "نقاط الولاء", ku: "خاڵەکانی دڵسۆزی" },
        close: { en: "Close loyalty", ar: "إغلاق نقاط الولاء", ku: "داخستنی خاڵەکانی دڵسۆزی" },
        intro: {
            en: "Reward repeat customers: they earn points when an order is delivered and redeem them for a discount at checkout. If a delivered order is later returned or cancelled, the points it earned are taken back. Off by default. Turn it on to start the program.",
            ar: "كافئ الزبائن الدائمين: يكسبون نقاطاً عند توصيل الطلب ويستبدلونها بخصم عند إتمام الطلب. إذا أُرجع الطلب أو أُلغي بعد التوصيل تُسحب نقاطه. البرنامج متوقف افتراضياً، شغّله لتبدأ.",
            ku: "پاداشتی کڕیارە بەردەوامەکان بدەوە: کاتێک داواکاری دەگات خاڵ وەردەگرن و لە کاتی تەواوکردنی داواکاریدا دەیگۆڕنەوە بە داشکاندن. ئەگەر داواکاری گەڕێنرایەوە یان هەڵوەشێنرایەوە، خاڵەکانی دەسەندرێنەوە. بە شێوەی بنەڕەت کوژاوەیە، هەڵیبکە بۆ دەستپێکردن.",
        },
        enable: { en: "Enable loyalty points", ar: "تشغيل نقاط الولاء", ku: "چالاککردنی خاڵەکانی دڵسۆزی" },
        earn_label: { en: "Points earned per IQD", ar: "النقاط المكتسبة لكل 1 د.ع", ku: "خاڵ بۆ هەر دینارێک" },
        earn_hint: { en: "e.g. 0.001 = 1 point per 1,000 IQD spent", ar: "مثال: 0.001 = نقطة واحدة لكل 1,000 د.ع", ku: "نموونە: 0.001 = یەک خاڵ بۆ هەر 1,000 دینار" },
        redeem_label: { en: "IQD value per point", ar: "قيمة النقطة (د.ع)", ku: "نرخی هەر خاڵێک بە دینار" },
        redeem_hint: { en: "e.g. 10 = each point is worth 10 IQD off", ar: "مثال: 10 = كل نقطة تخصم 10 د.ع", ku: "نموونە: 10 = هەر خاڵێک 10 دینار کەم دەکاتەوە" },
        min_label: { en: "Minimum points to redeem", ar: "أقل عدد نقاط للاستبدال", ku: "کەمترین خاڵ بۆ گۆڕینەوە" },
        min_hint: { en: "Customers can't redeem below this balance", ar: "لا يستطيع الزبون الاستبدال تحت هذا الرصيد", ku: "کڕیار ناتوانێت لە خوار ئەم بڕەوە بیگۆڕێتەوە" },
        max_label: { en: "Max % of order from points", ar: "أعلى نسبة من الطلب تُدفع بالنقاط", ku: "زۆرترین ڕێژەی داواکاری بە خاڵ" },
        max_hint: { en: "Cap redemption to this share of the subtotal (0–100)", ar: "حد الاستبدال كنسبة من مجموع الطلب (0–100)", ku: "سنووری گۆڕینەوە وەک ڕێژەیەک لە کۆی داواکاری (0–100)" },
        // tFormat: {points} {value} {pct}. Live from the two settings above.
        summary: {
            en: "A customer who spends 100,000 IQD earns {points} points, worth {value} IQD off a later order ({pct}% back).",
            ar: "زبون يصرف 100,000 د.ع يكسب {points} نقطة، تساوي خصم {value} د.ع على طلب لاحق (يرجع له {pct}%).",
            ku: "کڕیارێک 100,000 دینار خەرج بکات {points} خاڵ وەردەگرێت، کە دەکاتە {value} دینار داشکاندن لە داواکارییەکی دواتر ({pct}% دەگەڕێتەوە).",
        },
        referral_heading: { en: "Referrals", ar: "دعوة الأصدقاء", ku: "بانگهێشتی هاوڕێ" },
        referral_intro: {
            en: "Every buyer gets a code on the thank-you page and a WhatsApp share link. A friend using it on their first order gets the discount; the referrer gets points when that order is delivered.",
            ar: "يحصل كل زبون على رمز في صفحة الشكر ورابط مشاركة عبر واتساب. الصديق الذي يستخدمه في أول طلب يحصل على الخصم، وصاحب الرمز يحصل على نقاط عند توصيل ذلك الطلب.",
            ku: "هەر کڕیارێک کۆدێک لە پەڕەی سوپاس و بەستەرێکی هاوبەشکردن بە واتسئاپ وەردەگرێت. هاوڕێیەک لە یەکەم داواکاریدا بەکاری بهێنێت داشکاندن وەردەگرێت، و خاوەنی کۆدەکە کاتێک ئەو داواکارییە دەگات خاڵ وەردەگرێت.",
        },
        referral_enable: { en: "Enable referrals", ar: "تشغيل دعوة الأصدقاء", ku: "چالاککردنی بانگهێشتی هاوڕێ" },
        friend_pct_label: { en: "Friend's discount (%)", ar: "خصم الصديق (%)", ku: "داشکاندنی هاوڕێ (%)" },
        friend_pct_hint: { en: "Off their first order with the code", ar: "على أول طلب له بالرمز", ku: "لە یەکەم داواکاری بە کۆدەکە" },
        friend_cap_label: { en: "Cap on that discount (IQD)", ar: "حد أعلى للخصم (د.ع)", ku: "سنووری داشکاندن (دینار)" },
        friend_cap_hint: { en: "Blank = no cap", ar: "فارغ = بلا حد", ku: "بەتاڵ = بێ سنوور" },
        referrer_label: { en: "Points for the referrer", ar: "نقاط صاحب الدعوة", ku: "خاڵ بۆ بانگهێشتکەر" },
        referrer_hint: { en: "Credited when the friend's order is delivered; needs loyalty on", ar: "تُضاف عند توصيل طلب الصديق، وتحتاج تشغيل نقاط الولاء", ku: "کاتێک داواکاری هاوڕێ دەگات زیاد دەکرێت، پێویستی بە چالاکبوونی دڵسۆزی هەیە" },
        referral_needs_loyalty: { en: "Referrer points are paid through loyalty. Turn loyalty on, or the referrer gets nothing.", ar: "نقاط صاحب الدعوة تُدفع عبر نقاط الولاء. شغّل نقاط الولاء وإلا لن يحصل على شيء.", ku: "خاڵی بانگهێشتکەر لە ڕێگەی دڵسۆزییەوە دەدرێت. دڵسۆزی هەڵبکە، ئەگەرنا هیچ وەرناگرێت." },
    },
    pixels: {
        heading: { en: "Pixels & tracking", ar: "البكسلات والتتبع", ku: "پیکسڵ و بەدواداچوون" },
        close: { en: "Close pixels", ar: "إغلاق البكسلات", ku: "داخستنی پیکسڵەکان" },
        intro: {
            en: "Tell Meta and TikTok about visits and orders so your ads reach buyers.",
            ar: "أخبر ميتا وتيك توك بالزيارات والطلبات حتى تصل إعلاناتك لمن يشتري.",
            ku: "سەردان و داواکارییەکان بە مێتا و تیکتۆک ڕابگەیەنە بۆ ئەوەی ڕیکلامەکانت بگەنە کڕیاران.",
        },
        pixels_group: { en: "Pixels", ar: "البكسلات", ku: "پیکسڵەکان" },
        meta_placeholder: { en: "15–16 digit ID", ar: "رقم من 15–16 خانة", ku: "ژمارەی 15–16 ڕەقەمی" },
        tiktok_placeholder: { en: "one or more IDs, comma-separated", ar: "رقم أو أكثر، تفصل بينها فاصلة", ku: "یەک یان زیاتر، بە کۆما جیا بکەرەوە" },
        pixels_help: {
            en: "IDs load on your store and record page views, product views, add to cart, checkout starts and purchases automatically.",
            ar: "تُحمَّل الأرقام في متجرك وتسجّل تلقائياً زيارات الصفحات ومشاهدة المنتجات والإضافة إلى السلة وبدء الطلب والشراء.",
            ku: "ژمارەکان لە فرۆشگاکەت بار دەبن و بە خۆکاری سەردانی پەڕە و بینینی بەرهەم و زیادکردن بۆ سەبەتە و دەستپێکردنی داواکاری و کڕین تۆمار دەکەن.",
        },
        capi_group: { en: "Conversions API (server-side)", ar: "واجهة التحويلات (من الخادم)", ku: "API ی گۆڕانکاری (لە ڕاژەکار)" },
        capi_help: {
            en: "Tokens send each purchase from our server too, so ad platforms count it even when iPhone settings or ad blockers stop the pixel. Shoppers never see them.",
            ar: "ترسل الرموز كل عملية شراء من خادمنا أيضاً، فتحسبها منصات الإعلان حتى لو أوقفت إعدادات الآيفون أو مانعات الإعلانات البكسل. لا يراها زوار متجرك.",
            ku: "تۆکنەکان هەر کڕینێک لە ڕاژەکاری ئێمەشەوە دەنێرن، بۆیە پلاتفۆرمەکانی ڕیکلام دەیژمێرن تەنانەت ئەگەر ڕێکخستنی ئایفۆن یان ڕێگری ڕیکلام پیکسڵەکە ڕابگرێت. کڕیاران نایانبینن.",
        },
        meta_pixel: { en: "Meta Pixel ID", ar: "رقم بكسل Meta", ku: "ژمارەی پیکسڵی Meta" },
        tiktok_pixel: { en: "TikTok Pixel ID", ar: "رقم بكسل TikTok", ku: "ژمارەی پیکسڵی TikTok" },
        ga_id: { en: "Google Analytics ID", ar: "رقم Google Analytics", ku: "ژمارەی Google Analytics" },
        snap_pixel: { en: "Snapchat Pixel ID", ar: "رقم بكسل Snapchat", ku: "ژمارەی پیکسڵی Snapchat" },
        gtm_id: { en: "Google Tag Manager ID", ar: "رقم Google Tag Manager", ku: "ژمارەی Google Tag Manager" },
        meta_capi: { en: "Meta Conversions API token", ar: "رمز واجهة تحويلات Meta", ku: "تۆکنی API ی گۆڕانکاری Meta" },
        tiktok_capi: { en: "TikTok Events API token", ar: "رمز واجهة أحداث TikTok", ku: "تۆکنی API ی ڕووداوی TikTok" },
        meta_test_code: { en: "Meta test event code", ar: "رمز اختبار أحداث Meta", ku: "کۆدی تاقیکردنەوەی ڕووداوی Meta" },
        // Send keys live in a lockbox: saved / ends with / replace / delete.
        publish_note: { en: "Goes live when you publish the store.", ar: "يُطبَّق عند نشر المتجر.", ku: "کاتێک فرۆشگاکە بڵاو دەکەیتەوە جێبەجێ دەبێت." },
        key_saved: { en: "Saved", ar: "محفوظ", ku: "پاشەکەوتکراوە" },
        // Followed by the last four characters, isolated LTR («…WXYZ»).
        key_ends_with: { en: "Ends with", ar: "ينتهي بـ", ku: "کۆتایی بە" },
        key_replace: { en: "Replace", ar: "استبدال", ku: "گۆڕین" },
        key_delete: { en: "Delete", ar: "حذف", ku: "سڕینەوە" },
        key_save: { en: "Save token", ar: "حفظ الرمز", ku: "پاشەکەوتکردنی تۆکن" },
        key_cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوونەوە" },
        key_delete_confirm: {
            en: "Delete this token? Orders stop being sent from our server.",
            ar: "حذف الرمز؟ سيتوقف إرسال الطلبات من خادمنا.",
            ku: "ئەم تۆکنە بسڕدرێتەوە؟ ناردنی داواکارییەکان لە ڕاژەکاری ئێمەوە ڕادەوەستێت.",
        },
        key_delete_yes: { en: "Yes, delete", ar: "نعم، احذف", ku: "بەڵێ، بیسڕەوە" },
        key_paste: { en: "Paste the token", ar: "الصق الرمز", ku: "تۆکنەکە دابنێ" },
        key_locked_help: {
            en: "A saved token is locked: nobody can read it back, not even you. Changes apply right away, no publish needed.",
            ar: "الرمز المحفوظ مقفل: لا يستطيع أحد قراءته، ولا حتى أنت. التغيير يُطبَّق فوراً دون نشر.",
            ku: "تۆکنی پاشەکەوتکراو قفڵکراوە: کەس ناتوانێت بیخوێنێتەوە، تەنانەت تۆش. گۆڕانکاری دەستبەجێ جێبەجێ دەبێت، بێ بڵاوکردنەوە.",
        },
        key_loading: { en: "Checking saved tokens…", ar: "جارٍ التحقق من الرموز المحفوظة…", ku: "پشکنینی تۆکنە پاشەکەوتکراوەکان…" },
        key_load_error: { en: "Could not check the saved tokens.", ar: "تعذّر التحقق من الرموز المحفوظة.", ku: "نەتوانرا تۆکنە پاشەکەوتکراوەکان بپشکنرێن." },
        key_retry: { en: "Try again", ar: "حاول مرة أخرى", ku: "دووبارە هەوڵبدەرەوە" },
        key_save_error: { en: "Could not save. Try again.", ar: "تعذّر الحفظ. حاول مرة أخرى.", ku: "پاشەکەوت نەکرا. دووبارە هەوڵبدەرەوە." },
        key_forbidden: { en: "Only store admins can change tokens.", ar: "تغيير الرموز متاح لمدير المتجر فقط.", ku: "تەنها بەڕێوەبەری فرۆشگا دەتوانێت تۆکنەکان بگۆڕێت." },
    },
    cart_recovery: {
        heading: { en: "Cart recovery", ar: "استرجاع السلات المتروكة", ku: "گەڕاندنەوەی سەبەتە بەجێهێڵراوەکان" },
        close: { en: "Close cart recovery", ar: "إغلاق استرجاع السلات", ku: "داخستنی گەڕاندنەوەی سەبەتە" },
        intro: {
            en: "Send a WhatsApp nudge to customers who reached checkout but didn't complete their order. Off by default. Turn it on to start recovering carts.",
            ar: "أرسل تذكيراً عبر واتساب للزبائن الذين وصلوا إلى صفحة الطلب ولم يكملوه. متوقف افتراضياً، شغّله لتبدأ باسترجاع السلات.",
            ku: "بیرخستنەوەیەک بە واتسئاپ بنێرە بۆ ئەو کڕیارانەی گەیشتنە پەڕەی داواکاری بەڵام تەواویان نەکرد. بە بنەڕەت کوژاوەیە، هەڵیبکە بۆ دەستپێکردن.",
        },
        enable: { en: "Enable cart recovery", ar: "تشغيل استرجاع السلات", ku: "چالاککردنی گەڕاندنەوەی سەبەتە" },
        delay_label: { en: "Wait before messaging", ar: "الانتظار قبل الإرسال", ku: "چاوەڕوانی پێش ناردن" },
        delay_unit: { en: "(minutes, 5–1440)", ar: "(بالدقائق، 5–1440)", ku: "(بە خولەک، 5–1440)" },
        preview_title: { en: "What the customer gets", ar: "ما يصل للزبون", ku: "ئەوەی دەگاتە کڕیار" },
        preview_name: { en: "Greeting", ar: "التحية", ku: "سڵاو" },
        preview_name_value: { en: "عميلنا العزيز", ar: "عميلنا العزيز", ku: "عميلنا العزيز" },
        preview_items: { en: "Products", ar: "المنتجات", ku: "بەرهەمەکان" },
        preview_items_value: { en: "what is in their cart, e.g. «Product A × 2، Product B»", ar: "ما في سلّته، مثلاً «منتج أ × 2، منتج ب»", ku: "ئەوەی لە سەبەتەکەیدایە، وەک «بەرهەمی A × 2، بەرهەمی B»" },
        preview_total: { en: "Total", ar: "المجموع", ku: "کۆ" },
        preview_total_value: { en: "the cart total, e.g. IQD 45,000", ar: "مجموع السلة، مثلاً IQD 45,000", ku: "کۆی سەبەتە، وەک IQD 45,000" },
        preview_note: {
            en: "These three fill your approved WhatsApp cart message. Each cart gets one message only, and only customers who left a valid phone number.",
            ar: "هذه الثلاثة تُملأ في رسالة واتساب المعتمدة لاسترجاع السلة. كل سلة تصلها رسالة واحدة فقط، وفقط إذا ترك الزبون رقماً صحيحاً.",
            ku: "ئەم سێیانە لە نامەی پەسەندکراوی واتسئاپی سەبەتە پڕ دەکرێنەوە. هەر سەبەتەیەک تەنها یەک نامە وەردەگرێت، تەنها ئەگەر ژمارەیەکی دروست بەجێهێشترابێت.",
        },
    },
    custom_pages: {
        heading: { en: "Custom pages", ar: "صفحات مخصّصة", ku: "پەڕە تایبەتەکان" },
        close: { en: "Close custom pages", ar: "إغلاق الصفحات المخصصة", ku: "داخستنی پەڕە تایبەتەکان" },
        intro: {
            en: "Build campaign, landing, or lookbook pages. Each one lives at its own address under /p/. Add a page here, then add sections to it from the page list.",
            ar: "أنشئ صفحات للحملات أو الهبوط أو عرض المنتجات. لكل صفحة رابط خاص يبدأ بـ /p/. أضف الصفحة هنا ثم أضف لها أقساماً من قائمة الصفحات.",
            ku: "پەڕە بۆ کەمپەین یان نیشتنەوە یان نمایشی بەرهەم دروست بکە. هەر پەڕەیەک بەستەری تایبەتی خۆی هەیە لە ژێر /p/. پەڕەکە لێرە زیاد بکە، پاشان بەشی بۆ زیاد بکە لە لیستی پەڕەکان.",
        },
        new_title: { en: "New page title", ar: "عنوان الصفحة الجديدة", ku: "ناونیشانی پەڕەی نوێ" },
        add: { en: "Add", ar: "إضافة", ku: "زیادکردن" },
        empty: { en: "No custom pages yet.", ar: "لا توجد صفحات مخصّصة بعد.", ku: "هێشتا هیچ پەڕەیەکی تایبەت نییە." },
        page_title: { en: "Page title", ar: "عنوان الصفحة", ku: "ناونیشانی پەڕە" },
        page_slug: { en: "Page address", ar: "رابط الصفحة", ku: "بەستەری پەڕە" },
        hidden: { en: "Hidden", ar: "مخفية", ku: "شاراوە" },
        edit_sections: { en: "Edit sections", ar: "تعديل الأقسام", ku: "دەستکاری بەشەکان" },
        // tFormat: {path}
        delete_confirm: { en: "Delete {path}? Links to it will show «page not found».", ar: "حذف {path}؟ الروابط إليها ستعرض «الصفحة غير موجودة».", ku: "{path} بسڕدرێتەوە؟ بەستەرەکانی «پەڕە نەدۆزرایەوە» پیشان دەدەن." },
        delete: { en: "Delete", ar: "حذف", ku: "سڕینەوە" },
        keep: { en: "Keep", ar: "إبقاء", ku: "بیهێڵەوە" },
        delete_aria: { en: "Delete page", ar: "حذف الصفحة", ku: "سڕینەوەی پەڕە" },
        slug_empty: { en: "The address is required", ar: "الرابط مطلوب", ku: "بەستەر پێویستە" },
        slug_invalid: { en: "Use lowercase letters, numbers, and dashes", ar: "استخدم حروفاً إنجليزية صغيرة وأرقاماً وشَرطات", ku: "پیتی ئینگلیزی بچووک و ژمارە و هێڵ بەکاربهێنە" },
        slug_reserved: { en: "This address belongs to a built-in page", ar: "هذا الرابط محجوز لصفحة أساسية", ku: "ئەم بەستەرە بۆ پەڕەیەکی بنەڕەتی تەرخانکراوە" },
        slug_duplicate: { en: "Another page already uses this address", ar: "صفحة أخرى تستخدم هذا الرابط", ku: "پەڕەیەکی تر ئەم بەستەرە بەکاردەهێنێت" },
        // tFormat: {path}
        forwarded: { en: "Old link {path} now opens this page.", ar: "الرابط القديم {path} يفتح هذه الصفحة الآن.", ku: "بەستەری کۆن {path} ئێستا ئەم پەڕەیە دەکاتەوە." },
        forward_history: { en: "Forwarded old page address", ar: "إعادة توجيه رابط الصفحة القديم", ku: "گواستنەوەی بەستەری کۆنی پەڕە" },
        is_guide: { en: "This page is a guide", ar: "هذه الصفحة دليل إرشادي", ku: "ئەم پەڕەیە ڕێنمایییە" },
        published: { en: "Published", ar: "تاريخ النشر", ku: "بەرواری بڵاوکردنەوە" },
        author: { en: "Author", ar: "الكاتب", ku: "نووسەر" },
        optional: { en: "Optional", ar: "اختياري", ku: "ئارەزوومەندانە" },
        cover: { en: "Cover image URL", ar: "رابط صورة الغلاف", ku: "بەستەری وێنەی بەرگ" },
        cover_placeholder: { en: "Falls back to the page's social image", ar: "تُستخدم صورة المشاركة إن تُرك فارغاً", ku: "ئەگەر بەتاڵ بێت وێنەی هاوبەشکردن بەکاردێت" },
        summary: { en: "Summary", ar: "الملخص", ku: "پوختە" },
        summary_placeholder: { en: "One line for the guides list", ar: "سطر واحد لقائمة الأدلة", ku: "یەک دێڕ بۆ لیستی ڕێنماییەکان" },
        guide_help: {
            en: "Guides appear in the «Guides list» section, newest first. A date in the future keeps the page reachable but out of the list until then.",
            ar: "تظهر الأدلة في قسم «قائمة الأدلة»، الأحدث أولاً. التاريخ المستقبلي يُبقي الصفحة متاحة لكن خارج القائمة حتى يحين.",
            ku: "ڕێنماییەکان لە بەشی «لیستی ڕێنماییەکان» دەردەکەون، نوێترین یەکەم. بەروارێکی داهاتوو پەڕەکە بەردەست دەهێڵێتەوە بەڵام تا ئەو کاتە لە لیستەکەدا نییە.",
        },
    },
    common: {
        // Preview toolbar over the selected section.
        section_edit: { en: "Edit section", ar: "تعديل القسم", ku: "دەستکاری بەش" },
        section_duplicate: { en: "Duplicate section", ar: "نسخ القسم", ku: "لەبەرگرتنەوەی بەش" },
        section_move_up: { en: "Move up", ar: "نقل لأعلى", ku: "بۆ سەرەوە" },
        section_move_down: { en: "Move down", ar: "نقل لأسفل", ku: "بۆ خوارەوە" },
        section_delete: { en: "Delete section", ar: "حذف القسم", ku: "سڕینەوەی بەش" },
        // Per-device value buttons beside a field. tFormat: {device}
        device_value_add: { en: "Different value on {device}", ar: "قيمة مختلفة على {device}", ku: "بەهای جیاواز لەسەر {device}" },
        device_value_on: { en: "Has its own value on {device}", ar: "له قيمة خاصة على {device}", ku: "بەهای تایبەتی هەیە لەسەر {device}" },
        insert_section_here: { en: "Add a section here", ar: "أضف قسماً هنا", ku: "بەشێک لێرە زیاد بکە" },
        close: { en: "Close", ar: "إغلاق", ku: "داخستن" },
        cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوەوە" },
        save: { en: "Save", ar: "حفظ", ku: "هەڵگرتن" },
        delete: { en: "Delete", ar: "حذف", ku: "سڕینەوە" },
        edit: { en: "Edit", ar: "تعديل", ku: "دەستکاری" },
        remove: { en: "Remove", ar: "إزالة", ku: "لابردن" },
        add: { en: "Add", ar: "إضافة", ku: "زیادکردن" },
        done: { en: "Done", ar: "تم", ku: "تەواو" },
        loading: { en: "Loading…", ar: "جاري التحميل…", ku: "بارکردن…" },
    },
} as const satisfies Record<string, Record<string, EditorString>>;

/* ─────────────────────────────────────────────────────────────────── */
/* Diagnostics                                                          */
/* ─────────────────────────────────────────────────────────────────── */

/** Flatten the STRINGS tree to a list of dotted-path keys (for tests). */
export function listStringKeys(): string[] {
    const out: string[] = [];
    for (const area of Object.keys(STRINGS)) {
        const group = (STRINGS as unknown as Record<string, Record<string, EditorString>>)[area];
        for (const key of Object.keys(group)) {
            out.push(`${area}.${key}`);
        }
    }
    return out;
}

/** Count of strings missing a non-en translation (heuristic — equal to en). */
export function countUntranslated(locale: "ar" | "ku"): number {
    let n = 0;
    for (const area of Object.keys(STRINGS)) {
        const group = (STRINGS as unknown as Record<string, Record<string, EditorString>>)[area];
        for (const key of Object.keys(group)) {
            const s = group[key];
            if (!s.en) continue;
            if (s[locale] === s.en && s.en.length > 0 && !/^\d+$/.test(s.en) && s.en !== "SEO") {
                n++;
            }
        }
    }
    return n;
}
