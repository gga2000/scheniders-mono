// =====================================================================
// variant-summary — human descriptions for Variant.conditions
// =====================================================================
// The variant DATA shape stays the same (VariantCondition union from
// @scheniders/shared). This module produces MERCHANT-FACING summary
// strings for the variant-list rows. The audit flagged that today we
// surface raw values like "Time: 2026-03-10T08:00 → 2026-04-09T08:00
// (Asia/Baghdad)" or "Governorates: BG, BA" — instead we want
// "Mar 10 — Apr 9" and "In Baghdad + Basra".
//
// The function is PURE — no React, no DOM, no i18n side effects — so
// it lives under `apps/platform/lib/` and is testable in isolation.
// =====================================================================

import {
    IRAQ_GOVERNORATES,
    LOCALE_LABELS,
    type AudienceSegment,
    type Experiment,
    type GovernorateCode,
    type LocaleCode,
    type PageId,
    type Variant,
    type VariantCondition,
} from "@scheniders/shared";

export interface SummarizeOptions {
    /** Experiments referenced by `ab_test` conditions — name lookup. */
    experiments?: Experiment[];
    /** Audience segments referenced by `audience` conditions — name lookup. */
    segments?: AudienceSegment[];
    /** Section type label, used by some kinds for context. */
    sectionType?: string;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Date formatting                                                      */
/* ─────────────────────────────────────────────────────────────────── */

const MONTH_SHORT_EN = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTH_SHORT_AR = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const MONTH_SHORT_KU = [
    "ڕێ", "شو", "ئاد", "نی", "ئاد", "حو",
    "تە", "ئا", "ئەی", "تش", "تش٢", "کا",
];

function formatShortDate(iso: string, locale: LocaleCode): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    const table =
        locale === "ar" ? MONTH_SHORT_AR : locale === "ku" ? MONTH_SHORT_KU : MONTH_SHORT_EN;
    return `${table[d.getMonth()]} ${d.getDate()}`;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Governorate / breakpoint / page lookups                              */
/* ─────────────────────────────────────────────────────────────────── */

function governorateName(code: GovernorateCode, locale: LocaleCode): string {
    const row = IRAQ_GOVERNORATES.find((g) => g.code === code);
    if (!row) return code;
    // Arabic name is the canonical name; for EN we strip the article when we
    // can and otherwise use the AR name (Baghdad/Basra are universally
    // recognised). For now keep AR name in AR/KU and use a small map for
    // English-friendly transliterations.
    if (locale === "en") {
        return GOV_EN[code] ?? row.name;
    }
    return row.name;
}

const GOV_EN: Record<GovernorateCode, string> = {
    BG: "Baghdad",
    BA: "Basra",
    ER: "Erbil",
    SU: "Sulaymaniyah",
    DH: "Duhok",
    NI: "Nineveh",
    KI: "Kirkuk",
    DI: "Diyala",
    AN: "Anbar",
    BB: "Babil",
    KE: "Karbala",
    NA: "Najaf",
    QA: "Qadisiyyah",
    MU: "Muthanna",
    DQ: "Dhi Qar",
    WA: "Wasit",
    MA: "Maysan",
    SA: "Salah ad-Din",
};

const LOCALE_NAME_EN: Record<LocaleCode, string> = {
    en: "English",
    ar: "Arabic",
    ku: "Kurdish",
};

const PAGE_EN: Record<PageId, string> = {
    home: "Home",
    category: "Category",
    product: "Product",
    search: "Search",
    cart: "Cart",
    checkout: "Checkout",
    checkout_success: "Order success",
    track: "Order tracking",
    about: "About",
    faq: "FAQ",
    contact: "Contact",
    policy_shipping: "Shipping",
    policy_returns: "Returns",
    policy_privacy: "Privacy",
    policy_terms: "Terms",
    not_found: "404",
};

const DEVICE_LABELS: Record<"mobile" | "tablet" | "desktop", Record<LocaleCode, string>> = {
    mobile: { en: "phones", ar: "الهواتف", ku: "مۆبایلەکان" },
    tablet: { en: "tablets", ar: "اللوحات", ku: "تابلێتەکان" },
    desktop: { en: "desktops", ar: "أجهزة الكمبيوتر", ku: "کۆمپیوتەرەکان" },
};

/* ─────────────────────────────────────────────────────────────────── */
/* Glue (locale-aware joiner)                                           */
/* ─────────────────────────────────────────────────────────────────── */

function joinList(parts: string[], locale: LocaleCode): string {
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0];
    const sep = locale === "ar" ? "، " : ", ";
    const lastSep = locale === "ar" ? " و " : " + ";
    return parts.slice(0, -1).join(sep) + lastSep + parts[parts.length - 1];
}

/* ─────────────────────────────────────────────────────────────────── */
/* Per-kind summary                                                     */
/* ─────────────────────────────────────────────────────────────────── */

function summarizeOne(
    c: VariantCondition,
    locale: LocaleCode,
    options: SummarizeOptions,
): string {
    switch (c.kind) {
        case "time_window": {
            const start = formatShortDate(c.start_iso, locale);
            if (c.end_iso) {
                const end = formatShortDate(c.end_iso, locale);
                return locale === "ar"
                    ? `من ${start} إلى ${end}`
                    : locale === "ku"
                      ? `لە ${start} بۆ ${end}`
                      : `${start} — ${end}`;
            }
            return locale === "ar"
                ? `من ${start}`
                : locale === "ku"
                  ? `لە ${start}ەوە`
                  : `From ${start}`;
        }
        case "breakpoint": {
            if (c.values.length === 0) return "";
            const labels = c.values.map((v) => DEVICE_LABELS[v][locale]);
            const joined = joinList(labels, locale);
            return locale === "ar"
                ? `على ${joined}`
                : locale === "ku"
                  ? `لەسەر ${joined}`
                  : `On ${joined}`;
        }
        case "governorate": {
            if (c.values.length === 0) return "";
            const names = c.values.map((code) => governorateName(code, locale));
            const joined = joinList(names, locale);
            return locale === "ar"
                ? `في ${joined}`
                : locale === "ku"
                  ? `لە ${joined}`
                  : `In ${joined}`;
        }
        case "locale": {
            if (c.values.length === 0) return "";
            const langs = c.values.map((l) =>
                locale === "en"
                    ? LOCALE_NAME_EN[l] ?? l
                    : LOCALE_LABELS[l] ?? l,
            );
            const joined = joinList(langs, locale);
            return locale === "ar"
                ? `عند العرض بـ${joined}`
                : locale === "ku"
                  ? `کاتێک بە ${joined} پیشاندەدرێت`
                  : `When viewing in ${joined}`;
        }
        case "audience": {
            const seg = options.segments?.find((s) => s.id === c.segment_id);
            const name = seg?.name ?? c.segment_id;
            return locale === "ar"
                ? `للجمهور: ${name}`
                : locale === "ku"
                  ? `بۆ بینەران: ${name}`
                  : `For: ${name}`;
        }
        case "ab_test": {
            const exp = options.experiments?.find((e) => e.id === c.experiment_id);
            const name = exp?.name ?? c.experiment_id;
            const armLabel =
                exp?.arms.find((a) => a.id === c.arm)?.label ?? c.arm;
            return locale === "ar"
                ? `اختبار: ${name}، ${armLabel}`
                : locale === "ku"
                  ? `تاقیکردنەوە: ${name}، ${armLabel}`
                  : `Test: ${name}, ${armLabel}`;
        }
        case "page": {
            if (c.values.length === 0) return "";
            const names = c.values.map((p) => PAGE_EN[p] ?? p);
            const joined = joinList(names, locale);
            return locale === "ar"
                ? `على صفحة ${joined}`
                : locale === "ku"
                  ? `لەسەر پەڕەی ${joined}`
                  : `On ${joined}`;
        }
        case "product":
            return locale === "ar"
                ? `لـ ${c.product_ids.length} منتج`
                : locale === "ku"
                  ? `بۆ ${c.product_ids.length} بەرهەم`
                  : `For ${c.product_ids.length} product${c.product_ids.length === 1 ? "" : "s"}`;
        case "category":
            return locale === "ar"
                ? `لـ ${c.category_ids.length} فئة`
                : locale === "ku"
                  ? `بۆ ${c.category_ids.length} پۆل`
                  : `For ${c.category_ids.length} categor${c.category_ids.length === 1 ? "y" : "ies"}`;
    }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Public                                                               */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Produce a single, merchant-readable summary for a list of conditions.
 * For a single condition this is the per-kind summary; for multiple it
 * comma-joins them. Unknown / empty conditions yield "Always shown".
 */
export function summarizeVariantConditions(
    conditions: VariantCondition[],
    locale: LocaleCode,
    options: SummarizeOptions = {},
): string {
    if (!conditions || conditions.length === 0) {
        return locale === "ar"
            ? "تظهر دائماً"
            : locale === "ku"
              ? "هەمیشە پیشاندەدرێت"
              : "Always shown";
    }
    const parts = conditions
        .map((c) => summarizeOne(c, locale, options))
        .filter((s) => s.length > 0);
    if (parts.length === 0) {
        // Fallback if every condition produced an empty summary (shouldn't
        // happen but keeps merchants from seeing a bare label).
        return locale === "ar"
            ? "متقدم"
            : locale === "ku"
              ? "پێشکەوتوو"
              : "Advanced";
    }
    return parts.join(locale === "ar" ? " · " : " · ");
}

/** Variant-level wrapper — convenience for variant-list rows. */
export function summarizeVariant(
    v: Variant,
    locale: LocaleCode,
    options: SummarizeOptions = {},
): string {
    return summarizeVariantConditions(v.conditions, locale, options);
}
