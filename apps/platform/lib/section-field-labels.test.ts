import { describe, expect, it } from "vitest";
import { getSection } from "@scheniders/sections";
import { schenidersSignatureTemplate } from "@/lib/store-templates/scheniders-signature";
import {
    humanizeFieldKey,
    resolveEnumValueLabel,
    resolveFieldLabel,
} from "@/lib/section-field-meta";

/** Keys of a localized-text object; the form shows them as locale tabs, not labels. */
const LOCALE_KEYS = new Set(["en", "ar", "ku"]);

/** Wrappers the form sees through to reach a field's real shape. */
const WRAPPERS = new Set([
    "optional",
    "nullable",
    "default",
    "catch",
    "readonly",
    "pipe",
    "prefault",
    "nonoptional",
]);

interface ZodDefLike {
    type: string;
    innerType?: unknown;
    in?: unknown;
    shape?: Record<string, unknown>;
    element?: unknown;
    entries?: Record<string, string>;
}

function defOf(schema: unknown): ZodDefLike | undefined {
    const s = schema as { _zod?: { def?: ZodDefLike } } | undefined;
    return s?._zod?.def;
}

function unwrap(schema: unknown): ZodDefLike | undefined {
    let d = defOf(schema);
    while (d && WRAPPERS.has(d.type)) d = defOf(d.innerType ?? d.in);
    return d;
}

function collect(schema: unknown, fields: Set<string>, options: Set<string>): void {
    const d = unwrap(schema);
    if (!d) return;
    if (d.type === "object" && d.shape) {
        for (const [key, child] of Object.entries(d.shape)) {
            if (!LOCALE_KEYS.has(key)) fields.add(key);
            collect(child, fields, options);
        }
    } else if (d.type === "array") {
        collect(d.element, fields, options);
    } else if (d.type === "enum" && d.entries) {
        for (const v of Object.values(d.entries)) options.add(v);
    }
}

function templateSectionTypes(): string[] {
    const tpl = schenidersSignatureTemplate;
    const types = new Set<string>();
    for (const sections of Object.values(tpl.pages)) {
        for (const s of sections ?? []) types.add(s.type);
    }
    for (const g of Object.values(tpl.globals)) if (g) types.add(g.type);
    return [...types].sort();
}

describe("section field labels — signature template sections", () => {
    const fields = new Set<string>();
    const options = new Set<string>();
    for (const type of templateSectionTypes()) {
        const def = getSection(type as never) as { schema?: unknown } | undefined;
        collect(def?.schema, fields, options);
    }

    it("finds the template's fields (guards the schema walk itself)", () => {
        expect(fields.size).toBeGreaterThan(100);
        expect(options.size).toBeGreaterThan(30);
    });

    it("every field has a real Arabic label, not the English key", () => {
        const missing = [...fields].filter(
            (k) => resolveFieldLabel(undefined, k, "ar") === humanizeFieldKey(k),
        );
        expect(missing).toEqual([]);
    });

    it("every option has a real Arabic label, not the English value", () => {
        const missing = [...options].filter(
            (v) => resolveEnumValueLabel(v, "ar") === humanizeFieldKey(v),
        );
        expect(missing).toEqual([]);
    });
});
