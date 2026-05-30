/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import {
    FIELD_GROUPS,
    FIELD_GROUPS_ORDER,
    getFieldGroup,
    hasFieldGroups,
} from "./section-field-groups";

describe("section-field-groups", () => {
    it("groups hero_image fields correctly", () => {
        expect(getFieldGroup("hero_image", "title_i18n")).toBe("essential");
        expect(getFieldGroup("hero_image", "image_url")).toBe("essential");
        expect(getFieldGroup("hero_image", "cta_label_i18n")).toBe("essential");
        expect(getFieldGroup("hero_image", "cta_href")).toBe("logic");
        expect(getFieldGroup("hero_image", "eyebrow_i18n")).toBe("style");
        expect(getFieldGroup("hero_image", "secondary_cta_kind")).toBe("logic");
    });

    it("defaults unknown fields to 'style'", () => {
        expect(getFieldGroup("hero_image", "totally_made_up_field")).toBe("style");
    });

    it("returns 'style' for unregistered section types", () => {
        expect(getFieldGroup("brand_story", "title_i18n")).toBe("style");
        expect(getFieldGroup(undefined, "title_i18n")).toBe("style");
    });

    it("hasFieldGroups is true for covered types only", () => {
        expect(hasFieldGroups("hero_image")).toBe(true);
        expect(hasFieldGroups("trust_strip")).toBe(true);
        expect(hasFieldGroups("totally_unknown")).toBe(false);
        expect(hasFieldGroups(undefined)).toBe(false);
    });

    it("covers the 12 high-traffic section types named in the audit", () => {
        const required = [
            "hero_image",
            "trust_strip",
            "product_grid",
            "category_grid",
            "delivery_promise",
            "testimonials_carousel",
            "faq_accordion",
            "newsletter_inline",
            "cta_banner",
            "pdp_buy_box",
            "pdp_info_tabs",
            "feature_grid",
        ] as const;
        for (const type of required) {
            expect(FIELD_GROUPS[type]).toBeDefined();
            // Every covered type must classify at least one field as "essential"
            // so the Essentials accordion isn't empty for it.
            const groups = Object.values(FIELD_GROUPS[type]);
            expect(groups).toContain("essential");
        }
    });

    it("only resolves the top-level segment of nested paths", () => {
        // Nested fields inherit their top-level parent's group.
        expect(getFieldGroup("hero_image", "title_i18n.en")).toBe("essential");
        expect(getFieldGroup("hero_image", "secondary_cta_kind.something")).toBe(
            "logic",
        );
        // Order is deterministic for renderer ergonomics.
        expect(FIELD_GROUPS_ORDER).toEqual(["essential", "style", "logic"]);
    });
});
