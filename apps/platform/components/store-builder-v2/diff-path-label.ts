// Turns a raw config-diff path (["pages","2","sections","<uuid>","base","title"])
// into words a merchant reads: ["Home", "Hero banner", "Title"].
// Sections are looked up by id in every config passed (the draft and the
// version being compared), so a section that exists in only one still
// resolves to its name.

import type { LocaleCode, SectionInstance, StoreConfigV2 } from "@scheniders/shared";
import { getPageLabel } from "./page-tree";
import { getManifestEntry, sectionDisplayName } from "@/lib/sections-manifest";
import { resolveFieldLabel } from "@/lib/section-field-meta";
import { STRINGS, t, type EditorString } from "@/lib/editor-i18n";

const SECRET_KEY = /token|secret|password|api_?key/i;

/** True when the path ends at a credential, so its value must not be shown. */
export function isSecretDiffPath(path: readonly string[]): boolean {
    return path.some((seg) => SECRET_KEY.test(seg));
}

function sectionName(section: SectionInstance, locale: LocaleCode): string {
    if (section.label?.trim()) return section.label.trim();
    const entry = getManifestEntry(section.type);
    return entry ? sectionDisplayName(entry, locale) : section.type;
}

function findSection(
    configs: readonly StoreConfigV2[],
    pageIndex: number,
    sectionId: string,
): SectionInstance | undefined {
    for (const config of configs) {
        const hit = config.pages[pageIndex]?.sections.find((s) => s.id === sectionId);
        if (hit) return hit;
    }
    return undefined;
}

const LOCALES: ReadonlySet<string> = new Set(["ar", "en", "ku"]);

/** Commerce sub-areas carry the name of the settings screen that edits them. */
const COMMERCE_AREAS: Record<string, EditorString> = {
    shipping: STRINGS.page_tree.setting_shipping,
    discounts: STRINGS.page_tree.setting_discounts,
    cart_recovery: STRINGS.page_tree.setting_cart_recovery,
    bundles: STRINGS.page_tree.setting_bundles,
    loyalty: STRINGS.page_tree.setting_loyalty,
    free_gift: STRINGS.page_tree.setting_free_gift,
    order_status_narratives: STRINGS.page_tree.setting_order_status,
    whatsapp_number: STRINGS.version_history.area_whatsapp,
    enable_whatsapp_order: STRINGS.version_history.area_whatsapp,
    whatsapp_templates: STRINGS.version_history.area_whatsapp,
    socials: STRINGS.version_history.area_socials,
    returns_policy: STRINGS.version_history.area_returns,
    delivery_promise: STRINGS.version_history.area_delivery_promise,
    contact: STRINGS.version_history.area_contact,
    referral: STRINGS.version_history.area_referral,
};

/** One step into a config value; list items resolve by index or by `id`. */
function step(cur: unknown, seg: string): unknown {
    if (Array.isArray(cur)) {
        if (/^\d+$/.test(seg)) return cur[Number(seg)];
        return cur.find((el) => el !== null && typeof el === "object" && (el as { id?: unknown }).id === seg);
    }
    if (cur === null || typeof cur !== "object") return undefined;
    return (cur as Record<string, unknown>)[seg];
}

/** 1-based position of a list item addressed by index or by `id`. */
function listPosition(configs: readonly StoreConfigV2[], listPath: readonly string[], seg: string): number {
    if (/^\d+$/.test(seg)) return Number(seg) + 1;
    for (const c of configs) {
        const list = valueAt(c, listPath);
        if (!Array.isArray(list)) continue;
        const at = list.findIndex((el) => el !== null && typeof el === "object" && (el as { id?: unknown }).id === seg);
        if (at >= 0) return at + 1;
    }
    return 1;
}

/** Config keys outside section schemas, named like the screens that edit them. */
const CONFIG_KEYS: Record<string, EditorString> = {
    default_rate: STRINGS.version_history.key_default_rate,
    rates: STRINGS.version_history.key_rates,
    eta_hours: STRINGS.version_history.key_eta_hours,
    variants: STRINGS.version_history.key_variants,
    kind: STRINGS.version_history.key_kind,
    rules: STRINGS.version_history.key_rules,
    values: STRINGS.version_history.key_values,
    code: STRINGS.version_history.key_code,
    value: STRINGS.version_history.key_value,
    min_subtotal_iqd: STRINGS.version_history.key_min_subtotal_iqd,
    max_discount_iqd: STRINGS.version_history.key_max_discount_iqd,
    meta_pixel_id: STRINGS.pixels.meta_pixel,
    tiktok_pixel_id: STRINGS.pixels.tiktok_pixel,
    google_analytics_id: STRINGS.pixels.ga_id,
    snapchat_pixel_id: STRINGS.pixels.snap_pixel,
    gtm_container_id: STRINGS.pixels.gtm_id,
    meta_capi_token: STRINGS.pixels.meta_capi,
    tiktok_capi_token: STRINGS.pixels.tiktok_capi,
    capi_test_event_code: STRINGS.pixels.meta_test_code,
};

function valueAt(config: unknown, path: readonly string[]): unknown {
    let cur: unknown = config;
    for (const seg of path) cur = step(cur, seg);
    return cur;
}

/** A list item's own name (audience, bundle, rule…), when it has one. */
function itemName(item: unknown, locale: LocaleCode): string | null {
    if (item === null || typeof item !== "object") return null;
    const rec = item as Record<string, unknown>;
    for (const key of ["name", "label", "title", "name_i18n", "label_i18n", "title_i18n"]) {
        const v = rec[key];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (v && typeof v === "object") {
            const i18n = v as Partial<Record<LocaleCode, string>>;
            const text = i18n[locale] ?? i18n.ar ?? i18n.en;
            if (text?.trim()) return text.trim();
        }
    }
    return null;
}

/**
 * Words for path[from..]: `base` dropped, list items named (else numbered
 * from 1), language keys spelled out.
 */
function tailParts(
    path: readonly string[],
    from: number,
    configs: readonly StoreConfigV2[],
    sectionType: string | undefined,
    locale: LocaleCode,
): string[] {
    const out: string[] = [];
    for (let i = from; i < path.length; i++) {
        const seg = path[i];
        if (seg === "base" && i === from) continue;
        const parentIsList = configs.some((c) => Array.isArray(valueAt(c, path.slice(0, i))));
        if (parentIsList || /^\d+$/.test(seg)) {
            const prefix = path.slice(0, i + 1);
            const name = configs.map((c) => itemName(valueAt(c, prefix), locale)).find((n) => n !== null);
            out.push(name ?? `${listPosition(configs, path.slice(0, i), seg)}`);
        } else if (LOCALES.has(seg)) {
            out.push(t(STRINGS.languages[seg as LocaleCode], locale));
        } else if (CONFIG_KEYS[seg]) {
            out.push(t(CONFIG_KEYS[seg], locale));
        } else {
            out.push(resolveFieldLabel(sectionType, seg, locale));
        }
    }
    return out;
}

export function describeDiffPath(
    path: readonly string[],
    configs: readonly StoreConfigV2[],
    locale: LocaleCode,
): string[] {
    const [top, second, third, fourth] = path;
    if (top === "pages" && second !== undefined && /^\d+$/.test(second)) {
        const pageIndex = Number(second);
        const pageId = configs.map((c) => c.pages[pageIndex]?.page_id).find((id) => id !== undefined);
        const parts = [pageId ? getPageLabel(pageId, locale) : `${pageIndex + 1}`];
        if (third === "sections" && fourth !== undefined) {
            const section = findSection(configs, pageIndex, fourth);
            parts.push(section ? sectionName(section, locale) : resolveFieldLabel(undefined, "section", locale));
            return [...parts, ...tailParts(path, 4, configs, section?.type, locale)];
        }
        return [...parts, ...tailParts(path, 2, configs, undefined, locale)];
    }
    if (top === "globals" && second !== undefined) {
        const key = second as keyof StoreConfigV2["globals"];
        const section = configs.map((c) => c.globals[key]).find((s) => s !== undefined);
        const name = section ? sectionName(section, locale) : resolveFieldLabel(undefined, second, locale);
        return [name, ...tailParts(path, 2, configs, section?.type, locale)];
    }
    if (top === "commerce" && second !== undefined && COMMERCE_AREAS[second]) {
        return [t(COMMERCE_AREAS[second], locale), ...tailParts(path, 2, configs, undefined, locale)];
    }
    return tailParts(path, 1, configs, undefined, locale);
}
