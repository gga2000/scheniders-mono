// =====================================================================
// variant-override-paths — pure helpers for the per-field override model
// =====================================================================
// Extracted from variant-editor.tsx so that variant-list.tsx (and any
// other lightweight consumer) can summarize override paths without
// pulling in AutoForm / Supabase.
// =====================================================================

import type { z } from "zod";
import { humanizeFieldKey } from "@/lib/section-field-meta";

/* ─────────────────────────────────────────────────────────────────── */
/* Schema introspection                                                 */
/* ─────────────────────────────────────────────────────────────────── */

/** Strip Optional / Default / Nullable / Effects wrappers. */
export function unwrapSchema(schema: z.ZodType<unknown>): z.ZodType<unknown> {
    let s: z.ZodType<unknown> = schema;
    let safety = 0;
    while (safety++ < 12) {
        const defAny = (s as { _def?: { type?: string; innerType?: z.ZodType<unknown>; schema?: z.ZodType<unknown> } })._def;
        if (!defAny) break;
        const t = defAny.type;
        if (
            (t === "optional" || t === "nullable" || t === "default" || t === "readonly" || t === "branded") &&
            defAny.innerType
        ) {
            s = defAny.innerType;
            continue;
        }
        if ((t === "effects" || t === "pipe" || t === "pipeline") && defAny.schema) {
            s = defAny.schema;
            continue;
        }
        break;
    }
    return s;
}

/** Return true if a Zod object shape matches `{ en?, ar?, ku? }` (I18nString). */
export function isI18nShape(shape: Record<string, z.ZodType<unknown>>): boolean {
    const keys = Object.keys(shape).sort().join(",");
    return keys === ["ar", "en", "ku"].sort().join(",");
}

export interface OverridablePath {
    path: string;
    /** "leaf" / "array" / "i18n". Used for UI hints only. */
    kind: "leaf" | "array" | "i18n";
}

/**
 * Walk a Zod schema and produce a flat list of overridable field paths.
 * - Plain leaves (string, number, boolean, enum) → one entry.
 * - I18nString objects → one entry (kind = "i18n").
 * - Arrays → one entry (kind = "array"), no recursion into elements
 *   because the resolver replaces arrays wholesale.
 * - Nested objects → recurse and emit child paths.
 * - Unions → SKIP.
 */
export function listOverridablePaths(schema: z.ZodType<unknown>): OverridablePath[] {
    const out: OverridablePath[] = [];

    const visit = (node: z.ZodType<unknown>, prefix: string): void => {
        const inner = unwrapSchema(node);
        const def = (inner as { _def?: { type?: string } })._def;
        const t = def?.type;

        if (t === "object") {
            const shape = (inner as unknown as { shape: Record<string, z.ZodType<unknown>> })
                .shape;
            if (isI18nShape(shape)) {
                if (prefix) out.push({ path: prefix, kind: "i18n" });
                return;
            }
            for (const key of Object.keys(shape)) {
                const next = prefix ? `${prefix}.${key}` : key;
                visit(shape[key], next);
            }
            return;
        }

        if (t === "array") {
            if (prefix) out.push({ path: prefix, kind: "array" });
            return;
        }

        if (t === "union" || t === "discriminatedUnion") {
            return;
        }

        if (prefix) out.push({ path: prefix, kind: "leaf" });
    };

    visit(schema, "");
    return out;
}

/**
 * Resolve the Zod schema at a given path (walking through unwrap and
 * object shapes). Returns null if the path doesn't exist in the schema.
 */
export function schemaAtPath(
    schema: z.ZodType<unknown>,
    path: string,
): z.ZodType<unknown> | null {
    if (!path) return schema;
    const segs = path.split(".");
    let cur: z.ZodType<unknown> = schema;
    for (const seg of segs) {
        const inner = unwrapSchema(cur);
        const def = (inner as { _def?: { type?: string } })._def;
        if (def?.type !== "object") return null;
        const shape = (inner as unknown as { shape: Record<string, z.ZodType<unknown>> })
            .shape;
        const next = shape[seg];
        if (!next) return null;
        cur = next;
    }
    return cur;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Path-based get / set / unset on a plain object                       */
/* ─────────────────────────────────────────────────────────────────── */

export function getAtPath(obj: unknown, path: string): unknown {
    if (!path) return obj;
    const segs = path.split(".");
    let cur: unknown = obj;
    for (const seg of segs) {
        if (cur == null || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[seg];
    }
    return cur;
}

export function setAtPath(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
): Record<string, unknown> {
    if (!path) return obj;
    const segs = path.split(".");
    const root: Record<string, unknown> = { ...obj };
    let cur: Record<string, unknown> = root;
    for (let i = 0; i < segs.length - 1; i++) {
        const seg = segs[i];
        const existing = cur[seg];
        const next: Record<string, unknown> =
            existing && typeof existing === "object" && !Array.isArray(existing)
                ? { ...(existing as Record<string, unknown>) }
                : {};
        cur[seg] = next;
        cur = next;
    }
    cur[segs[segs.length - 1]] = value;
    return root;
}

export function unsetAtPath(
    obj: Record<string, unknown>,
    path: string,
): Record<string, unknown> {
    if (!path) return obj;
    const segs = path.split(".");
    const root: Record<string, unknown> = { ...obj };
    let cur: Record<string, unknown> = root;
    const trail: Array<{ parent: Record<string, unknown>; key: string }> = [];

    for (let i = 0; i < segs.length - 1; i++) {
        const seg = segs[i];
        const existing = cur[seg];
        if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
            return root;
        }
        const next: Record<string, unknown> = { ...(existing as Record<string, unknown>) };
        cur[seg] = next;
        trail.push({ parent: cur, key: seg });
        cur = next;
    }
    delete cur[segs[segs.length - 1]];

    for (let i = trail.length - 1; i >= 0; i--) {
        const { parent, key } = trail[i];
        const v = parent[key] as Record<string, unknown>;
        if (v && Object.keys(v).length === 0) delete parent[key];
        else break;
    }
    return root;
}

/** Return true if the override object explicitly contains the given path. */
export function hasOverrideAtPath(obj: Record<string, unknown>, path: string): boolean {
    if (!path) return false;
    const segs = path.split(".");
    let cur: unknown = obj;
    for (let i = 0; i < segs.length; i++) {
        if (cur == null || typeof cur !== "object" || Array.isArray(cur)) return false;
        const rec = cur as Record<string, unknown>;
        if (!Object.prototype.hasOwnProperty.call(rec, segs[i])) return false;
        cur = rec[segs[i]];
    }
    return true;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Human labels                                                         */
/* ─────────────────────────────────────────────────────────────────── */

export function humanLabel(key: string): string {
    // Single shared humanizer (UX2-17) — kept as a named re-export because
    // variant UI imports it from this module.
    return humanizeFieldKey(key);
}

export function humanPath(path: string): string {
    return path
        .split(".")
        .map((seg) => humanLabel(seg))
        .join(" › ");
}

/* ─────────────────────────────────────────────────────────────────── */
/* Override summary for variant-list rows                                */
/* ─────────────────────────────────────────────────────────────────── */

function isI18nObject(o: Record<string, unknown>): boolean {
    const ks = Object.keys(o).sort();
    if (ks.length === 0) return false;
    for (const k of ks) {
        if (k !== "en" && k !== "ar" && k !== "ku") return false;
    }
    return true;
}

/**
 * Return the (up to `limit`) field-path names that the variant overrides,
 * comma-joined and pretty-printed. Walks the override object collecting
 * leaf paths. Treats I18nString-shaped objects as leaves.
 */
export function summarizeOverrides(
    override: Record<string, unknown>,
    limit = 3,
): string {
    const leaves: string[] = [];
    const walk = (val: unknown, prefix: string): void => {
        if (
            val != null &&
            typeof val === "object" &&
            !Array.isArray(val) &&
            !isI18nObject(val as Record<string, unknown>)
        ) {
            for (const k of Object.keys(val as Record<string, unknown>)) {
                walk((val as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k);
            }
            return;
        }
        if (prefix) leaves.push(prefix);
    };
    walk(override, "");
    if (leaves.length === 0) return "";
    if (leaves.length <= limit) {
        return leaves.map((p) => humanPath(p)).join(", ");
    }
    const shown = leaves.slice(0, limit).map((p) => humanPath(p));
    return `${shown.join(", ")} +${leaves.length - limit} more`;
}
