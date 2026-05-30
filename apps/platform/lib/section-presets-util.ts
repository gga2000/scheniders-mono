// =====================================================================
// Section preset utilities — pure helpers, no Supabase dep
// =====================================================================
// Lives separately from the `useSectionPresets` hook so consumers that
// only need the data-shape helpers (e.g. the section picker rendering a
// preset row) don't transitively pull in the supabase client.
// =====================================================================

import type {
    SectionInstance,
    Variant,
    VisibilityRule,
} from "@scheniders/shared";

/** What we store per preset. Mirrors `SectionInstance` minus `id`. */
export interface SectionInstancePreset {
    type: string;
    enabled: boolean;
    base: Record<string, unknown>;
    label?: string;
    variants?: Variant[];
    visibility?: VisibilityRule[];
}

export interface SectionPresetRow {
    id: string;
    tenant_id: string;
    name: string;
    section_type: string;
    instance: SectionInstancePreset;
    created_at: string;
}

/** Strip the runtime `id` from a SectionInstance — presets re-assign on insert. */
export function stripInstanceForPreset(
    inst: SectionInstance,
): SectionInstancePreset {
    const { id: _ignored, ...rest } = inst;
    return JSON.parse(JSON.stringify(rest)) as SectionInstancePreset;
}

/** Build a fresh SectionInstance from a preset row — assigns a new id. */
export function instantiatePreset(row: SectionPresetRow): SectionInstance {
    return {
        ...row.instance,
        id: cryptoRandomId(),
        base: JSON.parse(JSON.stringify(row.instance.base)) as Record<
            string,
            unknown
        >,
        variants: row.instance.variants
            ? row.instance.variants.map((v) => ({
                  ...v,
                  override: JSON.parse(JSON.stringify(v.override)) as Record<
                      string,
                      unknown
                  >,
              }))
            : undefined,
        visibility: row.instance.visibility
            ? row.instance.visibility.map((r) => ({ ...r }))
            : undefined,
    };
}

function cryptoRandomId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
