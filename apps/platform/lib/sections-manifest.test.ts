// =====================================================================
// sections-manifest.test.ts — parity tests for the generated manifest
// =====================================================================
// Asserts that the manifest is an exact projection of BUILTIN_SECTIONS
// with no drift and no leaked render functions.
// =====================================================================

import { describe, expect, it } from "vitest";
import { BUILTIN_SECTIONS } from "@scheniders/sections";
import {
    SECTIONS_MANIFEST,
    getManifestEntry,
} from "@/lib/sections-manifest";

describe("sections-manifest parity", () => {
    it("(a) every BUILTIN_SECTIONS type appears in SECTIONS_MANIFEST", () => {
        const manifestTypes = new Set(SECTIONS_MANIFEST.map((e) => e.type));
        const missing = BUILTIN_SECTIONS.filter((def) => !manifestTypes.has(def.type)).map(
            (def) => def.type,
        );
        expect(missing).toEqual([]);
    });

    it("(a) every SECTIONS_MANIFEST type appears in BUILTIN_SECTIONS", () => {
        const registryTypes = new Set(BUILTIN_SECTIONS.map((def) => def.type));
        const extra = SECTIONS_MANIFEST.filter((e) => !registryTypes.has(e.type)).map(
            (e) => e.type,
        );
        expect(extra).toEqual([]);
    });

    it("(a) manifest and registry have the same count", () => {
        expect(SECTIONS_MANIFEST).toHaveLength(BUILTIN_SECTIONS.length);
    });

    it("(b) no manifest entry has a `render` key", () => {
        const withRender = SECTIONS_MANIFEST.filter(
            (e) => "render" in e && (e as Record<string, unknown>)["render"] !== undefined,
        ).map((e) => e.type);
        expect(withRender).toEqual([]);
    });

    it("(c) getManifestEntry('hero_image').schema is the exact same object as the real def's schema", () => {
        const manifestEntry = getManifestEntry("hero_image");
        expect(manifestEntry).toBeDefined();

        const realDef = BUILTIN_SECTIONS.find((d) => d.type === "hero_image");
        expect(realDef).toBeDefined();

        // Referential equality — same object, not a copy.
        expect(manifestEntry!.schema).toBe(realDef!.schema);
    });

    it("every manifest entry preserves type, category, name, description, thumbnail, valid_on, defaultProps", () => {
        for (const def of BUILTIN_SECTIONS) {
            const entry = getManifestEntry(def.type);
            expect(entry, `missing entry for ${def.type}`).toBeDefined();
            expect(entry!.type).toBe(def.type);
            expect(entry!.category).toBe(def.category);
            expect(entry!.name).toBe(def.name);
            expect(entry!.description).toBe(def.description);
            expect(entry!.thumbnail).toBe(def.thumbnail);
            expect(entry!.valid_on).toBe(def.valid_on);
            expect(entry!.defaultProps).toBe(def.defaultProps);
            expect(entry!.schema).toBe(def.schema);
        }
    });
});
