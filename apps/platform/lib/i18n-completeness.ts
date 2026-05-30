// =====================================================================
// i18n completeness meter
// =====================================================================
// Walks a StoreConfigV2, finds every i18n field (by key suffix
// `_i18n` *or* by value shape `{ en?, ar?, ku? }`), and returns counts
// of how many are filled per locale, in total and per page. The result
// powers the editor toolbar pill ("ar 73% / en 100%") and the dedicated
// i18n screen which lets merchants jump to untranslated fields.
//
// Pure — no React, no Supabase, no DOM. Safe to call from a worker, a
// test, or the editor toolbar.
// =====================================================================

import type {
  I18nString,
  LocaleCode,
  PageConfig,
  PageId,
  SectionInstance,
  StoreConfigV2,
} from "@scheniders/shared";
import { SUPPORTED_LOCALES } from "@scheniders/shared";

/* ─────────────────────────────────────────────────────────────────── */
/* Detection                                                            */
/* ─────────────────────────────────────────────────────────────────── */

/** Treat a value as i18n if it is a plain object with at least one
 *  supported locale key (`en`, `ar`, `ku`) whose value is a string. */
function isI18nShape(v: unknown): v is I18nString {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  let sawLocaleKey = false;
  for (const loc of SUPPORTED_LOCALES) {
    if (loc in obj) {
      const cell = obj[loc];
      if (cell !== undefined && typeof cell !== "string") return false;
      sawLocaleKey = true;
    }
  }
  if (!sawLocaleKey) return false;
  // Reject objects that mix locale keys with arbitrary other fields —
  // that's almost always a different shape that happens to share a key.
  const allowed = new Set<string>(SUPPORTED_LOCALES);
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) return false;
  }
  return true;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Counters                                                             */
/* ─────────────────────────────────────────────────────────────────── */

interface LocaleCounter {
  filled: number;
  total: number;
  pct: number;
}

function emptyCounter(): LocaleCounter {
  return { filled: 0, total: 0, pct: 0 };
}

function emptyPerLocale(): Record<LocaleCode, LocaleCounter> {
  return {
    ar: emptyCounter(),
    en: emptyCounter(),
    ku: emptyCounter(),
  } as Record<LocaleCode, LocaleCounter>;
}

function recordI18n(
  value: I18nString,
  bucket: Record<LocaleCode, LocaleCounter>,
): void {
  for (const loc of SUPPORTED_LOCALES) {
    bucket[loc].total += 1;
    const cell = value[loc];
    if (typeof cell === "string" && cell.trim().length > 0) {
      bucket[loc].filled += 1;
    }
  }
}

/** Walk an arbitrary props blob and record every i18n field. The hint
 *  `keyHint` is used to identify `_i18n` keys whose value happens to be
 *  undefined or a primitive (still counted toward the total). */
function walkProps(
  value: unknown,
  bucket: Record<LocaleCode, LocaleCounter>,
  keyHint?: string,
): void {
  if (isI18nShape(value)) {
    recordI18n(value, bucket);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkProps(item, bucket);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Recurse first so nested i18n in plain shapes still gets counted.
      walkProps(v, bucket, k);
    }
    return;
  }
  // Primitive — only count an empty `_i18n` slot as 0/total per locale.
  if (keyHint && keyHint.endsWith("_i18n")) {
    for (const loc of SUPPORTED_LOCALES) {
      bucket[loc].total += 1;
    }
  }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Public API                                                           */
/* ─────────────────────────────────────────────────────────────────── */

export interface SectionCompleteness {
  section_id: string;
  type: string;
  label?: string;
  perLocale: Record<LocaleCode, LocaleCounter>;
  /** Untranslated field paths per locale — best-effort for the screen's
   *  "go to untranslated fields" list. Paths are dot-separated. */
  missing: Record<LocaleCode, string[]>;
}

export interface PageCompleteness {
  page_id: PageId;
  perLocale: Record<LocaleCode, LocaleCounter>;
  sections: SectionCompleteness[];
}

export interface I18nCompleteness {
  perLocale: Record<LocaleCode, LocaleCounter>;
  perPage: PageCompleteness[];
}

function finalisePct(bucket: Record<LocaleCode, LocaleCounter>): void {
  for (const loc of SUPPORTED_LOCALES) {
    const c = bucket[loc];
    c.pct = c.total === 0 ? 100 : Math.round((c.filled / c.total) * 100);
  }
}

function addInto(
  target: Record<LocaleCode, LocaleCounter>,
  source: Record<LocaleCode, LocaleCounter>,
): void {
  for (const loc of SUPPORTED_LOCALES) {
    target[loc].filled += source[loc].filled;
    target[loc].total += source[loc].total;
  }
}

/** Walk a single section instance and collect i18n counters plus
 *  per-locale missing paths from `base` and from each `visibility`-aware
 *  variant's override. */
function analyseSection(section: SectionInstance): SectionCompleteness {
  const perLocale = emptyPerLocale();
  const missing: Record<LocaleCode, string[]> = { ar: [], en: [], ku: [] };

  function walkWithPath(
    value: unknown,
    path: string[],
    keyHint?: string,
  ): void {
    if (isI18nShape(value)) {
      for (const loc of SUPPORTED_LOCALES) {
        perLocale[loc].total += 1;
        const cell = (value as I18nString)[loc];
        if (typeof cell === "string" && cell.trim().length > 0) {
          perLocale[loc].filled += 1;
        } else {
          missing[loc].push(path.join("."));
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, idx) =>
        walkWithPath(item, [...path, String(idx)]),
      );
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walkWithPath(v, [...path, k], k);
      }
      return;
    }
    if (keyHint && keyHint.endsWith("_i18n")) {
      for (const loc of SUPPORTED_LOCALES) {
        perLocale[loc].total += 1;
        missing[loc].push(path.join("."));
      }
    }
  }

  walkWithPath(section.base, ["base"]);

  // Variants — override fields also count. Use the same key-hint logic
  // so partially-filled overrides still surface.
  for (const variant of section.variants ?? []) {
    walkWithPath(variant.override, ["variants", variant.id]);
  }

  finalisePct(perLocale);
  return {
    section_id: section.id,
    type: section.type,
    label: section.label,
    perLocale,
    missing,
  };
}

function analysePage(page: PageConfig): PageCompleteness {
  const perLocale = emptyPerLocale();
  const sections: SectionCompleteness[] = [];

  // Page meta has i18n too — title + description.
  if (page.meta) {
    walkProps(page.meta, perLocale, "meta");
  }

  for (const section of page.sections) {
    const sectionResult = analyseSection(section);
    sections.push(sectionResult);
    // Re-aggregate raw counters (not the pct'd version).
    const raw = emptyPerLocale();
    for (const loc of SUPPORTED_LOCALES) {
      raw[loc].filled = sectionResult.perLocale[loc].filled;
      raw[loc].total = sectionResult.perLocale[loc].total;
    }
    addInto(perLocale, raw);
  }

  finalisePct(perLocale);
  return { page_id: page.page_id, perLocale, sections };
}

/**
 * Public entrypoint — walk a full `StoreConfigV2` and return per-locale
 * + per-page i18n completeness. Globals (header/footer/promo bar/etc.)
 * are folded into the totals under a synthetic page id `_globals`.
 */
export function computeCompleteness(config: StoreConfigV2): I18nCompleteness {
  const total = emptyPerLocale();
  const perPage: PageCompleteness[] = [];

  for (const page of config.pages) {
    const pageResult = analysePage(page);
    perPage.push(pageResult);
    const raw = emptyPerLocale();
    for (const loc of SUPPORTED_LOCALES) {
      raw[loc].filled = pageResult.perLocale[loc].filled;
      raw[loc].total = pageResult.perLocale[loc].total;
    }
    addInto(total, raw);
  }

  // Globals.
  const globalSections: SectionInstance[] = [];
  for (const sec of Object.values(config.globals ?? {})) {
    if (sec) globalSections.push(sec);
  }
  if (globalSections.length > 0) {
    const fakePage: PageConfig = {
      page_id: "home", // placeholder — replaced in the result
      sections: globalSections,
    };
    const result = analysePage(fakePage);
    const raw = emptyPerLocale();
    for (const loc of SUPPORTED_LOCALES) {
      raw[loc].filled = result.perLocale[loc].filled;
      raw[loc].total = result.perLocale[loc].total;
    }
    addInto(total, raw);
    perPage.push({
      // synthetic — UI treats this as the "globals" bucket
      page_id: "home" as PageId,
      perLocale: result.perLocale,
      sections: result.sections.map((s) => ({ ...s })),
    });
    // Re-mark the synthetic page so callers can distinguish it.
    Object.assign(perPage[perPage.length - 1], { page_id: "_globals" });
  }

  finalisePct(total);
  return { perLocale: total, perPage };
}
