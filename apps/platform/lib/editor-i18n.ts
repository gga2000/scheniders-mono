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
        advanced_live_chip: { en: "Active advanced settings — view", ar: "إعدادات متقدّمة نشطة — اعرضها", ku: "ڕێکخستنە پێشکەوتووە چالاکەکان — بیانبینە" },
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
        setting_cart_recovery: { en: "Cart recovery", ar: "استرجاع السلات", ku: "گەڕاندنەوەی سەبەتە" },
        setting_bundles: { en: "Bundles", ar: "الحزم", ku: "پاکێجەکان" },
        setting_pixels: { en: "Pixels & tracking", ar: "البكسلات والتتبّع", ku: "پیکسڵ و شوێنکەوتن" },
        setting_loyalty: { en: "Loyalty points", ar: "نقاط الولاء", ku: "خاڵی دڵسۆزی" },
        setting_order_status: { en: "Order tracking messages", ar: "رسائل تتبّع الطلب", ku: "پەیامەکانی شوێنکەوتنی داواکاری" },
        setting_custom_pages: { en: "Custom pages", ar: "صفحات مخصّصة", ku: "پەڕە تایبەتەکان" },
        setting_nav: { en: "Navigation", ar: "التنقّل", ku: "ڕێنیشاندان" },
        setting_versions: { en: "Past versions", ar: "النسخ", ku: "وەشانەکان" },
        setting_redirects: { en: "Redirects", ar: "إعادة التوجيه", ku: "ئاراستەکردن" },
        group_custom_pages: { en: "Custom pages", ar: "صفحات مخصّصة", ku: "پەڕە تایبەتەکان" },
        manage_custom_pages: { en: "Manage custom pages", ar: "إدارة الصفحات المخصّصة", ku: "بەڕێوەبردنی پەڕە تایبەتەکان" },
        add_custom_page: { en: "Add custom page", ar: "إضافة صفحة مخصّصة", ku: "زیادکردنی پەڕەی تایبەت" },
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
        // On-canvas empty-page card (the canvas itself, not the rail)
        canvas_empty_title: { en: "This page is empty", ar: "هذه الصفحة فارغة", ku: "ئەم پەڕەیە بەتاڵە" },
        canvas_empty_hint: { en: "Add a block or start from a ready-made template — you can change everything later.", ar: "أضف عنصراً أو ابدأ من قالب جاهز — يمكنك تغيير كل شيء لاحقاً.", ku: "بەشێک زیاد بکە یان لە قاڵبێکی ئامادەوە دەستپێبکە — دەتوانی دواتر هەموو شتێک بگۆڕیت." },
        canvas_empty_hint_no_templates: { en: "Add a block to build this page — you can change everything later.", ar: "أضف عنصراً لبناء هذه الصفحة — يمكنك تغيير كل شيء لاحقاً.", ku: "بەشێک زیاد بکە بۆ دروستکردنی ئەم پەڕەیە — دەتوانی دواتر هەموو شتێک بگۆڕیت." },
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
        recent_heading: { en: "Recently used", ar: "المستخدمة مؤخراً", ku: "بەم دواییانە بەکارهاتوو" },
        empty_search: { en: "No sections match your search.", ar: "لا توجد عناصر تطابق بحثك.", ku: "هیچ بەشێک لەگەڵ گەڕانەکەت ناگونجێت." },
        not_for_page: { en: "Not for this page", ar: "غير متاح لهذه الصفحة", ku: "بۆ ئەم پەڕەیە نییە" },
        add_chip: { en: "+ Add", ar: "+ إضافة", ku: "+ زیادکردن" },
        // tFormat: {name}
        card_add_title: { en: "Add {name}", ar: "إضافة {name}", ku: "زیادکردنی {name}" },
        card_invalid_title: { en: "{name} can't be placed on this page", ar: "{name} لا يمكن وضعه في هذه الصفحة", ku: "{name} ناتوانرێت لەم پەڕەیەدا دابنرێت" },
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
        // Positive CTA when nothing needs fixing — first publish should feel
        // like a win, not like overriding a safety warning.
        publish_cta: { en: "Publish my store", ar: "انشر متجري", ku: "فرۆشگاکەم بڵاوبکەرەوە" },
        // tFormat: {n} {list} — tooltip on the disabled/annotated publish button
        blocked_tooltip: { en: "{n} checks need attention before you publish: {list}", ar: "{n} فحوصات تحتاج انتباهك قبل النشر: {list}", ku: "{n} پشکنین پێویستیان بە سەرنجە پێش بڵاوکردنەوە: {list}" },
        // tFormat: {n}
        blocked_tooltip_more: { en: ", +{n} more", ar: "، و{n} أخرى", ku: "، و {n}ی تر" },
        checks_heading: { en: "Recommended before you publish", ar: "توصيات قبل النشر", ku: "پێشنیارەکان پێش بڵاوکردنەوە" },
        cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوەوە" },
        // Publish is never actually blocked by health (the merchant stays in
        // control), so the chip must read as advice — not prohibition.
        blocks_chip: { en: "Blocks", ar: "يمنع النشر", ku: "ڕێگری لە بڵاوکردنەوە دەکات" },
        warn_chip: { en: "Recommended", ar: "ننصح بإصلاحه", ku: "پێشنیار دەکرێت" },
        diff_heading: { en: "Changes since last publish", ar: "التغييرات منذ آخر نشر", ku: "گۆڕانکارییەکان لە دوایین بڵاوکردنەوەوە" },
        diff_first_publish: { en: "First publish — everything is new.", ar: "أول نشر — كل شيء جديد.", ku: "یەکەم بڵاوکردنەوە — هەموو شتێک نوێیە." },
        diff_no_changes: { en: "No content changes — config matches what's already live.", ar: "لا توجد تغييرات — الإعدادات مطابقة لما هو منشور.", ku: "هیچ گۆڕانکارییەک نییە — ڕێکخستنەکان لەگەڵ ئەوەی بڵاوکراوەتەوە یەکدەگرنەوە." },
        diff_brand_kit: { en: "Brand kit", ar: "هوية العلامة", ku: "کیتی برێند" },
        diff_brand_kit_desc: { en: "— colors / fonts / shape updated", ar: "— تحديث الألوان / الخطوط / الشكل", ku: "— ڕەنگ / فۆنت / شێوە نوێکرانەوە" },
        // tFormat: {n}
        diff_change_count_one: { en: "— 1 change", ar: "— تغيير واحد", ku: "— گۆڕانکارییەک" },
        diff_change_count_many: { en: "— {n} changes", ar: "— {n} تغييرات", ku: "— {n} گۆڕانکاری" },
        disabled_no_changes: { en: "Nothing to publish — make a change first.", ar: "لا شيء للنشر — قم بإجراء تغيير أولاً.", ku: "هیچ شت بۆ بڵاوکردنەوە نییە — سەرەتا گۆڕانکارییەک بکە." },
        failed: { en: "Publish failed — please try again.", ar: "فشل النشر — يرجى المحاولة مرة أخرى.", ku: "بڵاوکردنەوە سەرنەکەوت — تکایە دووبارە هەوڵبدەرەوە." },
        retry: { en: "Retry publish", ar: "إعادة المحاولة", ku: "دووبارە هەوڵبدەرەوە" },
        conflict_message: { en: "Someone else published changes since you opened the editor. Reload to get the latest before publishing again — your draft is kept.", ar: "قام شخص آخر بنشر تغييرات منذ فتحك المحرر. أعد التحميل للحصول على الأحدث قبل النشر مجدداً — مسودتك محفوظة.", ku: "کەسێکی تر گۆڕانکاری بڵاوکردەوە لەو کاتەوەی دەستکاریکەرەکەت کردەوە. دووبارە باری بکەرەوە بۆ وەرگرتنی نوێترین پێش بڵاوکردنەوە — ڕەشنووسەکەت پارێزراوە." },
        conflict_reload: { en: "Reload", ar: "إعادة التحميل", ku: "دووبارە بارکردنەوە" },
        // Post-publish success dialog — the peak moment. Celebrate + hand
        // over the live link.
        success_title: { en: "Your store is live! 🎉", ar: "متجرك صار مباشراً! 🎉", ku: "فرۆشگاکەت بڵاوبووەوە! 🎉" },
        success_subtitle: { en: "Share the link with your customers — orders can start right now.", ar: "شارك الرابط مع زبائنك — تكدر تستقبل الطلبات من الآن.", ku: "بەستەرەکە لەگەڵ کڕیارەکانت هاوبەش بکە — لە ئێستاوە داواکاری وەربگرە." },
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
        saved_days: { en: "Saved {n}d ago", ar: "تم الحفظ منذ {n} يوم", ku: "{n} ڕۆژ لەمەوبەر خەزنکرا" },
        saved_pulse: { en: "Saved", ar: "تم الحفظ", ku: "خەزنکرا" },
        // Shown before the first save of the session. Deliberately calm —
        // "changes save automatically" reassures instead of alarming.
        not_saved_yet: { en: "Autosaves as you edit", ar: "يُحفظ تلقائياً أثناء التعديل", ku: "بە خۆکار خەزن دەکرێت لە کاتی دەستکاری" },
        error: { en: "Save failed", ar: "فشل الحفظ", ku: "خەزنکردن سەرکەوتوو نەبوو" },
        retry: { en: "Retry save", ar: "إعادة محاولة الحفظ", ku: "دووبارە هەوڵبدەرەوە بۆ خەزنکردن" },
        retry_hint: { en: "Click to try saving again.", ar: "اضغط لمحاولة الحفظ مرة أخرى.", ku: "کلیک بکە بۆ هەوڵدانەوەی خەزنکردن." },
    },

    /* ── Brand kit — theme gallery ────────────────────────────── */
    brand_kit: {
        themes_title: { en: "Ready-made looks", ar: "إطلالات جاهزة", ku: "ڕووخسارە ئامادەکان" },
        themes_hint: { en: "One tap applies colors, fonts and shape together — you can fine-tune everything after.", ar: "ضغطة واحدة تطبّق الألوان والخطوط والشكل معاً — وتكدر تعدّل كل شيء بعدها.", ku: "یەک کرتە ڕەنگ و فۆنت و شێوە پێکەوە جێبەجێ دەکات — دواتر دەتوانی هەموو شتێک ورد بکەیت." },
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
        reset: { en: "Reset", ar: "إعادة تعيين", ku: "ڕێکخستنەوە" },
        // Field labels
        field_store_name: { en: "Store name", ar: "اسم المتجر", ku: "ناوی فرۆشگا" },
        field_tagline: { en: "Tagline", ar: "الشعار النصي", ku: "دروشم" },
        field_logo: { en: "Logo", ar: "الشعار", ku: "لۆگۆ" },
        field_favicon: { en: "Favicon", ar: "أيقونة الموقع", ku: "ئایکۆنی ماڵپەڕ" },
        field_og_image: { en: "OG image", ar: "صورة المشاركة", ku: "وێنەی هاوبەشکردن" },
        field_display_font: { en: "Display font", ar: "خط العناوين", ku: "فۆنتی ناونیشانەکان" },
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
        help_tagline: { en: "Falls back to English if a locale is empty.", ar: "يُعرض بالإنجليزية إذا كانت اللغة فارغة.", ku: "دەگەڕێتەوە بۆ ئینگلیزی ئەگەر زمانێک بەتاڵ بێت." },
        help_logo: { en: "PNG or SVG. Max 2MB. Appears in header + on receipts.", ar: "PNG أو SVG. بحد أقصى 2MB. يظهر في الترويسة وعلى الفواتير.", ku: "PNG یان SVG. زۆرترین 2MB. لە سەرپەڕە و لەسەر پسوولەکان دەردەکەوێت." },
        help_favicon: { en: "32×32 PNG or ICO. Max 512KB.", ar: "PNG أو ICO بمقاس 32×32. بحد أقصى 512KB.", ku: "PNG یان ICO بە قەبارەی 32×32. زۆرترین 512KB." },
        help_og_image: { en: "1200×630 JPG/PNG. Used when your store is shared on social.", ar: "JPG/PNG بمقاس 1200×630. تُستخدم عند مشاركة متجرك على وسائل التواصل.", ku: "JPG/PNG بە قەبارەی 1200×630. بەکاردێت کاتێک فرۆشگاکەت لە سۆشیال میدیا هاوبەش دەکرێت." },
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
        contrast_ink_surface: { en: "Ink on surface", ar: "الحبر على الخلفية", ku: "مەرەکەب لەسەر ڕووکار" },
        contrast_primary_ink: { en: "Primary on ink", ar: "الأساسي على الحبر", ku: "سەرەکی لەسەر مەرەکەب" },
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
    order_status: {
        title: { en: "Order tracking messages", ar: "رسائل تتبّع الطلب", ku: "پەیامەکانی شوێنکەوتنی داواکاری" },
        close: { en: "Close order tracking messages", ar: "إغلاق رسائل التتبّع", ku: "داخستنی پەیامەکان" },
        intro: {
            en: "What a shopper reads when they look up their order, stage by stage. Leave a field blank to keep the built-in line. Write {contact} anywhere and your store's contact number is filled in — if no number is set, that sentence is left out rather than shown with a hole.",
            ar: "شنو يقرأ الزبون لما يتابع طلبه، مرحلة بمرحلة. خلّي الحقل فارغ حتى يبقى النص الجاهز. اكتب {contact} بأي مكان وينحط رقم تواصل متجرك — إذا ماكو رقم، الجملة ما تنعرض بدل ما تطلع ناقصة.",
            ku: "ئەوەی کڕیار دەیخوێنێتەوە کاتێک داواکارییەکەی دەگەڕێت، قۆناغ بە قۆناغ. خانەکە بەتاڵ بهێڵەرەوە بۆ پاراستنی دەقی ئامادە. {contact} بنووسە و ژمارەی پەیوەندی فرۆشگاکەت دادەنرێت.",
        },
        no_contact: {
            en: "No contact number is set for this store, so every line that mentions {contact} — and every WhatsApp or call button — is hidden until you add one in your business settings.",
            ar: "ماكو رقم تواصل محدد للمتجر، فكل جملة فيها {contact} — وكل زر واتساب أو اتصال — تبقى مخفية لحد ما تضيف رقم بإعدادات المتجر.",
            ku: "هیچ ژمارەیەکی پەیوەندی بۆ ئەم فرۆشگایە دانەنراوە، بۆیە هەموو دێڕێک کە {contact} تێدایە شاراوە دەبێت.",
        },
        off_path: { en: "Exception", ar: "حالة استثنائية", ku: "حاڵەتی تایبەت" },
        edited: { en: "Edited", ar: "معدّل", ku: "دەستکاریکراو" },
        field_title: { en: "Headline", ar: "العنوان", ku: "سەردێڕ" },
        field_body: { en: "What is happening", ar: "شنو صاير", ku: "چی ڕوودەدات" },
        field_next: { en: "What happens next", ar: "شنو الخطوة الجاية", ku: "دواتر چی دەبێت" },
        contact_hint: { en: "{contact} becomes your store's contact number.", ar: "{contact} يصير رقم تواصل متجرك.", ku: "{contact} دەبێتە ژمارەی پەیوەندی فرۆشگاکەت." },
        field_cta: { en: "Button", ar: "الزر", ku: "دوگمە" },
        field_cta_label: { en: "Button text", ar: "نص الزر", ku: "دەقی دوگمە" },
        cta_default: { en: "Built-in button", ar: "الزر الجاهز", ku: "دوگمەی ئامادە" },
        cta_none: { en: "No button", ar: "بدون زر", ku: "بێ دوگمە" },
        cta_whatsapp: { en: "Message us on WhatsApp", ar: "راسلنا على واتساب", ku: "لە واتسئاپ پەیاممان بۆ بنێرە" },
        cta_phone: { en: "Call us", ar: "اتصل بينا", ku: "پەیوەندیمان پێوە بکە" },
        cta_link: { en: "Open a page", ar: "افتح صفحة", ku: "پەڕەیەک بکەرەوە" },
        cta_review: { en: "Rate the order", ar: "قيّم الطلب", ku: "داواکارییەکە هەڵسەنگێنە" },
        cta_reorder: { en: "Order again", ar: "اطلب مرة ثانية", ku: "دووبارە داوا بکە" },
        reset: { en: "Back to the built-in text", ar: "رجّع النص الجاهز", ku: "گەڕانەوە بۆ دەقی ئامادە" },
        history_edit: { en: "Edited order tracking messages", ar: "تعديل رسائل التتبّع", ku: "دەستکاریکردنی پەیامەکان" },
        history_reset: { en: "Reset an order tracking message", ar: "إرجاع رسالة تتبّع", ku: "گەڕاندنەوەی پەیامێک" },
        stage_placed: { en: "Order received", ar: "الطلب وصل", ku: "داواکاری گەیشت" },
        stage_awaiting_confirmation: { en: "Waiting for the customer to confirm", ar: "بانتظار تأكيد الزبون", ku: "چاوەڕوانی پشتڕاستکردنەوەی کڕیار" },
        stage_confirmed: { en: "Confirmed", ar: "مؤكد", ku: "پشتڕاستکراوە" },
        stage_shipped: { en: "With the courier", ar: "مع المندوب", ku: "لەگەڵ گەیەنەر" },
        stage_delivered: { en: "Delivered", ar: "تم التسليم", ku: "گەیەنرا" },
        stage_no_response: { en: "Customer not answering", ar: "الزبون ما يرد", ku: "کڕیار وەڵام نادات" },
        stage_on_hold: { en: "On hold", ar: "متوقف مؤقتاً", ku: "ڕاگیراوە" },
        stage_cancelled: { en: "Cancelled", ar: "ملغي", ku: "هەڵوەشێنرایەوە" },
        stage_returning: { en: "Coming back to you", ar: "راجع", ku: "دەگەڕێتەوە" },
        stage_refunded: { en: "Refunded", ar: "مسترجع المبلغ", ku: "پارە گەڕێنرایەوە" },
    },
    picker: {
        choose_product: { en: "Choose a product", ar: "اختر منتج", ku: "بەرهەمێک هەڵبژێرە" },
        choose_products: { en: "Choose products", ar: "اختر المنتجات", ku: "بەرهەمەکان هەڵبژێرە" },
        choose_category: { en: "Choose a category", ar: "اختر قسم", ku: "بەشێک هەڵبژێرە" },
        choose_attribute: { en: "Choose an attribute", ar: "اختر خاصية", ku: "تایبەتمەندییەک هەڵبژێرە" },
        choose_attributes: { en: "Choose attributes", ar: "اختر الخصائص", ku: "تایبەتمەندییەکان هەڵبژێرە" },
        choose_categories: { en: "Choose categories", ar: "اختر الأقسام", ku: "بەشەکان هەڵبژێرە" },
        search: { en: "Search", ar: "بحث", ku: "گەڕان" },
        none_selected: { en: "Nothing chosen", ar: "ما مختار شي", ku: "هیچ هەڵنەبژێردراوە" },
        no_results: { en: "Nothing matches that", ar: "ماكو نتائج", ku: "هیچ نەدۆزرایەوە" },
        hidden_product: { en: "Hidden from the store", ar: "مخفي من المتجر", ku: "شاراوەیە لە فرۆشگا" },
        missing: { en: "No longer exists", ar: "ما عاد موجود", ku: "چیتر نییە" },
        link_to: { en: "Links to", ar: "يروح إلى", ku: "دەچێتە" },
        target_page: { en: "A store page", ar: "صفحة بالمتجر", ku: "پەڕەیەکی فرۆشگا" },
        target_category: { en: "A category", ar: "قسم", ku: "بەشێک" },
        target_product: { en: "A product", ar: "منتج", ku: "بەرهەمێک" },
        target_external: { en: "A web address", ar: "رابط خارجي", ku: "بەستەرێکی دەرەکی" },
        external_placeholder: { en: "https://…", ar: "https://…", ku: "https://…" },
        stored_as: { en: "Saved as", ar: "ينحفظ كـ", ku: "پاشەکەوت دەکرێت وەک" },
        page_home: { en: "Home", ar: "الرئيسية", ku: "سەرەکی" },
        page_products: { en: "All products", ar: "كل المنتجات", ku: "هەموو بەرهەمەکان" },
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
        set: { en: "Set", ar: "تعيين", ku: "دانان" },
        clear: { en: "Clear", ar: "مسح", ku: "سڕینەوە" },
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
        upload_image: { en: "Upload image", ar: "رفع صورة", ku: "بارکردنی وێنە" },
        uploading: { en: "Uploading…", ar: "جاري الرفع…", ku: "باردەکرێت…" },
        image_url_placeholder: { en: "https://… or paste an image URL", ar: "https://… أو الصق رابط صورة", ku: "https://… یان بەستەری وێنەیەک دابنێ" },
        // tFormat: {label}
        unsupported_field: { en: "Unsupported field: {label}", ar: "حقل غير مدعوم: {label}", ku: "خانەی پشتگیرینەکراو: {label}" },
        // Breakpoint override editor chrome. tFormat: {bp}
        bp_override_label: { en: "{bp} override", ar: "تخصيص {bp}", ku: "دەستکاری {bp}" },
        bp_use_base: { en: "Use base value", ar: "استخدم القيمة الأساسية", ku: "بەهای بنەڕەت بەکاربهێنە" },
        bp_unavailable: { en: "Override unavailable for this field type.", ar: "التخصيص غير متاح لهذا النوع من الحقول.", ku: "دەستکاری بەردەست نییە بۆ ئەم جۆرە خانەیە." },
        // tFormat: {min} {max} — numeric bound hints
        range_hint: { en: "Range: {min}–{max}", ar: "النطاق: {min}–{max}", ku: "مەودا: {min}–{max}" },
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
    },

    /* ── Simple ⇄ Advanced editor mode ────────────────────────── */
    mode: {
        group_aria: { en: "Editor mode", ar: "وضع المحرر", ku: "دۆخی دەستکاریکەر" },
        simple: { en: "Simple", ar: "بسيط", ku: "سادە" },
        advanced: { en: "Advanced", ar: "متقدّم", ku: "پێشکەوتوو" },
        // One-time intro shown on the first switch to Advanced.
        intro_title: { en: "Advanced mode", ar: "الوضع المتقدّم", ku: "دۆخی پێشکەوتوو" },
        intro_body: { en: "Advanced shows every option: translations, versions, per-device tweaks, visibility rules and more. Switch back to Simple anytime.", ar: "الوضع المتقدّم يعرض كل الخيارات: الترجمات، النسخ، تخصيص لكل جهاز، قواعد الظهور وأكثر. تكدر ترجع لـ«بسيط» بأي وقت.", ku: "دۆخی پێشکەوتوو هەموو هەڵبژاردنەکان پیشان دەدات: وەرگێڕانەکان، وەشانەکان، دەستکاری بۆ هەر ئامێرێک، ڕێساکانی دەرکەوتن و زیاتر. هەر کاتێک دەتوانی بگەڕێیتەوە بۆ «سادە»." },
        intro_dismiss: { en: "Got it", ar: "فهمت", ku: "تێگەیشتم" },
        // Toast shown when a deep link forces Advanced for this visit.
        elevated_for_link: { en: "Opened Advanced mode for this screen.", ar: "فتحنا الوضع المتقدّم لهذه الشاشة.", ku: "دۆخی پێشکەوتوو کرایەوە بۆ ئەم پەردەیە." },
        // Chips shown in Simple when hidden-but-live data exists.
        // tFormat: {n}
        live_rules_chip: { en: "{n} active rules — open Advanced", ar: "{n} قواعد مفعّلة — افتح المتقدّم", ku: "{n} ڕێسای چالاک — پێشکەوتوو بکەرەوە" },
        live_versions_chip: { en: "{n} active versions — open Advanced", ar: "{n} نسخ مفعّلة — افتح المتقدّم", ku: "{n} وەشانی چالاک — پێشکەوتوو بکەرەوە" },
        more_options: { en: "More options? Advanced mode", ar: "خيارات أكثر؟ الوضع المتقدّم", ku: "هەڵبژاردنی زیاتر؟ دۆخی پێشکەوتوو" },
    },

    /* ── I18nStringInput (per-field translation tuck-away) ────── */
    i18n_input: {
        // tFormat: {state} e.g. "EN ✓ · KU –"
        translations_toggle: { en: "Translations ({state})", ar: "الترجمات ({state})", ku: "وەرگێڕانەکان ({state})" },
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
        tab_blocks: { en: "Blocks", ar: "العناصر", ku: "بەشەکان" },
        tab_style: { en: "Style", ar: "الهوية", ku: "شێواز" },
        tab_seo: { en: "SEO", ar: "SEO", ku: "SEO" },
        tab_health: { en: "Health", ar: "الجاهزية", ku: "ئامادەیی" },
        // Style tab routes to the full-screen Brand Kit — the full editor
        // is a two-pane layout that cannot fit in the 380px rail.
        style_card_title: { en: "Style & branding", ar: "هوية العلامة", ku: "کیتی برێند" },
        style_card_desc: { en: "Colors, logo, fonts and the overall look of your store — edited in one place with a live preview.", ar: "الألوان والشعار والخطوط والمظهر العام لمتجرك — تُعدّل في مكان واحد مع معاينة حية.", ku: "ڕەنگەکان، لۆگۆ، فۆنتەکان و ڕووخساری گشتی فرۆشگاکەت — لە یەک شوێندا دەستکاری دەکرێن لەگەڵ پێشبینینی ڕاستەوخۆ." },
        style_card_button: { en: "Open Style & branding", ar: "افتح هوية العلامة", ku: "کیتی برێند بکەرەوە" },
    },

    /* ── Top toolbar chrome ───────────────────────────────────── */
    toolbar: {
        back_to_hub: { en: "Back to store builder", ar: "العودة إلى مركز المتجر", ku: "گەڕانەوە بۆ ناوەندی فرۆشگا" },
        subtitle: { en: "Store builder", ar: "منشئ المتجر", ku: "دروستکەری فرۆشگا" },
        breakpoint_group: { en: "Preview breakpoint", ar: "حجم المعاينة", ku: "قەبارەی پێشبینین" },
        breakpoint_mobile: { en: "Mobile", ar: "هاتف", ku: "مۆبایل" },
        breakpoint_tablet: { en: "Tablet", ar: "لوحي", ku: "تابلێت" },
        breakpoint_desktop: { en: "Desktop", ar: "حاسوب", ku: "کۆمپیوتەر" },
        locale_select: { en: "Preview language", ar: "لغة المعاينة", ku: "زمانی پێشبینین" },
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
        // tFormat: {n}
        time_minutes: { en: "{n} min ago", ar: "قبل {n} دقيقة", ku: "{n} خولەک لەمەوبەر" },
        time_hours: { en: "{n} h ago", ar: "قبل {n} ساعة", ku: "{n} کاتژمێر لەمەوبەر" },
        time_days: { en: "{n} days ago", ar: "قبل {n} يوم", ku: "{n} ڕۆژ لەمەوبەر" },
    },

    /* ── Post-wizard welcome (one-time overlay) ───────────────── */
    welcome: {
        title: { en: "Your store is ready! 🎉", ar: "متجرك جاهز! 🎉", ku: "فرۆشگاکەت ئامادەیە! 🎉" },
        subtitle: { en: "We built it from your answers — here's all you need to know:", ar: "بنيناه من إجاباتك — هذا كل اللي تحتاج تعرفه:", ku: "لە وەڵامەکانتەوە دروستمان کرد — ئەمە هەموو ئەوەیە کە پێویستە بیزانیت:" },
        bullet_edit: { en: "Click any text or image on the page to edit it.", ar: "اضغط على أي نص أو صورة بالصفحة لتعديلها.", ku: "کلیک لە هەر دەق یان وێنەیەک بکە لە پەڕەکە بۆ دەستکاری." },
        bullet_autosave: { en: "Everything saves automatically as you work.", ar: "كل شيء يُحفظ تلقائياً وأنت تشتغل.", ku: "هەموو شتێک بە خۆکار خەزن دەبێت کاتێک کاردەکەیت." },
        bullet_publish: { en: "Hit Publish whenever you're ready — you can keep editing after.", ar: "اضغط «نشر» وقت ما تكون جاهز — وتكدر تكمل التعديل بعدها.", ku: "«بڵاوکردنەوە» دابگرە هەر کاتێک ئامادەبوویت — دواتریش دەتوانی بەردەوام بیت لە دەستکاری." },
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
        blocks_publish_chip: { en: "Blocks publish", ar: "يحظر النشر", ku: "ڕێگری لە بڵاوکردنەوە دەکات" },
        close: { en: "Close health screen", ar: "إغلاق شاشة الصحة", ku: "داخستنی پەردەی تەندروستی" },
        filter_all: { en: "all", ar: "الكل", ku: "هەموو" },
        filter_failing: { en: "Failing + Warn", ar: "فشل + تحذير", ku: "شکست + ئاگاداری" },
        filter_warn: { en: "warn", ar: "تحذير", ku: "ئاگاداری" },
        filter_passing: { en: "passing", ar: "ناجح", ku: "سەرکەوتوو" },
        // tFormat: {visible} {total}
        checks_count: { en: "{visible} of {total} checks", ar: "{visible} من {total} فحوصات", ku: "{visible} لە {total} پشکنین" },
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
        launch_all_done: { en: "All set — your store is live! 🎉", ar: "كل شيء تمام — متجرك مباشر! 🎉", ku: "هەموو شت تەواوە — فرۆشگاکەت بڵاوە! 🎉" },
    },

    /* ── Page SEO panel ───────────────────────────────────────── */
    seo: {
        // tFormat: {page}
        heading: { en: "Page SEO — {page}", ar: "سيو الصفحة — {page}", ku: "SEO ی پەڕە — {page}" },
        subtitle: { en: "How this page appears in Google and when it's shared.", ar: "كيف تظهر هذه الصفحة في جوجل وعند مشاركتها.", ku: "ئەم پەڕەیە چۆن لە گووگڵ و لە کاتی هاوبەشکردندا دەردەکەوێت." },
        serp_preview: { en: "Search preview", ar: "معاينة البحث", ku: "پێشبینینی گەڕان" },
        title_label: { en: "Meta title", ar: "عنوان الميتا", ku: "ناونیشانی مێتا" },
        title_help: { en: "~60 characters. The blue headline in search results.", ar: "~60 حرفاً. العنوان الأزرق في نتائج البحث.", ku: "~٦٠ پیت. ناونیشانە شینەکە لە ئەنجامەکانی گەڕاندا." },
        description_label: { en: "Meta description", ar: "وصف الميتا", ku: "وەسفی مێتا" },
        description_help: { en: "~155 characters. The gray snippet under the title.", ar: "~155 حرفاً. المقتطف الرمادي تحت العنوان.", ku: "~١٥٥ پیت. پارچە دەقە خۆڵەمێشییەکەی ژێر ناونیشانەکە." },
        description_fallback: { en: "Add a description so Google doesn't generate its own.", ar: "أضف وصفاً حتى لا يولّد جوجل وصفاً من عنده.", ku: "وەسفێک زیاد بکە بۆ ئەوەی گووگڵ خۆی وەسف دروست نەکات." },
        og_label: { en: "Social share image", ar: "صورة المشاركة الاجتماعية", ku: "وێنەی هاوبەشکردنی سۆشیال" },
        og_help: { en: "1200×630 recommended. Shown when the page is shared on WhatsApp or social. Falls back to your store's brand-kit image.", ar: "يُنصح بمقاس 1200×630. تظهر عند مشاركة الصفحة على واتساب أو وسائل التواصل. تُستخدم صورة هوية العلامة إن لم تُحدَّد.", ku: "قەبارەی 1200×630 پێشنیار دەکرێت. دەردەکەوێت کاتێک پەڕەکە لە واتساپ یان سۆشیال میدیا هاوبەش دەکرێت. ئەگەر دانەنرێت وێنەی کیتی برێند بەکاردێت." },
        noindex_label: { en: "Hide from search engines", ar: "إخفاء عن محركات البحث", ku: "شاردنەوە لە بزوێنەرەکانی گەڕان" },
        // Rendered around an inline <code>noindex</code> element:
        // "{prefix} <code>noindex</code> {suffix}"
        noindex_help_prefix: { en: "Adds", ar: "يضيف وسم", ku: "تاگی" },
        noindex_help_suffix: { en: "— Google won't list this page.", ar: "— لن يعرض جوجل هذه الصفحة.", ku: "زیاد دەکات — گووگڵ ئەم پەڕەیە پیشان نادات." },
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
    brand_kit_body: {
        // Identity
        tagline_placeholder: { en: "A short line that describes your store", ar: "سطر قصير يصف متجرك", ku: "دێڕێکی کورت کە فرۆشگاکەت وەسف دەکات" },
        // Color swatch labels
        color_primary: { en: "Primary", ar: "الأساسي", ku: "سەرەکی" },
        color_secondary: { en: "Secondary", ar: "الثانوي", ku: "لاوەکی" },
        color_accent: { en: "Accent", ar: "المميّز", ku: "جیاکەرەوە" },
        color_surface: { en: "Surface", ar: "الخلفية", ku: "ڕووکار" },
        color_surface_alt: { en: "Surface alt", ar: "الخلفية البديلة", ku: "ڕووکاری لاوەکی" },
        color_ink: { en: "Ink", ar: "الحبر", ku: "مەرەکەب" },
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

        /* KPI strip */
        kpi_orders: { en: "Orders", ar: "الطلبات", ku: "داواکارییەکان" },
        kpi_revenue: { en: "Revenue", ar: "الإيرادات", ku: "داهات" },
        kpi_aov: { en: "Avg. order value", ar: "متوسط قيمة الطلب", ku: "ناوەندی بەهای داواکاری" },
        kpi_last_7_days: { en: "Last 7 days", ar: "آخر 7 أيام", ku: "٧ ڕۆژی ڕابردوو" },
        kpi_no_orders_yet: { en: "No orders yet", ar: "لا توجد طلبات بعد", ku: "هێشتا داواکاری نییە" },

        /* Health card */
        health_heading: { en: "Store health", ar: "صحة المتجر", ku: "تەندروستی فرۆشگا" },
        health_new_store_heading: { en: "Finish setting up your store", ar: "أكمل إعداد متجرك", ku: "ڕێکخستنی فرۆشگاکەت تەواو بکە" },
        health_new_store_body: { en: "Your store doesn't have any content yet. Open the editor to add sections and build out your home page — your store health score will appear once you've started.", ar: "متجرك لا يحتوي على أي محتوى بعد. افتح المحرّر لإضافة الأقسام وبناء صفحتك الرئيسية — ستظهر درجة صحة متجرك بمجرد أن تبدأ.", ku: "فرۆشگاکەت هێشتا هیچ ناوەڕۆکێکی نییە. دەستکاریکەر بکەرەوە بۆ زیادکردنی بەشەکان و دروستکردنی پەڕەی سەرەکی — خاڵی تەندروستی فرۆشگاکەت دەردەکەوێت هەر کە دەستت پێکرد." },
        health_get_started: { en: "Get started", ar: "ابدأ الآن", ku: "دەست پێبکە" },
        health_score_needs_attention: { en: "Needs attention", ar: "يحتاج انتباهاً", ku: "پێویستی بە سەرنجە" },
        health_score_getting_there: { en: "Getting there", ar: "في الطريق الصحيح", ku: "بەرەو باشتر دەچێت" },
        health_score_looking_good: { en: "Looking good", ar: "يبدو جيداً", ku: "باش دیارە" },
        health_score_launch_ready: { en: "Launch-ready", ar: "جاهز للإطلاق", ku: "ئامادەیە بۆ دەستپێک" },
        health_all_passing_detail: { en: "All checks passing — store is launch-ready.", ar: "جميع الفحوصات ناجحة — المتجر جاهز للإطلاق.", ku: "هەموو پشکنینەکان سەرکەوتوون — فرۆشگا ئامادەیە بۆ دەستپێک." },
        // tFormat: {n}
        health_items_to_address_one: { en: "{n} item to address before launch.", ar: "{n} عنصر يجب معالجته قبل الإطلاق.", ku: "{n} بابەت هەیە پێویستە پێش دەستپێکردن چارەسەر بکرێت." },
        health_items_to_address_other: { en: "{n} items to address before launch.", ar: "{n} عناصر يجب معالجتها قبل الإطلاق.", ku: "{n} بابەت هەیە پێویستە پێش دەستپێکردن چارەسەر بکرێن." },
        health_fix: { en: "Fix", ar: "إصلاح", ku: "چاککردن" },
        health_all_passing: { en: "All checks passing", ar: "جميع الفحوصات ناجحة", ku: "هەموو پشکنینەکان سەرکەوتوون" },
        health_full_checklist: { en: "Full checklist in editor", ar: "القائمة الكاملة في المحرّر", ku: "لیستی تەواو لە دەستکاریکەردا" },

        /* Pages card */
        pages_heading: { en: "Pages", ar: "الصفحات", ku: "پەڕەکان" },
        // tFormat: {n}
        pages_count: { en: "{n} pages", ar: "{n} صفحة", ku: "{n} پەڕە" },
        pages_section_count_one: { en: "{n} section", ar: "{n} قسم", ku: "{n} بەش" },
        pages_section_count_other: { en: "{n} sections", ar: "{n} أقسام", ku: "{n} بەش" },
        pages_empty: { en: "No pages configured. Open the editor to start.", ar: "لا توجد صفحات مُعدّة. افتح المحرّر للبدء.", ku: "هیچ پەڕەیەک ڕێکنەخراوە. دەستکاریکەر بکەرەوە بۆ دەستپێکردن." },
        pages_edit: { en: "Edit", ar: "تعديل", ku: "دەستکاری" },
        // Page labels — hub wording, deliberately fuller than the page-tree rail.
        page_home: { en: "Home", ar: "الرئيسية", ku: "ماڵەوە" },
        page_category: { en: "Category", ar: "الفئة", ku: "پۆل" },
        page_product: { en: "Product page", ar: "صفحة المنتج", ku: "پەڕەی بەرهەم" },
        page_search: { en: "Search", ar: "البحث", ku: "گەڕان" },
        page_cart: { en: "Cart", ar: "السلة", ku: "سەبەتە" },
        page_checkout: { en: "Checkout", ar: "الدفع", ku: "پارەدان" },
        page_checkout_success: { en: "Order confirmed", ar: "تأكيد الطلب", ku: "داواکاری پشتڕاستکرایەوە" },
        page_track: { en: "Track order", ar: "تتبع الطلب", ku: "بەدواداچوونی داواکاری" },
        page_about: { en: "About", ar: "حول", ku: "دەربارە" },
        page_faq: { en: "FAQ", ar: "الأسئلة الشائعة", ku: "پرسیارە باوەکان" },
        page_contact: { en: "Contact", ar: "اتصل بنا", ku: "پەیوەندی" },
        page_policy_shipping: { en: "Shipping policy", ar: "سياسة الشحن", ku: "سیاسەتی گەیاندن" },
        page_policy_returns: { en: "Returns policy", ar: "سياسة الإرجاع", ku: "سیاسەتی گەڕاندنەوە" },
        page_policy_privacy: { en: "Privacy policy", ar: "سياسة الخصوصية", ku: "سیاسەتی تایبەتمەندێتی" },
        page_policy_terms: { en: "Terms of service", ar: "شروط الخدمة", ku: "مەرجەکانی خزمەتگوزاری" },
        page_not_found: { en: "404 page", ar: "صفحة 404", ku: "پەڕەی 404" },

        /* Quick-settings tiles */
        quick_settings: { en: "Quick settings", ar: "إعدادات سريعة", ku: "ڕێکخستنە خێراکان" },
        tile_brand_label: { en: "Brand & theme", ar: "الهوية والمظهر", ku: "برێند و ڕووکار" },
        tile_brand_desc: { en: "Logo, colors, fonts, shapes", ar: "الشعار والألوان والخطوط والأشكال", ku: "لۆگۆ، ڕەنگ، فۆنت، شێوە" },
        tile_languages_label: { en: "Languages", ar: "اللغات", ku: "زمانەکان" },
        tile_languages_desc: { en: "Arabic, English, Kurdish", ar: "العربية والإنجليزية والكردية", ku: "عەرەبی، ئینگلیزی، کوردی" },
        tile_seo_label: { en: "SEO", ar: "SEO", ku: "SEO" },
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
        domain_toast_verify_failed: { en: "Verification failed", ar: "فشل التحقق", ku: "پشتڕاستکردنەوە سەرکەوتوو نەبوو" },
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
        adv_field_name: { en: "Name", ar: "الاسم", ku: "ناو" },
        adv_close: { en: "Close", ar: "إغلاق", ku: "داخستن" },
        adv_cancel: { en: "Cancel", ar: "إلغاء", ku: "پاشگەزبوونەوە" },
        adv_refresh: { en: "Refresh", ar: "تحديث", ku: "نوێکردنەوە" },
        adv_upcoming: { en: "Upcoming", ar: "قادم", ku: "داهاتوو" },
        adv_expired: { en: "Expired", ar: "منتهٍ", ku: "بەسەرچووە" },

        // Experiments screen
        exp_empty_title: { en: "No experiments yet", ar: "لا توجد تجارب بعد", ku: "هێشتا هیچ تاقیکردنەوەیەک نییە" },
        exp_empty_body: { en: "Run A/B tests against any section variant. Pick a primary metric, split traffic across arms, and promote the winner.", ar: "شغّل اختبارات A/B على أي نسخة من عنصر. اختر مقياساً أساسياً، قسّم الزوار على الأذرع، ثم رقّ الفائز.", ku: "تاقیکردنەوەی A/B لەسەر هەر وەشانێکی بەش ئەنجام بدە. پێوەرێکی سەرەکی هەڵبژێرە، سەردانیکەران دابەش بکە، پاشان براوە پلەی بەرز بکەرەوە." },
        exp_empty_new: { en: "Create your first experiment", ar: "أنشئ أول تجربة", ku: "یەکەم تاقیکردنەوەت دروست بکە" },
        exp_primary_metric_label: { en: "Primary metric:", ar: "المقياس الأساسي:", ku: "پێوەری سەرەکی:" },
        exp_traffic_split: { en: "Traffic split:", ar: "تقسيم الزوار:", ku: "دابەشکردنی سەردانیکەران:" },
        exp_stop_promote: { en: "Stop & promote winner", ar: "إيقاف وترقية الفائز", ku: "ڕاگرتن و بەرزکردنەوەی براوە" },
        exp_editor_title: { en: "Edit experiment", ar: "تعديل التجربة", ku: "دەستکاری تاقیکردنەوە" },
        exp_field_primary_metric: { en: "Primary metric", ar: "المقياس الأساسي", ku: "پێوەری سەرەکی" },
        exp_field_starts_at: { en: "Starts at", ar: "يبدأ في", ku: "دەستپێدەکات لە" },
        exp_field_ends_at: { en: "Ends at (optional)", ar: "ينتهي في (اختياري)", ku: "کۆتایی دێت لە (ئارەزوومەندانە)" },
        exp_arms: { en: "Arms", ar: "الأذرع", ku: "لقەکان" },
        exp_add_arm: { en: "Add arm", ar: "إضافة ذراع", ku: "زیادکردنی لق" },
        exp_delete_arm_aria: { en: "Delete arm", ar: "حذف الذراع", ku: "سڕینەوەی لق" },
        exp_total_traffic: { en: "Total traffic:", ar: "إجمالي الزوار:", ku: "کۆی سەردانیکەران:" },
        exp_traffic_sum_error: { en: "— must sum to 100", ar: "— يجب أن يساوي المجموع 100", ku: "— کۆکەرەوەکە دەبێت 100 بێت" },
        exp_field_status: { en: "Status", ar: "الحالة", ku: "دۆخ" },
        exp_stats_error: { en: "Failed to load stats", ar: "فشل تحميل الإحصائيات", ku: "بارکردنی ئامارەکان سەرکەوتوو نەبوو" },
        exp_no_data: { en: "No data yet.", ar: "لا توجد بيانات بعد.", ku: "هێشتا هیچ داتایەک نییە." },
        exp_control_badge: { en: "Control", ar: "الضابط", ku: "کۆنترۆڵ" },
        // tFormat: {n}
        exp_pct_traffic: { en: "{n}% traffic", ar: "{n}% من الزوار", ku: "{n}% سەردانیکەران" },
        exp_stat_atc: { en: "ATC", ar: "إضافة للسلة", ku: "بۆ سەبەتە" },
        exp_stat_checkout: { en: "Checkout", ar: "الدفع", ku: "پارەدان" },
        exp_stat_aov: { en: "AOV", ar: "متوسط الطلب", ku: "تێکڕای داواکاری" },
        exp_stat_uplift_control: { en: "Uplift vs control", ar: "التحسن مقابل الضابط", ku: "بەرزبوونەوە بەراورد بە کۆنترۆڵ" },
        exp_delete_refs_prefix: { en: "This experiment is referenced by", ar: "هذه التجربة مُشار إليها من", ku: "ئەم تاقیکردنەوەیە ئاماژەی پێدراوە لەلایەن" },
        exp_delete_refs_suffix_one: { en: "variant. Deleting it will leave those variants targeting a non-existent test. Proceed?", ar: "نسخة واحدة. حذفها سيترك تلك النسخ تستهدف اختباراً غير موجود. متابعة؟", ku: "وەشانێک. سڕینەوەی وا دەکات ئەو وەشانانە تاقیکردنەوەیەکی نەبوو ئامانج بکەن. بەردەوامبیت؟" },
        exp_delete_refs_suffix_many: { en: "variants. Deleting it will leave those variants targeting a non-existent test. Proceed?", ar: "نسخ. حذفها سيترك تلك النسخ تستهدف اختباراً غير موجود. متابعة؟", ku: "وەشان. سڕینەوەی وا دەکات ئەو وەشانانە تاقیکردنەوەیەکی نەبوو ئامانج بکەن. بەردەوامبیت؟" },
        exp_delete_body: { en: "This will remove the experiment from your store config.", ar: "سيؤدي هذا إلى إزالة التجربة من إعدادات متجرك.", ku: "ئەمە تاقیکردنەوەکە لە ڕێکخستنی فرۆشگاکەت لادەبات." },
        exp_delete_confirm: { en: "Delete experiment", ar: "حذف التجربة", ku: "سڕینەوەی تاقیکردنەوە" },

        // Empty states for the remaining advanced screens
        red_empty: { en: "No redirects yet — add your first", ar: "لا توجد عمليات إعادة توجيه بعد — أضف أولها", ku: "هێشتا هیچ ڕەوانەکردنەوەیەک نییە — یەکەمیان زیاد بکە" },
        bun_empty: { en: "No bundles yet — add your first", ar: "لا توجد حزم بعد — أضف أولها", ku: "هێشتا هیچ پاکێجێک نییە — یەکەمیان زیاد بکە" },
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
        seg_rule_count_one: { en: "{n} rule", ar: "{n} قاعدة", ku: "{n} ڕێسا" },
        seg_rule_count_many: { en: "{n} rules", ar: "{n} قواعد", ku: "{n} ڕێسا" },
        seg_visitors_label: { en: "Visitors:", ar: "الزوار:", ku: "سەردانیکەران:" },
        seg_select_to_edit: { en: "Select a segment to edit it.", ar: "اختر جمهوراً لتعديله.", ku: "بینەرێک هەڵبژێرە بۆ دەستکاریکردنی." },
        seg_edit_segment: { en: "Edit segment", ar: "تعديل الجمهور", ku: "دەستکاری بینەر" },
        seg_delete_segment: { en: "Delete segment", ar: "حذف الجمهور", ku: "سڕینەوەی بینەر" },
        seg_field_description: { en: "Description", ar: "الوصف", ku: "وەسف" },
        seg_field_combine: { en: "Combine logic", ar: "منطق الدمج", ku: "لۆژیکی تێکەڵکردن" },
        seg_match_all: { en: "Match ALL rules", ar: "مطابقة كل القواعد", ku: "هەموو ڕێساکان بگونجێنە" },
        seg_match_any: { en: "Match ANY rules", ar: "مطابقة أي قاعدة", ku: "هەر ڕێسایەک بگونجێنە" },
        seg_rules_heading: { en: "Rules", ar: "القواعد", ku: "ڕێساکان" },
        seg_add_rule: { en: "Add rule", ar: "إضافة قاعدة", ku: "زیادکردنی ڕێسا" },
        seg_rules_empty: { en: "No rules. Add one to start matching visitors.", ar: "لا توجد قواعد. أضف واحدة لبدء مطابقة الزوار.", ku: "هیچ ڕێسایەک نییە. یەکێک زیاد بکە بۆ دەستپێکردنی گونجاندنی سەردانیکەران." },
        seg_delete_rule_aria: { en: "Delete rule", ar: "حذف القاعدة", ku: "سڕینەوەی ڕێسا" },
        seg_within: { en: "Within", ar: "خلال", ku: "لە ماوەی" },
        seg_minutes_optional: { en: "minutes (optional)", ar: "دقيقة (اختياري)", ku: "خولەک (ئارەزوومەندانە)" },
        seg_no_config: { en: "No configuration.", ar: "لا إعدادات.", ku: "هیچ ڕێکخستنێک نییە." },
        seg_iqd: { en: "IQD", ar: "د.ع", ku: "دینار" },
        seg_inactive_for: { en: "Inactive for at least", ar: "غير نشط لمدة لا تقل عن", ku: "ناچالاک بۆ لانیکەم" },
        seg_minutes: { en: "minutes", ar: "دقيقة", ku: "خولەک" },
        seg_delete_refs_prefix: { en: "This segment is used by", ar: "هذا الجمهور مستخدم من قبل", ku: "ئەم بینەرە بەکارهاتووە لەلایەن" },
        seg_delete_refs_suffix_one: { en: "variant. Deleting it will leave those variants matching nothing. Proceed?", ar: "نسخة واحدة. حذفه سيترك تلك النسخ دون أي تطابق. متابعة؟", ku: "وەشانێک. سڕینەوەی وا دەکات ئەو وەشانانە هیچ نەگونجێنن. بەردەوامبیت؟" },
        seg_delete_refs_suffix_many: { en: "variants. Deleting it will leave those variants matching nothing. Proceed?", ar: "نسخ. حذفه سيترك تلك النسخ دون أي تطابق. متابعة؟", ku: "وەشان. سڕینەوەی وا دەکات ئەو وەشانانە هیچ نەگونجێنن. بەردەوامبیت؟" },
        seg_delete_body: { en: "This will remove the segment from your store config. Any variant that targets it will no longer match.", ar: "سيؤدي هذا إلى إزالة الجمهور من إعدادات متجرك. أي نسخة تستهدفه لن تتطابق بعد الآن.", ku: "ئەمە بینەرەکە لە ڕێکخستنی فرۆشگاکەت لادەبات. هەر وەشانێک ئامانجی بکات چیتر ناگونجێت." },

        // Scheduled-changes screen
        sched_subtitle: { en: "Time-windowed variants you've set up across your store.", ar: "اختلافات محدّدة زمنياً قمت بإعدادها في متجرك.", ku: "جیاوازییە کاتدارەکانی فرۆشگاکەت کە دایناون." },
        // tFormat: {when}
        sched_row_started: { en: "Started {when}", ar: "بدأ {when}", ku: "دەستیپێکرد {when}" },
        sched_row_ends: { en: "ends {when}", ar: "ينتهي {when}", ku: "کۆتایی دێت {when}" },
        sched_row_no_end: { en: "no end date", ar: "بدون تاريخ انتهاء", ku: "بەبێ بەرواری کۆتایی" },
        sched_row_starts: { en: "Starts {when}", ar: "يبدأ {when}", ku: "دەستپێدەکات {when}" },
        sched_row_ended: { en: "Ended {when}", ar: "انتهى {when}", ku: "کۆتایی هات {when}" },
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
        sched_label_placeholder: { en: "e.g. 'Black Friday hero swap'", ar: "مثال: 'تبديل بانر الجمعة السوداء'", ku: "نموونە: 'گۆڕینی هیرۆی هەینی ڕەش'" },
        sched_field_start: { en: "Start date / time", ar: "تاريخ / وقت البداية", ku: "بەروار / کاتی دەستپێک" },
        sched_field_end: { en: "End date / time (optional)", ar: "تاريخ / وقت الانتهاء (اختياري)", ku: "بەروار / کاتی کۆتایی (ئارەزوومەندانە)" },
        sched_field_timezone: { en: "Timezone", ar: "المنطقة الزمنية", ku: "ناوچەی کات" },
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
        sched_new_variant_placeholder: { en: "e.g. 'Black Friday'", ar: "مثال: 'الجمعة السوداء'", ku: "نموونە: 'هەینی ڕەش'" },
        sched_new_variant_hint: { en: "A `time_window` variant will be created in this section, wired to the schedule's start/end times.", ar: "ستُنشأ نسخة `time_window` في هذا القسم، مرتبطة بأوقات بداية/نهاية الجدولة.", ku: "وەشانێکی `time_window` لەم بەشەدا دروستدەکرێت، بەستراوە بە کاتەکانی دەستپێک/کۆتایی خشتەکە." },
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
        vh_by_author: { en: "by {name}", ar: "بواسطة {name}", ku: "لەلایەن {name}" },
        vh_restore_body_prefix: { en: "Restore", ar: "استرجاع", ku: "گەڕاندنەوەی" },
        // tFormat: {time}
        vh_restore_body_suffix: { en: "from {time}? This replaces your current draft. You can undo this in this session.", ar: "من {time}؟ سيستبدل هذا مسودتك الحالية. يمكنك التراجع خلال هذه الجلسة.", ku: "لە {time}؟ ئەمە ڕەشنووسی ئێستات دەگۆڕێت. دەتوانی لەم دانیشتنەدا پاشگەزبیتەوە." },
        vh_promote_body: { en: "Give this auto-save a memorable label so it doesn't get pruned.", ar: "أعطِ هذا الحفظ التلقائي اسماً لا يُنسى حتى لا يُحذف.", ku: "ناوێکی بیرهێنەرەوە بدە بەم خەزنە ئۆتۆماتیکە بۆ ئەوەی نەسڕدرێتەوە." },
        vh_diff_before: { en: "before:", ar: "قبل:", ku: "پێش:" },
        vh_diff_after: { en: "after:", ar: "بعد:", ku: "دوای:" },

        // Nav-builder screen
        nav_close_aria: { en: "Close navigation", ar: "إغلاق التنقل", ku: "داخستنی ناڤیگەیشن" },
        nav_heading: { en: "Navigation", ar: "التنقل", ku: "ناڤیگەیشن" },
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
        disc_intro: { en: "Create coupon codes customers enter at checkout. Percent codes take a share off the subtotal (optionally capped); fixed codes take a set amount (IQD). Both can require a minimum subtotal.", ar: "أنشئ أكواد قسائم يدخلها العملاء عند الدفع. أكواد النسبة تخصم حصة من الإجمالي الفرعي (مع حد أقصى اختياري)؛ والأكواد الثابتة تخصم مبلغاً محدداً (د.ع). كلاهما يمكن أن يتطلب حداً أدنى للإجمالي الفرعي.", ku: "کۆدی کۆپۆن دروست بکە کە کڕیاران لە کاتی پارەدان دەینووسن. کۆدە ڕێژەییەکان بەشێک لە کۆی بەرهەمەکان کەم دەکەنەوە (بە سنوورێکی ئارەزوومەندانە)؛ کۆدە جێگیرەکان بڕێکی دیاریکراو کەم دەکەنەوە (IQD). هەردووکیان دەتوانن داوای کەمترین کۆ بکەن." },
        disc_empty: { en: "No codes yet — add your first", ar: "لا توجد أكواد بعد — أضف أول كود", ku: "هێشتا هیچ کۆدێک نییە — یەکەمیان زیاد بکە" },
        disc_min_subtotal: { en: "Min subtotal", ar: "الحد الأدنى للإجمالي", ku: "کەمترین کۆ" },
        disc_max_off: { en: "Max off", ar: "أقصى خصم", ku: "زۆرترین داشکاندن" },
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
        ship_preview_heading: { en: "What a customer pays", ar: "ما يدفعه الزبون", ku: "ئەوەی کڕیار دەیدات" },
        ship_preview_free: { en: "Free", ar: "مجاني", ku: "بەخۆڕایی" },
        ship_preview_basket: { en: "On a {n} IQD basket", ar: "على سلة بـ {n} د.ع", ku: "لەسەر سەبەتەی {n} IQD" },

        // Redirects screen
        redir_close_aria: { en: "Close redirects", ar: "إغلاق التحويلات", ku: "داخستنی ئاراستەکردنەکان" },
        redir_heading: { en: "Redirects", ar: "التحويلات", ku: "ئاراستەکردنەکان" },
        redir_add: { en: "Add redirect", ar: "إضافة تحويل", ku: "زیادکردنی ئاراستەکردن" },
        redir_intro_prefix: { en: "Send an old URL to a new one — useful after you change a product or category slug, so links you've shared on WhatsApp, ads, or that Google has indexed don't break. Paths are relative to your store (e.g.", ar: "حوّل رابطاً قديماً إلى رابط جديد — مفيد بعد تغيير معرّف منتج أو فئة، حتى لا تتعطل الروابط التي شاركتها على واتساب أو الإعلانات أو التي فهرسها جوجل. المسارات نسبية لمتجرك (مثل", ku: "بەستەرێکی کۆن بنێرە بۆ نوێیەک — بەسوودە دوای گۆڕینی سلەگی بەرهەم یان پۆل، بۆ ئەوەی ئەو بەستەرانەی لە واتساپ و ڕیکلامەکان بڵاوتکردوونەتەوە یان گووگڵ تۆماری کردوون نەشکێن. ڕێچکەکان نیسبین بۆ فرۆشگاکەت (وەکو" },
        redir_empty: { en: "No redirects yet — add your first", ar: "لا توجد تحويلات بعد — أضف أول تحويل", ku: "هێشتا هیچ ئاراستەکردنێک نییە — یەکەمیان زیاد بکە" },
        redir_permanent: { en: "Permanent", ar: "دائم", ku: "هەمیشەیی" },
        redir_remove_aria: { en: "Remove redirect", ar: "إزالة التحويل", ku: "لابردنی ئاراستەکردن" },

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
        loyal_intro: { en: "Reward repeat customers: they earn points when an order is delivered and redeem them for a discount at checkout. If a delivered order is later returned or cancelled, the points it earned are taken back. Off by default — turn it on to start the program.", ar: "كافئ الزبائن المتكررين: يكسبون نقاط لما يستلمون الطلب ويستبدلونها بخصم عند الطلب الجاي. إذا انرجع الطلب أو انلغى بعد التوصيل، تنسحب النقاط اللي كسبها. معطّل افتراضياً — فعّله لبدء البرنامج.", ku: "کڕیارە دووبارەکان خەڵات بکە: کاتێک داواکارییەک دەگەیەنرێت خاڵ بەدەستدەهێنن و لە کاتی پارەدان بە داشکاندن دەیگۆڕنەوە. ئەگەر داواکارییەکە بگەڕێنرێتەوە یان هەڵبوەشێنرێتەوە خاڵەکان دەگەڕێنەوە. بە بنەڕەت کوژاوەتەوە." },
        loyal_enable: { en: "Enable loyalty points", ar: "تفعيل نقاط الولاء", ku: "چالاککردنی خاڵی وەفاداری" },
        loyal_earn_label: { en: "Points earned per IQD", ar: "النقاط المكتسبة لكل دينار", ku: "خاڵی بەدەستهاتوو بۆ هەر IQD" },
        loyal_earn_hint: { en: "e.g. 0.001 = 1 point per 1,000 IQD spent", ar: "مثال: 0.001 = نقطة واحدة لكل 1,000 د.ع", ku: "نموونە: 0.001 = خاڵێک بۆ هەر 1,000 IQD" },
        loyal_redeem_label: { en: "IQD value per point", ar: "قيمة النقطة بالدينار", ku: "بەهای IQD بۆ هەر خاڵێک" },
        loyal_redeem_hint: { en: "e.g. 10 = each point is worth 10 IQD off", ar: "مثال: 10 = كل نقطة تساوي خصم 10 د.ع", ku: "نموونە: 10 = هەر خاڵێک 10 IQD داشکاندنە" },
        loyal_min_label: { en: "Minimum points to redeem", ar: "الحد الأدنى من النقاط للاستبدال", ku: "کەمترین خاڵ بۆ گۆڕینەوە" },
        loyal_min_hint: { en: "Customers can't redeem below this balance", ar: "لا يمكن للعملاء الاستبدال دون هذا الرصيد", ku: "کڕیاران ناتوانن لە خوار ئەم باڵانسە بیگۆڕنەوە" },
        loyal_max_label: { en: "Max % of order from points", ar: "أقصى نسبة من الطلب بالنقاط", ku: "زۆرترین % ی داواکاری بە خاڵ" },
        loyal_max_hint: { en: "Cap redemption to this share of the subtotal (0–100)", ar: "حدّد الاستبدال بهذه الحصة من الإجمالي الفرعي (0–100)", ku: "گۆڕینەوە بەم بەشەی کۆ سنووردار بکە (0–100)" },

        // Cart-recovery screen
        cr_close_aria: { en: "Close cart recovery", ar: "إغلاق استرداد السلة", ku: "داخستنی گەڕاندنەوەی سەبەتە" },
        cr_heading: { en: "Cart recovery", ar: "استرداد السلة", ku: "گەڕاندنەوەی سەبەتە" },
        cr_intro: { en: "Send a WhatsApp nudge to customers who reached checkout but didn't complete their order. Off by default — turn it on to start recovering carts.", ar: "أرسل تذكيراً عبر واتساب للعملاء الذين وصلوا إلى الدفع ولم يكملوا طلبهم. معطّل افتراضياً — فعّله لبدء استرداد السلات.", ku: "ئاگادارکردنەوەی واتساپ بنێرە بۆ ئەو کڕیارانەی گەیشتنە پارەدان بەڵام داواکارییەکەیان تەواو نەکرد. بە بنەڕەت کوژاوەتەوە — هەڵیبکە بۆ دەستپێکردنی گەڕاندنەوەی سەبەتەکان." },
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
