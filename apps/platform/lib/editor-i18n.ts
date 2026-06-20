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
        coming_soon: { en: "soon", ar: "قريباً", ku: "بەم زووانە" },
        // Page groups
        group_storefront: { en: "Storefront", ar: "المتجر", ku: "فرۆشگا" },
        group_shop: { en: "Shop", ar: "التسوق", ku: "کڕین" },
        group_order: { en: "Order", ar: "الطلب", ku: "داواکاری" },
        group_pages: { en: "Pages", ar: "الصفحات", ku: "پەڕەکان" },
        group_policies: { en: "Policies", ar: "السياسات", ku: "ڕێسـاکان" },
        group_system: { en: "System", ar: "النظام", ku: "سیستەم" },
        // Pages
        page_home: { en: "Home", ar: "الرئيسية", ku: "ماڵەوە" },
        page_category: { en: "Category", ar: "الفئة", ku: "پۆل" },
        page_product: { en: "Product detail", ar: "تفاصيل المنتج", ku: "وردەکارییەکانی بەرهەم" },
        page_search: { en: "Search", ar: "البحث", ku: "گەڕان" },
        page_cart: { en: "Cart", ar: "السلة", ku: "سەبەتە" },
        page_checkout: { en: "Checkout", ar: "الدفع", ku: "پارەدان" },
        page_checkout_success: { en: "Thank you", ar: "شكراً لك", ku: "سوپاس" },
        page_track: { en: "Track order", ar: "تتبع الطلب", ku: "بەدواداچوونی داواکاری" },
        page_about: { en: "About", ar: "حول", ku: "دەربارە" },
        page_faq: { en: "FAQ", ar: "الأسئلة الشائعة", ku: "پرسیارە باوەکان" },
        page_contact: { en: "Contact", ar: "اتصل بنا", ku: "پەیوەندی" },
        page_policy_shipping: { en: "Shipping", ar: "الشحن", ku: "گەیاندن" },
        page_policy_returns: { en: "Returns", ar: "الإرجاع", ku: "گەڕاندنەوە" },
        page_policy_privacy: { en: "Privacy", ar: "الخصوصية", ku: "تایبەتمەندێتی" },
        page_policy_terms: { en: "Terms", ar: "الشروط", ku: "مەرجەکان" },
        page_not_found: { en: "404", ar: "404", ku: "404" },
        // Settings
        setting_brand_kit: { en: "Style & branding", ar: "هوية العلامة", ku: "کیتی برێند" },
        setting_health: { en: "Store health", ar: "الصحة", ku: "تەندروستی" },
        setting_i18n: { en: "Languages", ar: "اللغات", ku: "زمانەکان" },
        setting_segments: { en: "Audiences", ar: "الشرائح", ku: "بەشەکان" },
        setting_experiments: { en: "A/B tests", ar: "التجارب", ku: "تاقیکردنەوەکان" },
        setting_scheduled: { en: "Scheduled changes", ar: "المجدول", ku: "خشتەکراو" },
        setting_shipping: { en: "Shipping rates", ar: "أسعار التوصيل", ku: "نرخی گەیاندن" },
        setting_discounts: { en: "Discount codes", ar: "أكواد الخصم", ku: "کۆدی داشکاندن" },
        setting_versions: { en: "Past versions", ar: "النسخ", ku: "وەشانەکان" },
        setting_redirects: { en: "Redirects", ar: "إعادة التوجيه", ku: "ئاراستەکردن" },
    },

    /* ── Section list panel (Inspector "Blocks" tab) ───────────── */
    section_list: {
        heading: { en: "Blocks", ar: "العناصر", ku: "بەشەکان" },
        aria_label: { en: "Page blocks", ar: "عناصر الصفحة", ku: "بەشەکانی پەڕە" },
        templates_button: { en: "Template", ar: "قالب", ku: "قاڵب" },
        templates_title: { en: "Start from a page template", ar: "ابدأ من قالب صفحة", ku: "لە قاڵبی پەڕەوە دەستپێبکە" },
        empty_state_prefix: { en: "No blocks yet. Click", ar: "لا توجد عناصر بعد. اضغط", ku: "هێشتا هیچ بەشێک نییە. کلیک بکە" },
        empty_state_add: { en: "+ Add block", ar: "+ إضافة عنصر", ku: "+ زیادکردنی بەش" },
        // tFormat: {page} is the page label, possibly empty
        empty_state_suffix_named: { en: "to start building “{page}”.", ar: "لتبدأ بناء “{page}”.", ku: "بۆ دەستپێکردنی دروستکردنی “{page}”." },
        empty_state_suffix_unnamed: { en: "to start building this page.", ar: "لتبدأ بناء هذه الصفحة.", ku: "بۆ دەستپێکردنی دروستکردنی ئەم پەڕەیە." },
        empty_first_button: { en: "Add your first block", ar: "أضف أول عنصر", ku: "یەکەم بەشت زیاد بکە" },
        empty_template_button: { en: "Start from a template", ar: "ابدأ من قالب", ku: "لە قاڵبێکەوە دەستپێبکە" },
        add_button: { en: "Add block", ar: "إضافة عنصر", ku: "زیادکردنی بەش" },
        // Row actions
        row_drag: { en: "Drag to reorder", ar: "اسحب لإعادة الترتيب", ku: "ڕایبکێشە بۆ ڕێکخستنەوە" },
        row_collapse: { en: "Collapse section", ar: "طي العنصر", ku: "بەشەکە دابخە" },
        row_expand: { en: "Expand section", ar: "توسيع العنصر", ku: "بەشەکە بکەرەوە" },
        row_hide: { en: "Hide section", ar: "إخفاء العنصر", ku: "بەشەکە بشارەوە" },
        row_show: { en: "Show section", ar: "إظهار العنصر", ku: "بەشەکە پیشانبدە" },
        row_more: { en: "More section options", ar: "خيارات إضافية للعنصر", ku: "هەڵبژاردنی زیاتری بەش" },
        row_collapse_label: { en: "Collapse", ar: "طي", ku: "داخستن" },
        row_edit_label: { en: "Edit", ar: "تعديل", ku: "دەستکاری" },
        row_duplicate: { en: "Duplicate", ar: "تكرار", ku: "لەبەرگرتنەوە" },
        row_save_preset: { en: "Save as preset", ar: "حفظ كقالب جاهز", ku: "هەڵیبگرە وەکو قاڵبی ئامادە" },
        row_delete: { en: "Delete", ar: "حذف", ku: "سڕینەوە" },
        // Delete-toast (uses tFormat: {name})
        toast_deleted: { en: "“{name}” deleted", ar: "تم حذف “{name}”", ku: "“{name}” سڕایەوە" },
        toast_undo_hint: { en: "Undo within 5 seconds to bring it back.", ar: "تراجع خلال 5 ثوانٍ لاستعادته.", ku: "لە ماوەی ٥ چرکەدا پاشگەزبوەوە بۆ گەڕاندنەوەی." },
        toast_undo: { en: "Undo", ar: "تراجع", ku: "پاشگەزبوەوە" },
    },

    /* ── Section edit panel (inline AutoForm host) ─────────────── */
    section_edit: {
        close: { en: "Close edit panel", ar: "إغلاق لوحة التعديل", ku: "داخستنی پانێڵی دەستکاری" },
        label_field: { en: "Section label", ar: "اسم العنصر", ku: "ناوی بەش" },
        // tFormat: {name} is the canonical section name
        label_placeholder: { en: "e.g. {name} — Summer Sale", ar: "مثال: {name} — تخفيضات الصيف", ku: "نموونە: {name} — فرۆشتنی هاوین" },
        label_hint: { en: "Shown only in the editor — doesn’t affect the storefront.", ar: "يظهر فقط في المحرر — لا يؤثر على المتجر.", ku: "تەنیا لە دەستکاریکەردا دەردەکەوێت — کاریگەری لەسەر فرۆشگا نییە." },
        enabled_field: { en: "Enabled", ar: "مفعّل", ku: "چالاککراو" },
        enabled_hint: { en: "Disabled sections are hidden from the storefront.", ar: "العناصر المعطلة مخفية عن المتجر.", ku: "بەشە ناچالاکەکان لە فرۆشگاکەدا شاراوەن." },
        tab_properties: { en: "Properties", ar: "الخصائص", ku: "تایبەتمەندی" },
        tab_visibility: { en: "Visibility", ar: "الظهور", ku: "دەرکەوتن" },
        tab_variants: { en: "Variants", ar: "الاختلافات", ku: "جیاوازی" },
        // tFormat: {type}
        missing_schema: { en: "No schema registered for “{type}”.", ar: "لا يوجد مخطط مسجّل لـ “{type}”.", ku: "هیچ نەخشەیەک تۆمارنەکراوە بۆ “{type}”." },
        visibility_empty: { en: "Always visible — add a rule to hide conditionally.", ar: "ظاهر دائماً — أضف قاعدة لإخفائه شرطياً.", ku: "هەمیشە دیارە — ڕێسایەک زیاد بکە بۆ شاردنەوەی بە مەرج." },
        visibility_kind_locale: { en: "Language", ar: "اللغة", ku: "زمان" },
        visibility_kind_breakpoint: { en: "Device", ar: "الجهاز", ku: "ئامێر" },
        visibility_kind_time_window: { en: "Schedule", ar: "الجدولة", ku: "خشتە" },
        visibility_kind_audience: { en: "Segment", ar: "الشريحة", ku: "بەش" },
        visibility_kind_governorate: { en: "Governorate", ar: "المحافظة", ku: "پارێزگا" },
        visibility_kind_page: { en: "Page", ar: "الصفحة", ku: "پەڕە" },
        // Property-group headers (AutoForm Essentials/Style/Logic split)
        group_essentials: { en: "Essentials", ar: "الأساسيات", ku: "بنەڕەتییەکان" },
        group_style: { en: "Style", ar: "التصميم", ku: "شێواز" },
        group_logic: { en: "Wiring", ar: "الإعدادات", ku: "ڕێکخستن" },
    },

    /* ── Section picker (modal "Add a section") ────────────────── */
    section_picker: {
        title_default: { en: "Add a section", ar: "إضافة عنصر", ku: "زیادکردنی بەش" },
        // tFormat: {page}
        title_with_page: { en: "Add a section to {page}", ar: "إضافة عنصر إلى {page}", ku: "زیادکردنی بەش بۆ {page}" },
        subtitle: { en: "After adding, click any section to edit it.", ar: "بعد الإضافة، اضغط على أي عنصر لتعديله.", ku: "دوای زیادکردن، کلیک لە هەر بەشێک بکە بۆ دەستکاری." },
        close: { en: "Close section picker", ar: "إغلاق منتقي العناصر", ku: "داخستنی هەڵبژێرەری بەش" },
        tab_library: { en: "Library", ar: "المكتبة", ku: "کتێبخانە" },
        // tFormat: {count}
        tab_presets: { en: "Saved presets ({count})", ar: "القوالب المحفوظة ({count})", ku: "قاڵبە پاشەکەوتکراوەکان ({count})" },
        tab_presets_zero: { en: "Saved presets", ar: "القوالب المحفوظة", ku: "قاڵبە پاشەکەوتکراوەکان" },
        search_placeholder: { en: "Search sections...", ar: "ابحث عن العناصر...", ku: "گەڕان بۆ بەشەکان..." },
        category_all: { en: "All", ar: "الكل", ku: "هەموو" },
        empty_search: { en: "No sections match your search.", ar: "لا توجد عناصر تطابق بحثك.", ku: "هیچ بەشێک لەگەڵ گەڕانەکەت ناگونجێت." },
        not_for_page: { en: "Not for this page", ar: "غير متاح لهذه الصفحة", ku: "بۆ ئەم پەڕەیە نییە" },
        add_chip: { en: "+ Add", ar: "+ إضافة", ku: "+ زیادکردن" },
        presets_empty_title: { en: "No saved presets yet", ar: "لا توجد قوالب محفوظة بعد", ku: "هێشتا هیچ قاڵبێکی پاشەکەوتکراو نییە" },
        presets_empty_hint: { en: "Configure any section on a page, then choose “Save as preset” from its menu to reuse it here.", ar: "اضبط أي عنصر في صفحة، ثم اختر “حفظ كقالب جاهز” من قائمته لاستخدامه هنا.", ku: "هەر بەشێک لە پەڕەیەکدا ڕێکبخە، پاشان “هەڵیبگرە وەکو قاڵبی ئامادە” لە مێنیوەکەی هەڵبژێرە بۆ بەکارهێنانەوەی لێرە." },
        // tFormat: {name}
        delete_preset_aria: { en: "Delete preset {name}", ar: "حذف القالب {name}", ku: "سڕینەوەی قاڵبی {name}" },
        delete_preset_title: { en: "Delete this preset?", ar: "حذف هذا القالب؟", ku: "ئەم قاڵبە بسڕیتەوە؟" },
        delete_preset_description: { en: "“{name}” will be removed from your preset library. Sections you've already added from it are unaffected.", ar: "“{name}” سيتم حذفه من مكتبة القوالب. العناصر التي أضفتها منه لن تتأثر.", ku: "“{name}” لە کتێبخانەی قاڵبەکانتدا دەسڕێتەوە. ئەو بەشانەی پێشتر زیادتکردوون کاریگەرییان لەسەر ناکەوێت." },
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
        empty_hint: { en: "No versions yet. Versions let you show this section differently — by date, device, city, language, or as an A/B test.", ar: "لا توجد نسخ بعد. تتيح لك النسخ عرض هذا القسم بشكل مختلف — حسب التاريخ أو الجهاز أو المدينة أو اللغة أو كاختبار A/B.", ku: "هێشتا هیچ وەشانێک نییە. وەشانەکان ڕێگەت دەدەن ئەم بەشە بە جیاوازی پیشانبدەیت — بەپێی بەروار، ئامێر، شار، زمان، یان وەکو تاقیکردنەوەی A/B." },
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
        preset_ab_title: { en: "A/B test two versions", ar: "اختبار A/B لنسختين", ku: "تاقیکردنەوەی A/B بۆ دوو وەشان" },
        preset_ab_desc: { en: "Split traffic to find the winner.", ar: "قسّم الزوار لإيجاد الفائز.", ku: "سەردانیکەران دابەش بکە بۆ دۆزینەوەی براوە." },
        preset_advanced: { en: "Advanced — choose any rule", ar: "متقدم — اختر أي قاعدة", ku: "پێشکەوتوو — هەر ڕێسایەک هەڵبژێرە" },
        preset_ab_auto_name: { en: "Test on {section}", ar: "اختبار على {section}", ku: "تاقیکردنەوە لەسەر {section}" },

        // Iraqi-market preset shortcuts
        preset_baghdad_same_day_title: { en: "Baghdad same-day promise", ar: "وعد التوصيل خلال اليوم في بغداد", ku: "بەڵێنی گەیاندنی هەمان ڕۆژ لە بەغدا" },
        preset_baghdad_same_day_desc: { en: "Show a faster delivery promise to shoppers in Baghdad.", ar: "اعرض وعد توصيل أسرع لزوار بغداد.", ku: "بەڵێنی گەیاندنی خێراتر بۆ کڕیارانی بەغدا پیشان بدە." },
        preset_baghdad_same_day_label: { en: "Baghdad same-day", ar: "بغداد — نفس اليوم", ku: "بەغدا — هەمان ڕۆژ" },
        preset_ramadan_title: { en: "Ramadan banner", ar: "بانر رمضان", ku: "بانەری ڕەمەزان" },
        preset_ramadan_desc: { en: "Activate a Ramadan-themed version during the holy month.", ar: "فعّل نسخة بطابع رمضاني خلال الشهر الفضيل.", ku: "وەشانێکی بە تەمای ڕەمەزان لە مانگی پیرۆزدا چالاک بکە." },
        preset_ramadan_label: { en: "Ramadan banner", ar: "بانر رمضان", ku: "بانەری ڕەمەزان" },
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
        wizard_audience_label: { en: "Customer segment", ar: "شريحة العميل", ku: "بەشی کڕیار" },
        wizard_audience_placeholder: { en: "— pick a segment —", ar: "— اختر شريحة —", ku: "— بەشێک هەڵبژێرە —" },
        wizard_audience_empty: { en: "No segments defined. Define segments in Settings → Segments before using this variant kind.", ar: "لا توجد شرائح. عرّف الشرائح من الإعدادات ← الشرائح قبل استخدام هذا النوع.", ku: "هیچ بەشێک پێناسە نەکراوە. لە ڕێکخستنەکان ← بەشەکان پێناسە بکە پێش بەکارهێنانی ئەم جۆرە." },
        wizard_ab_experiment: { en: "Experiment", ar: "التجربة", ku: "تاقیکردنەوە" },
        wizard_ab_experiment_placeholder: { en: "— pick an experiment —", ar: "— اختر تجربة —", ku: "— تاقیکردنەوەیەک هەڵبژێرە —" },
        wizard_ab_arm: { en: "Arm", ar: "الذراع", ku: "بازنە" },
        wizard_ab_arm_placeholder: { en: "— pick an arm —", ar: "— اختر ذراعاً —", ku: "— بازنەیەک هەڵبژێرە —" },
        wizard_ab_empty: { en: "No experiments defined. Create experiments in Settings → Experiments first.", ar: "لا توجد تجارب. أنشئ التجارب من الإعدادات ← التجارب أولاً.", ku: "هیچ تاقیکردنەوەیەک پێناسە نەکراوە. سەرەتا تاقیکردنەوەکان لە ڕێکخستنەکان ← تاقیکردنەوەکان دروست بکە." },
        wizard_governorate_prompt: { en: "Which governorates?", ar: "أي المحافظات؟", ku: "کام پارێزگاکان؟" },
        wizard_pages_prompt: { en: "Which pages?", ar: "أي الصفحات؟", ku: "کام پەڕەکان؟" },
        wizard_searching: { en: "Searching…", ar: "جاري البحث…", ku: "گەڕان دەکات…" },
        wizard_search_unavailable: { en: "Search unavailable — paste IDs separated by commas.", ar: "البحث غير متاح — الصق المعرّفات مفصولة بفواصل.", ku: "گەڕان بەردەست نییە — IDەکان بە کۆما لێکدابڕاو بدە." },
    },

    /* ── Experiments (merchant view of A/B tests) ──────────────── */
    experiment: {
        heading: { en: "Tests", ar: "الاختبارات", ku: "تاقیکردنەوەکان" },
        subtitle: { en: "Compare two versions side by side. Pick a goal, split your visitors, then promote the winner.", ar: "قارن نسختين جنباً إلى جنب. اختر هدفاً، قسّم زوارك، ثم رقّ الفائز.", ku: "دوو وەشان لەلای یەکدا بەراورد بکە. ئامانجێک هەڵبژێرە، سەردانیکەرانت دابەش بکە، پاشان براوەی پلەی بەرز بکەرەوە." },
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
        verdict_learning: { en: "STILL LEARNING", ar: "لا يزال يتعلم", ku: "هێشتا فێردەبێت" },
        verdict_winning_hint: { en: "This version is winning. Confidence is high enough to ship it.", ar: "هذه النسخة فائزة. الثقة مرتفعة كفاية للنشر.", ku: "ئەم وەشانە براوەیە. متمانە بەرزە بۆ بڵاوکردنەوەی." },
        verdict_losing_hint: { en: "This version is doing worse than the original.", ar: "هذه النسخة أسوأ من الأصلية.", ku: "ئەم وەشانە لە بنەڕەت خراپترە." },
        verdict_learning_hint: { en: "Need more visitors to call a winner. Keep the test running.", ar: "نحتاج زواراً أكثر لتحديد الفائز. اترك الاختبار يعمل.", ku: "پێویستی بە سەردانیکەری زیاتر هەیە بۆ دیاریکردنی براوە. تاقیکردنەوەکە بەردەوام بکە." },
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
        subtitle: { en: "Group visitors by behavior, location, or device — then show them different versions of your store.", ar: "جمّع الزوار حسب السلوك أو الموقع أو الجهاز — ثم اعرض لهم نسخاً مختلفة من متجرك.", ku: "سەردانیکەران بەپێی ڕەفتار، شوێن، یان ئامێر کۆبکەرەوە — پاشان وەشانی جیاوازی فرۆشگاکەت پیشانیان بدە." },
        new: { en: "New audience", ar: "جمهور جديد", ku: "بینەری نوێ" },
        empty_title: { en: "No audiences yet", ar: "لا يوجد جمهور بعد", ku: "هێشتا هیچ بینەرێک نییە" },
        empty_hint: { en: "Audiences let you target versions at specific visitor types (new vs returning, by governorate, by cart value, etc).", ar: "تتيح لك الجمهور استهداف نسخ بأنواع زوار محددة (جدد مقابل عائدين، حسب المحافظة، حسب قيمة السلة، إلخ).", ku: "بینەران ڕێگەت دەدەن وەشانەکان بۆ جۆری دیاریکراوی سەردانیکەران ئامانج بکەیت (نوێ بەرامبەر گەڕاو، بەپێی پارێزگا، بەپێی نرخی سەبەتە، هتد)." },
        empty_new: { en: "Create your first audience", ar: "أنشئ أول جمهور", ku: "یەکەم بینەرت دروست بکە" },
        delete_button: { en: "Delete audience", ar: "حذف الجمهور", ku: "سڕینەوەی بینەر" },
    },

    /* ── Publish ──────────────────────────────────────────────── */
    publish: {
        button: { en: "Publish", ar: "نشر", ku: "بڵاوکردنەوە" },
        publishing: { en: "Publishing…", ar: "جاري النشر…", ku: "بڵاودەکرێتەوە…" },
        confirm_title: { en: "Ready to publish?", ar: "جاهز للنشر؟", ku: "ئامادەی بۆ بڵاوکردنەوە؟" },
        // tFormat: {n}
        confirm_subtitle_one: { en: "{n} item we recommend fixing before going live. You can publish anyway and come back to these later.", ar: "{n} عنصر يُستحسن إصلاحه قبل النشر. يمكنك النشر على أي حال والعودة لاحقاً.", ku: "{n} بڕگە کە پێشنیار دەکرێت پێش بڵاوکردنەوە چاکبکرێت. دەتوانی هەر بڵاوی بکەیتەوە و دواتر بگەڕێیتەوە." },
        confirm_subtitle_many: { en: "{n} items we recommend fixing before going live. You can publish anyway and come back to these later.", ar: "{n} عناصر يُستحسن إصلاحها قبل النشر. يمكنك النشر على أي حال والعودة لاحقاً.", ku: "{n} بڕگە کە پێشنیار دەکرێت پێش بڵاوکردنەوە چاکبکرێن. دەتوانی هەر بڵاوی بکەیتەوە و دواتر بگەڕێیتەوە." },
        confirm_all_clear: { en: "All clear. Publish away.", ar: "كل شيء جاهز. انشر الآن.", ku: "هەموو شت ئامادەیە. بڵاوی بکەرەوە." },
        publish_anyway: { en: "Publish anyway", ar: "نشر على أي حال", ku: "هەر بڵاویبکەرەوە" },
        cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوەوە" },
        blocks_chip: { en: "Blocks", ar: "يحظر", ku: "ڕێگری دەکات" },
        disabled_no_changes: { en: "Nothing to publish — make a change first.", ar: "لا شيء للنشر — قم بإجراء تغيير أولاً.", ku: "هیچ شت بۆ بڵاوکردنەوە نییە — سەرەتا گۆڕانکارییەک بکە." },
    },

    /* ── Save state pill / toolbar status ──────────────────────── */
    save_state: {
        saving: { en: "Saving…", ar: "جاري الحفظ…", ku: "خەزن دەکرێ…" },
        saved_just_now: { en: "Saved just now", ar: "تم الحفظ الآن", ku: "ئێستا خەزنکرا" },
        // tFormat: {n}
        saved_seconds: { en: "Saved {n}s ago", ar: "تم الحفظ منذ {n}ث", ku: "{n}س لەمەوبەر خەزنکرا" },
        saved_minutes: { en: "Saved {n}m ago", ar: "تم الحفظ منذ {n}د", ku: "{n}خ لەمەوبەر خەزنکرا" },
        error: { en: "Save failed", ar: "فشل الحفظ", ku: "خەزنکردن سەرکەوتوو نەبوو" },
    },

    /* ── Version history ──────────────────────────────────────── */
    version_history: {
        heading: { en: "Version History", ar: "سجل النسخ", ku: "مێژووی وەشانەکان" },
        subtitle: { en: "Restore any previous version of your store. Named snapshots never expire.", ar: "استرجع أي نسخة سابقة من متجرك. اللقطات المسمّاة لا تنتهي صلاحيتها.", ku: "هەر وەشانێکی پێشووی فرۆشگاکەت بگەڕێنەوە. وێنە ناودارەکان بەسەرنایەن." },
        back: { en: "Back", ar: "رجوع", ku: "گەڕانەوە" },
        refresh: { en: "Refresh", ar: "تحديث", ku: "نوێکردنەوە" },
        save_snapshot: { en: "Save snapshot", ar: "حفظ لقطة", ku: "هەڵگرتنی وێنە" },
        snapshot_placeholder: { en: "Label, e.g. 'Before Eid sale'", ar: "اسم، مثال: 'قبل تخفيضات العيد'", ku: "ناو، نموونە: 'پێش فرۆشتنی جەژن'" },
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
        diff_heading: { en: "Changes vs current draft", ar: "التغييرات مقارنة بالمسودة الحالية", ku: "گۆڕانکارییەکان بەراورد بە ڕەشنووسی ئێستا" },
        diff_empty: { en: "No differences vs your current draft.", ar: "لا توجد فروقات مقارنة بمسودتك الحالية.", ku: "هیچ جیاوازییەک نییە بەراورد بە ڕەشنووسی ئێستات." },
        diff_added: { en: "added", ar: "أُضيف", ku: "زیادکرا" },
        diff_removed: { en: "removed", ar: "أُزيل", ku: "لابرا" },
        diff_changed: { en: "changed", ar: "تغيّر", ku: "گۆڕا" },
    },

    /* ── Scheduled changes ────────────────────────────────────── */
    scheduled: {
        heading: { en: "Scheduled Changes", ar: "التغييرات المجدولة", ku: "گۆڕانکارییە خشتەکراوەکان" },
        subtitle: { en: "Time-windowed variants you’ve set up across your store.", ar: "اختلافات محدّدة زمنياً قمت بإعدادها في متجرك.", ku: "جیاوازییە کاتدارەکانی فرۆشگاکەت کە دایناون." },
        new: { en: "New schedule", ar: "جدولة جديدة", ku: "خشتەی نوێ" },
        empty_title: { en: "No scheduled changes", ar: "لا توجد تغييرات مجدولة", ku: "هیچ گۆڕانکارییەکی خشتەکراو نییە" },
        empty_hint: { en: "Use this screen to schedule future variants of any section — promo banners, hero swaps, free-shipping notices, and more.", ar: "استخدم هذه الشاشة لجدولة اختلافات مستقبلية لأي عنصر — بانرات ترويجية، تبديل البطل، إشعارات الشحن المجاني، والمزيد.", ku: "ئەم پەردەیە بەکاربهێنە بۆ خشتەکردنی جیاوازی داهاتووی هەر بەشێک — بانەری بانگەشە، گۆڕینی هیرۆ، ئاگادارکردنەوەی گەیاندنی بەخۆڕایی، و زیاتر." },
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
        heading: { en: "Store Health", ar: "صحة المتجر", ku: "تەندروستی فرۆشگا" },
        // tFormat: {tenant}
        subtitle: { en: "{tenant} — what to fix before launch", ar: "{tenant} — ما الذي يجب إصلاحه قبل الإطلاق", ku: "{tenant} — چی پێویستە چاکبکرێت پێش دەستپێکردن" },
        out_of_100: { en: "out of 100", ar: "من 100", ku: "لە ١٠٠" },
        score_needs_work: { en: "Needs work", ar: "يحتاج عملاً", ku: "پێویستی بە کار هەیە" },
        score_almost: { en: "Almost there", ar: "اقتربت", ku: "نزیکی" },
        score_ready: { en: "Ready to launch", ar: "جاهز للإطلاق", ku: "ئامادەیە بۆ دەستپێکردن" },
        score_great: { en: "Looking great", ar: "ممتاز", ku: "زۆر باشە" },
        cat_ad_compliance: { en: "Ad compliance", ar: "الامتثال الإعلاني", ku: "گونجاندنی ڕیکلام" },
        cat_conversion: { en: "Conversion", ar: "التحويل", ku: "گۆڕین" },
        cat_seo: { en: "SEO", ar: "SEO", ku: "SEO" },
        cat_trust: { en: "Trust", ar: "الثقة", ku: "متمانە" },
        cat_content: { en: "Content", ar: "المحتوى", ku: "ناوەڕۆک" },
        cat_performance: { en: "Performance", ar: "الأداء", ku: "کارایی" },
        // tFormat: {n}
        blocks_publish: { en: "Blocks publish ({n})", ar: "يحظر النشر ({n})", ku: "ڕێگری لە بڵاوکردنەوە دەکات ({n})" },
        blocks_publish_hint: { en: "— fix these before you can publish.", ar: "— أصلحها قبل أن تتمكّن من النشر.", ku: "— پێش بڵاوکردنەوە چاکیانبکە." },
        filter_all: { en: "all", ar: "الكل", ku: "هەموو" },
        filter_failing: { en: "Failing + Warn", ar: "فشل + تحذير", ku: "شکست + ئاگاداری" },
        filter_warn: { en: "warn", ar: "تحذير", ku: "ئاگاداری" },
        filter_passing: { en: "passing", ar: "ناجح", ku: "سەرکەوتوو" },
        // tFormat: {visible} {total}
        checks_count: { en: "{visible} of {total} checks", ar: "{visible} من {total} فحوصات", ku: "{visible} لە {total} پشکنین" },
        no_checks_match: { en: "No checks match this filter — nice work.", ar: "لا توجد فحوصات تطابق هذا الفلتر — عمل ممتاز.", ku: "هیچ پشکنینێک لەگەڵ ئەم پاڵاوتنە ناگونجێت — کاری باش." },
    },

    /* ── i18n screen ──────────────────────────────────────────── */
    i18n_screen: {
        heading: { en: "Translation coverage", ar: "تغطية الترجمة", ku: "بەرفراوانی وەرگێڕان" },
        back: { en: "Back to preview", ar: "العودة إلى المعاينة", ku: "گەڕانەوە بۆ پێشبینین" },
        locale_arabic: { en: "Arabic", ar: "العربية", ku: "عەرەبی" },
        locale_english: { en: "English", ar: "الإنجليزية", ku: "ئینگلیزی" },
        locale_kurdish: { en: "Kurdish", ar: "الكردية", ku: "کوردی" },
        // tFormat: {locale}
        instructions: { en: "Showing untranslated fields for {locale}. Switch locales using the pills above.", ar: "عرض الحقول غير المترجمة بـ {locale}. بدّل اللغات من الأزرار أعلاه.", ku: "خانە وەرنەگێڕدراوەکان بۆ {locale} پیشاندەدرێت. لە سەرەوە زمانەکان بگۆڕە." },
        translate_button: { en: "Translate", ar: "ترجمة", ku: "وەرگێڕان" },
        globals: { en: "Globals", ar: "العام", ku: "گشتییەکان" },
        toolbar_pill_title: { en: "View translation coverage", ar: "عرض تغطية الترجمة", ku: "بینینی بەرفراوانی وەرگێڕان" },
        // tFormat: {n}
        more_count: { en: "+ {n} more…", ar: "+ {n} المزيد…", ku: "+ {n} زیاتر…" },
    },

    /* ── Page templates ───────────────────────────────────────── */
    page_template: {
        title: { en: "Start from a template", ar: "ابدأ من قالب", ku: "لە قاڵبێکەوە دەستپێبکە" },
        subtitle: { en: "Pick a starter pack — sections drop in and you can edit each one after.", ar: "اختر باقة بداية — العناصر ستُضاف ويمكنك تعديل كل منها لاحقاً.", ku: "پاکێجێکی دەستپێک هەڵبژێرە — بەشەکان زیاددەکرێن و دەتوانی هەریەکیان دەستکاری بکەیت." },
        close: { en: "Close template picker", ar: "إغلاق منتقي القوالب", ku: "داخستنی هەڵبژێرەری قاڵب" },
        // tFormat: {name}
        apply_title: { en: "Apply “{name}”?", ar: "تطبيق “{name}”؟", ku: "“{name}” جێبەجێبکرێت؟" },
        // tFormat: {n}
        warning_replace_one: { en: "This will replace 1 section already on this page. The original will be discarded.", ar: "سيستبدل هذا قسماً واحداً على هذه الصفحة. سيتم تجاهل الأصلي.", ku: "ئەمە بەشێکی ئەم پەڕەیە دەگۆڕێت. ئەو بەشە بنەڕەتییە لاندەبرێت." },
        warning_replace_many: { en: "This will replace {n} sections already on this page. The originals will be discarded.", ar: "سيستبدل هذا {n} عناصر على هذه الصفحة. سيتم تجاهل الأصلية.", ku: "ئەمە {n} بەشی ئەم پەڕەیە دەگۆڕێت. ئەو بەشە بنەڕەتییەکان لاندەبرێن." },
        // tFormat: {n}
        includes_count_one: { en: "Includes 1 section", ar: "يحتوي على قسم واحد", ku: "بەشێک لەخۆدەگرێت" },
        includes_count_many: { en: "Includes {n} sections", ar: "يحتوي على {n} عناصر", ku: "{n} بەش لەخۆدەگرێت" },
        cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوەوە" },
        apply: { en: "Apply template", ar: "تطبيق القالب", ku: "جێبەجێکردنی قاڵب" },
        start_blank: { en: "Or start blank ↓", ar: "أو ابدأ من الصفر ↓", ku: "یان بەتاڵ دەستپێبکە ↓" },
    },

    /* ── Save preset dialog ───────────────────────────────────── */
    save_preset: {
        title: { en: "Save section as preset", ar: "حفظ العنصر كقالب جاهز", ku: "هەڵگرتنی بەش وەکو قاڵبی ئامادە" },
        description: { en: "Give this preset a memorable name — you can reuse it on any page from the Add panel.", ar: "أعطِ هذا القالب اسماً لا يُنسى — يمكنك إعادة استخدامه في أي صفحة من لوحة الإضافة.", ku: "ناوێکی بیرهێنەرەوە بدە بەم قاڵبە — دەتوانی لە هەر پەڕەیەکدا لە پانێڵی زیادکردن دووبارە بەکاریبهێنیتەوە." },
        name_label: { en: "Preset name", ar: "اسم القالب", ku: "ناوی قاڵب" },
        placeholder: { en: "e.g. Ramadan trust strip", ar: "مثال: شريط الثقة لرمضان", ku: "نموونە: شریتی متمانە بۆ ڕەمەزان" },
        cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوەوە" },
        save: { en: "Save preset", ar: "حفظ القالب", ku: "هەڵگرتنی قاڵب" },
    },

    /* ── Preview-as controls ──────────────────────────────────── */
    preview_as: {
        button: { en: "Preview as", ar: "معاينة كـ", ku: "پێشبینین وەکو" },
        heading: { en: "Simulate visitor", ar: "محاكاة زائر", ku: "لاسایی سەردانکەر" },
        reset: { en: "Reset", ar: "إعادة", ku: "ڕێکخستنەوە" },
        governorate: { en: "Governorate", ar: "المحافظة", ku: "پارێزگا" },
        any: { en: "— Any —", ar: "— أي —", ku: "— هەرکام —" },
        segments: { en: "Audience segments", ar: "شرائح الجمهور", ku: "بەشەکانی بینەران" },
        no_segments: { en: "No segments defined.", ar: "لا توجد شرائح.", ku: "هیچ بەشێک پێناسە نەکراوە." },
        ab_experiments: { en: "A/B experiments", ar: "تجارب A/B", ku: "تاقیکردنەوەکانی A/B" },
        no_experiments: { en: "No experiments defined.", ar: "لا توجد تجارب.", ku: "هیچ تاقیکردنەوەیەک پێناسە نەکراوە." },
        auto: { en: "— Auto —", ar: "— تلقائي —", ku: "— ئۆتۆماتیک —" },
    },

    /* ── Common ──────────────────────────────────────────────── */
    common: {
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
