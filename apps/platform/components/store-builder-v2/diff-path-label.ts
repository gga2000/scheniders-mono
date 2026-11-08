// Turns a raw config-diff path (["pages","2","sections","<uuid>","base","title"])
// into words a merchant reads: ["Home", "Hero banner", "Title"].
// Sections are looked up by id in every config passed (the draft and the
// version being compared), so a section that exists in only one still
// resolves to its name.

import type { LocaleCode, SectionInstance, StoreConfigV2 } from "@scheniders/shared";
import { getPageLabel } from "./page-tree";
import { getManifestEntry, sectionDisplayName } from "@/lib/sections-manifest";
import { resolveFieldLabel } from "@/lib/section-field-meta";

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

/** Field words for the tail of a path (`base` dropped, list positions 1-based). */
function fieldParts(rest: readonly string[], sectionType: string | undefined, locale: LocaleCode): string[] {
    const tail = rest[0] === "base" ? rest.slice(1) : rest;
    return tail.map((seg) =>
        /^\d+$/.test(seg) ? `${Number(seg) + 1}` : resolveFieldLabel(sectionType, seg, locale),
    );
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
            return [...parts, ...fieldParts(path.slice(4), section?.type, locale)];
        }
        return [...parts, ...fieldParts(path.slice(2), undefined, locale)];
    }
    if (top === "globals" && second !== undefined) {
        const key = second as keyof StoreConfigV2["globals"];
        const section = configs.map((c) => c.globals[key]).find((s) => s !== undefined);
        const name = section ? sectionName(section, locale) : resolveFieldLabel(undefined, second, locale);
        return [name, ...fieldParts(path.slice(2), section?.type, locale)];
    }
    return fieldParts(path.slice(1), undefined, locale);
}
