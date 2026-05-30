// =====================================================================
// responsive-overrides — inline per-breakpoint property override helpers
// =====================================================================
// Lets the editor expose a 3-icon (mobile/tablet/desktop) adornment next
// to each top-level AutoForm field without the merchant ever having to
// open the variant wizard. Under the hood we still use the variant SDK:
// breakpoint overrides are stored as a single Variant per breakpoint
// with EXACTLY one `{kind:"breakpoint",values:[bp]}` condition (the
// "mobile-shortcut" / "tablet-shortcut" / "desktop-shortcut" variant).
// That way the storefront resolver doesn't need to know anything new —
// these are just regular variants that happen to be authored via a
// shortcut UI.
//
// All operations are pure and return a new SectionInstance.
// =====================================================================

import type {
    Breakpoint,
    SectionInstance,
    Variant,
    VariantCondition,
} from "@scheniders/shared";

/** Stable id prefix for shortcut variants so we can recognise them. */
const SHORTCUT_PREFIX = "bp-shortcut-";

/** Human label for a generated breakpoint-shortcut variant. */
const BREAKPOINT_LABELS: Record<Breakpoint, string> = {
    mobile: "Mobile overrides",
    tablet: "Tablet overrides",
    desktop: "Desktop overrides",
};

/* ─────────────────────────────────────────────────────────────────── */
/* Identification                                                       */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * True when a variant has exactly one condition and that condition is a
 * `breakpoint` filter narrowed to the given breakpoint.
 */
export function isBreakpointShortcutVariant(
    v: Variant,
    breakpoint: Breakpoint,
): boolean {
    if (v.conditions.length !== 1) return false;
    const c = v.conditions[0] as VariantCondition;
    if (c.kind !== "breakpoint") return false;
    if (c.values.length !== 1) return false;
    return c.values[0] === breakpoint;
}

/** Find the inline shortcut variant for the given breakpoint, if any. */
export function findBreakpointVariant(
    instance: SectionInstance,
    breakpoint: Breakpoint,
): Variant | null {
    const list = instance.variants ?? [];
    return (
        list.find((v) => isBreakpointShortcutVariant(v, breakpoint)) ?? null
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Override read / write                                                */
/* ─────────────────────────────────────────────────────────────────── */

/** Field path = dot-separated keys (e.g. "title_i18n.en", "image_url"). */
type Path = string;

function splitPath(path: Path): string[] {
    return path.split(".").filter((s) => s.length > 0);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return (
        v !== null && typeof v === "object" && !Array.isArray(v)
    );
}

/** Read a nested value from a plain object using a dotted path. */
function readPath(obj: Record<string, unknown>, path: Path): unknown {
    const segs = splitPath(path);
    let cur: unknown = obj;
    for (const k of segs) {
        if (!isPlainObject(cur)) return undefined;
        cur = cur[k];
    }
    return cur;
}

/** Immutably set a nested value, creating intermediate objects. */
function writePath(
    obj: Record<string, unknown>,
    path: Path,
    value: unknown,
): Record<string, unknown> {
    const segs = splitPath(path);
    if (segs.length === 0) return obj;
    const [head, ...rest] = segs;
    const next: Record<string, unknown> = { ...obj };
    if (rest.length === 0) {
        next[head] = value;
        return next;
    }
    const child = isPlainObject(next[head]) ? next[head] : {};
    next[head] = writePath(child as Record<string, unknown>, rest.join("."), value);
    return next;
}

/** Immutably delete a nested value. Empties intermediate objects are pruned. */
function deletePath(
    obj: Record<string, unknown>,
    path: Path,
): Record<string, unknown> {
    const segs = splitPath(path);
    if (segs.length === 0) return obj;
    const [head, ...rest] = segs;
    if (!(head in obj)) return obj;
    if (rest.length === 0) {
        const next: Record<string, unknown> = { ...obj };
        delete next[head];
        return next;
    }
    const cur = obj[head];
    if (!isPlainObject(cur)) return obj;
    const cleaned = deletePath(cur, rest.join("."));
    const next: Record<string, unknown> = { ...obj };
    if (Object.keys(cleaned).length === 0) {
        delete next[head];
    } else {
        next[head] = cleaned;
    }
    return next;
}

/** Get the per-breakpoint override for a field, or undefined when unset. */
export function getBreakpointOverride(
    instance: SectionInstance,
    breakpoint: Breakpoint,
    fieldPath: Path,
): unknown {
    const v = findBreakpointVariant(instance, breakpoint);
    if (!v) return undefined;
    return readPath(v.override, fieldPath);
}

/** True iff there is an override at the given (breakpoint, fieldPath). */
export function hasBreakpointOverride(
    instance: SectionInstance,
    breakpoint: Breakpoint,
    fieldPath: Path,
): boolean {
    const v = findBreakpointVariant(instance, breakpoint);
    if (!v) return false;
    const segs = splitPath(fieldPath);
    let cur: unknown = v.override;
    for (const k of segs) {
        if (!isPlainObject(cur)) return false;
        if (!(k in cur)) return false;
        cur = (cur as Record<string, unknown>)[k];
    }
    return true;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Variant creation / mutation                                          */
/* ─────────────────────────────────────────────────────────────────── */

function makeShortcutId(breakpoint: Breakpoint): string {
    // Predictable id helps test assertions and dedupes across saves.
    return `${SHORTCUT_PREFIX}${breakpoint}`;
}

function makeShortcutVariant(breakpoint: Breakpoint): Variant {
    return {
        id: makeShortcutId(breakpoint),
        label: BREAKPOINT_LABELS[breakpoint],
        conditions: [{ kind: "breakpoint", values: [breakpoint] }],
        override: {},
        // Same default priority used by the wizard for new variants.
        priority: 0,
        enabled: true,
    };
}

/**
 * Ensure the section has a shortcut variant for the given breakpoint and
 * write `value` at `fieldPath` inside its `override`. Returns a new
 * SectionInstance.
 */
export function setBreakpointOverride(
    instance: SectionInstance,
    breakpoint: Breakpoint,
    fieldPath: Path,
    value: unknown,
): SectionInstance {
    if (splitPath(fieldPath).length === 0) return instance;

    const existing = findBreakpointVariant(instance, breakpoint);
    const variant = existing ?? makeShortcutVariant(breakpoint);
    const nextOverride = writePath(variant.override, fieldPath, value);
    const nextVariant: Variant = { ...variant, override: nextOverride };

    const list = instance.variants ?? [];
    const nextList = existing
        ? list.map((v) => (v.id === existing.id ? nextVariant : v))
        : [...list, nextVariant];

    return { ...instance, variants: nextList };
}

/**
 * Clear the override for `(breakpoint, fieldPath)`. If the shortcut
 * variant becomes empty afterwards it is removed entirely so the section
 * data stays clean.
 */
export function clearBreakpointOverride(
    instance: SectionInstance,
    breakpoint: Breakpoint,
    fieldPath: Path,
): SectionInstance {
    const existing = findBreakpointVariant(instance, breakpoint);
    if (!existing) return instance;

    const nextOverride = deletePath(existing.override, fieldPath);
    const list = instance.variants ?? [];

    if (Object.keys(nextOverride).length === 0) {
        const nextList = list.filter((v) => v.id !== existing.id);
        if (nextList.length === list.length) return instance;
        return {
            ...instance,
            variants: nextList.length > 0 ? nextList : undefined,
        };
    }

    const nextVariant: Variant = { ...existing, override: nextOverride };
    const nextList = list.map((v) => (v.id === existing.id ? nextVariant : v));
    return { ...instance, variants: nextList };
}

export const __test__ = {
    SHORTCUT_PREFIX,
    BREAKPOINT_LABELS,
};
