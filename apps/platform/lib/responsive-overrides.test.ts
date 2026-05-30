/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import type { SectionInstance, Variant } from "@scheniders/shared";
import {
    clearBreakpointOverride,
    findBreakpointVariant,
    getBreakpointOverride,
    hasBreakpointOverride,
    isBreakpointShortcutVariant,
    setBreakpointOverride,
} from "./responsive-overrides";

function makeInstance(variants: Variant[] = []): SectionInstance {
    return {
        id: "sec-1",
        type: "hero_image",
        enabled: true,
        base: {
            image_url: "https://base.example/x.png",
            title_i18n: { en: "Hello" },
        },
        variants,
    };
}

describe("responsive-overrides", () => {
    it("findBreakpointVariant returns null when no shortcut variant exists", () => {
        const inst = makeInstance([]);
        expect(findBreakpointVariant(inst, "mobile")).toBeNull();
    });

    it("findBreakpointVariant matches only the single-condition breakpoint variant", () => {
        const generic: Variant = {
            id: "v-generic",
            label: "Arabic + Mobile",
            conditions: [
                { kind: "locale", values: ["ar"] },
                { kind: "breakpoint", values: ["mobile"] },
            ],
            override: {},
            priority: 0,
        };
        const shortcut: Variant = {
            id: "bp-shortcut-mobile",
            label: "Mobile overrides",
            conditions: [{ kind: "breakpoint", values: ["mobile"] }],
            override: { image_url: "https://m.example/x.png" },
            priority: 0,
        };
        const inst = makeInstance([generic, shortcut]);

        expect(isBreakpointShortcutVariant(generic, "mobile")).toBe(false);
        expect(isBreakpointShortcutVariant(shortcut, "mobile")).toBe(true);
        expect(findBreakpointVariant(inst, "mobile")?.id).toBe("bp-shortcut-mobile");
        expect(findBreakpointVariant(inst, "tablet")).toBeNull();
    });

    it("setBreakpointOverride creates a shortcut variant when none exists", () => {
        const inst = makeInstance([]);
        const next = setBreakpointOverride(inst, "mobile", "image_url", "https://m.example/x.png");

        expect(next.variants).toHaveLength(1);
        const v = next.variants![0];
        expect(v.id).toBe("bp-shortcut-mobile");
        expect(v.label).toBe("Mobile overrides");
        expect(v.conditions).toEqual([{ kind: "breakpoint", values: ["mobile"] }]);
        expect(v.override).toEqual({ image_url: "https://m.example/x.png" });
        // Original instance untouched.
        expect(inst.variants).toEqual([]);
    });

    it("setBreakpointOverride updates the existing shortcut variant in place", () => {
        const inst = setBreakpointOverride(
            makeInstance([]),
            "mobile",
            "image_url",
            "https://first.example/x.png",
        );
        const updated = setBreakpointOverride(
            inst,
            "mobile",
            "image_url",
            "https://second.example/x.png",
        );
        expect(updated.variants).toHaveLength(1);
        expect(updated.variants![0].override).toEqual({
            image_url: "https://second.example/x.png",
        });

        // Adding a different field merges, not replaces.
        const merged = setBreakpointOverride(updated, "mobile", "title_i18n.en", "Hi mobile");
        expect(merged.variants).toHaveLength(1);
        expect(merged.variants![0].override).toEqual({
            image_url: "https://second.example/x.png",
            title_i18n: { en: "Hi mobile" },
        });
    });

    it("getBreakpointOverride / hasBreakpointOverride read nested values", () => {
        const inst = setBreakpointOverride(
            makeInstance([]),
            "tablet",
            "title_i18n.en",
            "Tablet headline",
        );
        expect(getBreakpointOverride(inst, "tablet", "title_i18n.en")).toBe(
            "Tablet headline",
        );
        expect(hasBreakpointOverride(inst, "tablet", "title_i18n.en")).toBe(true);
        expect(hasBreakpointOverride(inst, "tablet", "image_url")).toBe(false);
        expect(getBreakpointOverride(inst, "desktop", "title_i18n.en")).toBeUndefined();
    });

    it("clearBreakpointOverride removes the field and drops the variant when empty (use-base-value path)", () => {
        const inst = setBreakpointOverride(
            makeInstance([]),
            "mobile",
            "image_url",
            "https://m.example/x.png",
        );
        // Sanity.
        expect(inst.variants).toHaveLength(1);

        const cleared = clearBreakpointOverride(inst, "mobile", "image_url");
        expect(cleared.variants).toBeUndefined();
        expect(hasBreakpointOverride(cleared, "mobile", "image_url")).toBe(false);
    });

    it("clearBreakpointOverride keeps the variant when other overrides remain", () => {
        let inst = setBreakpointOverride(
            makeInstance([]),
            "mobile",
            "image_url",
            "https://m.example/x.png",
        );
        inst = setBreakpointOverride(inst, "mobile", "title_i18n.en", "Mobile hi");

        const cleared = clearBreakpointOverride(inst, "mobile", "image_url");
        expect(cleared.variants).toHaveLength(1);
        expect(cleared.variants![0].override).toEqual({
            title_i18n: { en: "Mobile hi" },
        });
        // Clearing the nested key removes the now-empty parent object.
        const cleared2 = clearBreakpointOverride(cleared, "mobile", "title_i18n.en");
        expect(cleared2.variants).toBeUndefined();
    });
});
