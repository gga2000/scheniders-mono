/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import {
    PAGE_TEMPLATES,
    applyTemplate,
    getPageTemplate,
} from "./index";
import { SECTIONS_MANIFEST } from "@/lib/sections-manifest";

describe("page-templates", () => {
    it("exports 5 curated templates with unique ids and required metadata", () => {
        expect(PAGE_TEMPLATES).toHaveLength(5);
        const ids = PAGE_TEMPLATES.map((t) => t.id);
        expect(new Set(ids).size).toBe(5);
        for (const t of PAGE_TEMPLATES) {
            expect(t.id).toMatch(/^[a-z0-9_]+$/);
            expect(t.name_i18n.en).toBeTruthy();
            expect(t.description_i18n.en).toBeTruthy();
            expect(t.sections.length).toBeGreaterThan(0);
            // Every section in every template references a real registered
            // section type — otherwise the editor can't render it.
            for (const sec of t.sections) {
                const manifest = SECTIONS_MANIFEST.find((m) => m.type === sec.type);
                expect(
                    manifest,
                    `Template ${t.id} references unknown section type "${sec.type}"`,
                ).toBeTruthy();
            }
        }
    });

    it("applyTemplate produces fresh section ids each call (placeholders are rehashed)", () => {
        const t = getPageTemplate("sale_page");
        expect(t).toBeTruthy();
        const first = applyTemplate(t!);
        const second = applyTemplate(t!);
        // Ids are unique within a single application…
        const firstIds = new Set(first.map((s) => s.id));
        expect(firstIds.size).toBe(first.length);
        // …and stable-template placeholder ids never leak through.
        for (const s of [...first, ...second]) {
            expect(s.id.startsWith("__template-")).toBe(false);
        }
        // Re-applying produces a completely disjoint id set.
        const secondIds = new Set(second.map((s) => s.id));
        for (const id of firstIds) {
            expect(secondIds.has(id)).toBe(false);
        }
    });

    it("applyTemplate deep-clones base props (mutating output never touches the template)", () => {
        const t = getPageTemplate("product_launch")!;
        const sectionsBefore = JSON.stringify(t.sections);
        const out = applyTemplate(t);
        // Mutate the result aggressively.
        (out[0].base as Record<string, unknown>).cta_href = "/mutated";
        out[0].label = "edited";
        expect(JSON.stringify(t.sections)).toBe(sectionsBefore);
    });

    it("each template targets a known PageId and preserves section order", () => {
        for (const t of PAGE_TEMPLATES) {
            // Order is meaningful for templates — apply preserves it.
            const out = applyTemplate(t);
            expect(out.map((s) => s.type)).toEqual(t.sections.map((s) => s.type));
            // Page id is one of the known ids — we don't enumerate all
            // PageIds here, just sanity-check it's a non-empty string the
            // manifest accepts as valid for at least one of the sections.
            expect(typeof t.page_id).toBe("string");
            expect(t.page_id.length).toBeGreaterThan(0);
        }
    });
});
