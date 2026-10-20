// =====================================================================
// Template upgrades — pulling a direction's improvements into a live store
// =====================================================================
// When a direction gains a section, every merchant already on it should be
// able to take the improvement without losing a word of their own copy.
//
// The planner deliberately keeps NO archive of old template definitions and
// replays no migration list. It compares the store's ACTUAL sections against
// the direction's CURRENT definition and answers one question per section
// slot: does the merchant have this, and did they change it?
//
//   • in the template, absent from the store  → offered as an addition
//   • in both, base identical                 → up to date
//   • in both, base differs                   → the merchant's own; untouched
//   • in the store, not in the template        → theirs; reported, never removed
//
// So an upgrade can only ever ADD a section the merchant does not have, at
// the position the template puts it. Nothing is overwritten, nothing is
// deleted, and a store whose origin we cannot identify simply has no plan.
//
// `version` on a direction is the cheap "is there anything new?" signal for
// the badge; the plan itself is computed from the sections, so a store
// seeded before stamps existed still gets a correct answer.
// =====================================================================

import type { I18nString, PageId, SectionInstance, StoreConfigV2 } from "@scheniders/shared";
import { rehashSections } from "@/lib/section-ids";
import { getStoreTemplate, applyStoreTemplate } from "./index";
import { applyContentPack, resolveContentPack } from "./content-packs";
import { emptyStoreConfigV2 } from "@scheniders/shared";

/** One section the current template places that the store does not have. */
export interface TemplateAddition {
    page_id: PageId;
    type: string;
    /** Where the template puts it, as an index into the template's own stack. */
    index: number;
    /** The section type it follows in the template, for a human explanation. */
    after_type: string | null;
    /** The section to insert, with template defaults + the pack's copy. */
    section: SectionInstance;
}

export interface TemplateUpgradePlan {
    direction_id: string;
    direction_name_i18n: I18nString;
    pack_id: string | undefined;
    /** Version stamped on the store; undefined for a store seeded before stamps. */
    seeded_version: number | undefined;
    current_version: number;
    additions: TemplateAddition[];
    /** Sections the merchant has edited — listed so the plan is honest about what it leaves alone. */
    customised: Array<{ page_id: PageId; type: string }>;
    /** Sections the store has that the template no longer places. Never removed. */
    extra: Array<{ page_id: PageId; type: string }>;
}

/** Stable JSON for comparing two section bases irrespective of key order. */
function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** Build the config this direction × pack produces today. */
function buildReference(directionId: string, packId: string | undefined): StoreConfigV2 | null {
    const direction = getStoreTemplate(directionId);
    if (!direction) return null;
    const ref = applyStoreTemplate(emptyStoreConfigV2(), direction);
    applyContentPack(ref, resolveContentPack(packId));
    return ref;
}

/** Sections of one type on one page, in order — the slots we match on. */
function slots(sections: SectionInstance[]): Map<string, SectionInstance[]> {
    const out = new Map<string, SectionInstance[]>();
    for (const s of sections) {
        const list = out.get(s.type);
        if (list) list.push(s);
        else out.set(s.type, [s]);
    }
    return out;
}

/**
 * What the current template offers this store. Returns null when the store
 * carries no template stamp, or names a direction that no longer exists —
 * there is nothing honest to say about a store of unknown origin.
 */
export function planTemplateUpgrade(cfg: StoreConfigV2): TemplateUpgradePlan | null {
    const stamp = cfg.template;
    if (!stamp?.direction_id) return null;
    const direction = getStoreTemplate(stamp.direction_id);
    if (!direction) return null;
    const ref = buildReference(stamp.direction_id, stamp.pack_id);
    if (!ref) return null;

    const additions: TemplateAddition[] = [];
    const customised: Array<{ page_id: PageId; type: string }> = [];
    const extra: Array<{ page_id: PageId; type: string }> = [];

    for (const refPage of ref.pages) {
        const livePage = cfg.pages.find((p) => p.page_id === refPage.page_id);
        const live = slots(livePage?.sections ?? []);
        const template = slots(refPage.sections);

        refPage.sections.forEach((refSection, index) => {
            const sameType = template.get(refSection.type) ?? [];
            const occurrence = sameType.indexOf(refSection);
            const mine = (live.get(refSection.type) ?? [])[occurrence];
            if (!mine) {
                additions.push({
                    page_id: refPage.page_id,
                    type: refSection.type,
                    index,
                    after_type: index > 0 ? refPage.sections[index - 1].type : null,
                    section: rehashSections([refSection])[0],
                });
                return;
            }
            if (stableStringify(mine.base) !== stableStringify(refSection.base)) {
                customised.push({ page_id: refPage.page_id, type: refSection.type });
            }
        });

        for (const [type, list] of live) {
            const inTemplate = (template.get(type) ?? []).length;
            for (let i = inTemplate; i < list.length; i++) {
                extra.push({ page_id: refPage.page_id, type });
            }
        }
    }

    return {
        direction_id: direction.id,
        direction_name_i18n: direction.name_i18n,
        pack_id: stamp.pack_id,
        seeded_version: stamp.version,
        current_version: direction.version,
        additions,
        customised,
        extra,
    };
}

/**
 * Add the chosen sections to the config, returning a NEW config — the caller
 * owns the draft and undo history. Each section lands at the template's own
 * index, clamped to the page's length, so a merchant who reordered their page
 * still gets it somewhere sensible rather than at the bottom.
 *
 * `selected` holds indices into `plan.additions`; an empty selection means
 * every addition.
 */
export function applyTemplateUpgrade(
    cfg: StoreConfigV2,
    plan: TemplateUpgradePlan,
    selected?: ReadonlySet<number>,
): StoreConfigV2 {
    const chosen = plan.additions.filter((_, i) => !selected || selected.has(i));
    if (chosen.length === 0) return cfg;

    const byPage = new Map<PageId, TemplateAddition[]>();
    for (const add of chosen) {
        const list = byPage.get(add.page_id);
        if (list) list.push(add);
        else byPage.set(add.page_id, [add]);
    }

    const next: StoreConfigV2 = {
        ...cfg,
        pages: cfg.pages.map((page) => {
            const adds = byPage.get(page.page_id);
            if (!adds) return page;
            const sections = [...page.sections];
            // Ascending index: each insert shifts the ones after it, which is
            // exactly the template's own ordering.
            for (const add of [...adds].sort((a, b) => a.index - b.index)) {
                sections.splice(Math.min(add.index, sections.length), 0, add.section);
            }
            return { ...page, sections };
        }),
        template: {
            direction_id: plan.direction_id,
            ...(plan.pack_id ? { pack_id: plan.pack_id } : {}),
            version: plan.current_version,
            applied_at: new Date().toISOString(),
        },
    };
    return next;
}

/** True when the store is behind its direction and has something to gain. */
export function hasTemplateUpdate(plan: TemplateUpgradePlan | null): boolean {
    return !!plan && plan.additions.length > 0;
}
