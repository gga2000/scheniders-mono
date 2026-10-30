// =====================================================================
// AutoForm schema introspection (extracted from auto-form, 4.3)
// =====================================================================
// Zod-walking helpers: unwrap optional/default wrappers, detect
// I18nString shapes, and infer the control descriptor (`FieldShape`)
// each field renders with. Pure — no React.
// =====================================================================

import { z } from "zod";

/* ─────────────────────────────────────────────────────────────────── */
/* Field shape introspection                                            */
/* ─────────────────────────────────────────────────────────────────── */

export type FieldShape =
    | { kind: "string"; hint?: string; isUrl?: boolean }
    | { kind: "number"; min?: number; max?: number; integer?: boolean }
    | { kind: "boolean" }
    | { kind: "enum"; options: string[] }
    | { kind: "literal"; value: unknown }
    | { kind: "array"; element: z.ZodType<unknown> }
    | { kind: "object"; shape: Record<string, z.ZodType<unknown>> }
    | { kind: "i18n_string" }
    | { kind: "unknown" };

export interface UnwrappedSchema {
    schema: z.ZodType<unknown>;
    optional: boolean;
    description?: string;
}

/** Unwrap `.optional()` / `.nullable()` and surface `.describe()` text. */
export function unwrap(schema: z.ZodType<unknown>): UnwrappedSchema {
    let current: z.ZodType<unknown> = schema;
    let optional = false;
    let description: string | undefined = current.description;

    // z.optional / z.nullable / z.default / z.catch produce wrappers with an
    // inner type. Walk through them until we hit something concrete. A
    // `.catch()` only changes how a bad stored value parses, so the field
    // keeps the control of the type it wraps.
    let safety = 0;
    while (safety++ < 8) {
        const defAny = current._def as { type?: string; innerType?: z.ZodType<unknown> };
        if (
            (defAny.type === "optional" ||
                defAny.type === "nullable" ||
                defAny.type === "default" ||
                defAny.type === "catch") &&
            defAny.innerType
        ) {
            optional = optional || defAny.type === "optional";
            current = defAny.innerType;
            if (!description) description = current.description;
            continue;
        }
        break;
    }

    return { schema: current, optional, description };
}

export function isI18nStringShape(shape: Record<string, z.ZodType<unknown>>): boolean {
    const keys = Object.keys(shape).sort().join(",");
    // Match the shape from apps/storefront/sections/_schema.ts — an object
    // with locale keys (en/ar/ku) where every value is an optional string.
    const expected = ["ar", "en", "ku"].sort().join(",");
    if (keys !== expected) return false;
    for (const k of Object.keys(shape)) {
        const inner = unwrap(shape[k]);
        const t = (inner.schema._def as { type?: string }).type;
        if (t !== "string") return false;
    }
    return true;
}

export function inferField(schema: z.ZodType<unknown>): {
    field: FieldShape;
    optional: boolean;
    description?: string;
} {
    const { schema: inner, optional, description } = unwrap(schema);
    const def = inner._def as unknown as Record<string, unknown>;
    const t = def.type as string | undefined;

    switch (t) {
        case "string": {
            // Detect URL via the .url() format check.
            const checks = (def.checks ?? []) as Array<{
                _def?: { format?: string };
                def?: { format?: string };
            }>;
            const isUrl = checks.some((c) => {
                const fmt = c._def?.format ?? c.def?.format;
                return fmt === "url";
            });
            return {
                field: { kind: "string", hint: description, isUrl },
                optional,
                description,
            };
        }
        case "number": {
            const checks = (def.checks ?? []) as Array<{
                _def?: { check?: string; value?: number; inclusive?: boolean };
                def?: { check?: string; value?: number; inclusive?: boolean };
            }>;
            let min: number | undefined;
            let max: number | undefined;
            let integer = false;
            for (const c of checks) {
                const d = c._def ?? c.def ?? {};
                if (d.check === "greater_than" && typeof d.value === "number") {
                    min = d.inclusive ? d.value : d.value + 1;
                } else if (d.check === "less_than" && typeof d.value === "number") {
                    max = d.inclusive ? d.value : d.value - 1;
                } else if (
                    d.check === "int" ||
                    (d as { format?: string }).format === "safeint"
                ) {
                    integer = true;
                }
            }
            // `minValue` / `maxValue` fallback for v4 helpers if present.
            const innerAny = inner as unknown as {
                minValue?: number;
                maxValue?: number;
                _def?: { format?: string };
            };
            if (min === undefined && typeof innerAny.minValue === "number") min = innerAny.minValue;
            if (max === undefined && typeof innerAny.maxValue === "number") max = innerAny.maxValue;
            if (innerAny._def?.format === "safeint") integer = true;
            return {
                field: { kind: "number", min, max, integer },
                optional,
                description,
            };
        }
        case "boolean":
            return { field: { kind: "boolean" }, optional, description };
        case "enum": {
            const entries = def.entries as Record<string, string> | undefined;
            const opts = entries
                ? Object.values(entries)
                : ((def.options ?? []) as string[]);
            return {
                field: { kind: "enum", options: opts },
                optional,
                description,
            };
        }
        case "literal": {
            const values = def.values as unknown[] | undefined;
            return {
                field: { kind: "literal", value: values?.[0] },
                optional,
                description,
            };
        }
        case "array": {
            const element = def.element as z.ZodType<unknown>;
            return {
                field: { kind: "array", element },
                optional,
                description,
            };
        }
        case "object": {
            const shape = (inner as unknown as { shape: Record<string, z.ZodType<unknown>> })
                .shape;
            if (isI18nStringShape(shape)) {
                return { field: { kind: "i18n_string" }, optional, description };
            }
            return {
                field: { kind: "object", shape },
                optional,
                description,
            };
        }
        default:
            return { field: { kind: "unknown" }, optional, description };
    }
}

