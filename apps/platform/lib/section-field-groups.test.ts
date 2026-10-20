/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import {
    FIELD_GROUPS_ORDER,
    getFieldGroup,
    getFieldGroupForMode,
    hasFieldGroups,
    isFieldVisible,
} from "./section-field-groups";

// ─────────────────────────────────────────────────────────────────────
// Convention-based classifier tests
// ─────────────────────────────────────────────────────────────────────
// These test the real field names from packages/sections/src/*.tsx
// as discovered in the Phase-4 Task-3 audit. sectionType is ignored by
// getFieldGroup — classification is purely by field name convention.

describe("getFieldGroup — essential (content) fields", () => {
    it.each([
        // i18n text fields
        "heading_i18n",
        "title_i18n",
        "subtitle_i18n",
        "body_i18n",
        "cta_label_i18n",
        "secondary_cta_label_i18n",
        "placeholder_i18n",
        "success_message_i18n",
        "eyebrow_i18n",
        "paragraphs_i18n",
        "messages_i18n",
        "quote_i18n",
        "expired_label_i18n",
        // Repeatable items arrays
        "items",
        "pills",
        "tabs",
        "logos",
        "images",
        // Image / media fields (essential: primary content images)
        "image_url",
        "video_url",
        "poster_url",
        "accent_image_url",
        "photo_url",
        "signature_image_url",
        "gift_image_url",
        // Data payload fields
        "governorates_covered",
        "baghdad_hours",
        "provinces_hours",
        "founder_name_i18n",
        "founder_role_i18n",
    ])("classifies '%s' as essential", (key) => {
        expect(getFieldGroup(undefined, key)).toBe("essential");
    });
});

describe("getFieldGroup — logic (wiring / behaviour) fields", () => {
    it.each([
        // _href suffix
        "cta_href",
        "link_href",
        "primary_href",
        "secondary_href",
        // _kind suffix
        "secondary_cta_kind",
        "cta_kind",
        "secondary_kind",
        // _value suffix
        "secondary_cta_value",
        // _id / _ids suffixes
        "category_id",
        "list_id",
        "product_ids",
        "manual_product_ids",  // also matches manual_ prefix
        // exact matches
        "mode",
        "source",
        "query",
        "analytics_tag",
        "limit",
        "max_items",
        "redirect_path",
        "discount_code",
        "triggered_after_seconds",
        "allow_multiple",
        "countdown_to_iso",
        "target_iso",
        "threshold_iqd",
        "handle",
        "layout",
        // manual_ prefix
        "manual_product_ids",
        // pinned_ prefix
        "pinned_product_ids",
    ])("classifies '%s' as logic", (key) => {
        expect(getFieldGroup(undefined, key)).toBe("logic");
    });
});

describe("getFieldGroup — style (presentation) fields", () => {
    it.each([
        // exact matches
        "bg",
        "bg_tint",
        "background_tint",
        "tint",
        "align",
        "alignment",
        "columns",
        "density",
        "scale",
        "autoplay",
        "rotation",
        "speed",
        "image_position",
        "overlay_opacity",
        "scribble_color",
        // show_ prefix
        "show_compare_price",
        "show_variant_picker",
        "show_qty_stepper",
        "show_avatars",
        "show_prices",
        "show_total",
        // bg_ / background_ prefix
        "bg_tint",
        "background_image_url",  // background_ prefix → style (decorative bg, not content image)
        // _style / _color / _intensity / _opacity suffixes
        "icon_style",
        "font_color",
        "shadow_intensity",
        "overlay_opacity",
    ])("classifies '%s' as style", (key) => {
        expect(getFieldGroup(undefined, key)).toBe("style");
    });
});

describe("getFieldGroup — specific cross-section spot checks", () => {
    it("correctly classifies hero_image fields (sectionType ignored)", () => {
        expect(getFieldGroup("hero_image", "heading_i18n")).toBe("essential");
        expect(getFieldGroup("hero_image", "title_i18n")).toBe("essential");
        expect(getFieldGroup("hero_image", "image_url")).toBe("essential");
        expect(getFieldGroup("hero_image", "cta_label_i18n")).toBe("essential");
        expect(getFieldGroup("hero_image", "cta_href")).toBe("logic");
        expect(getFieldGroup("hero_image", "secondary_cta_kind")).toBe("logic");
        expect(getFieldGroup("hero_image", "secondary_cta_value")).toBe("logic");
        expect(getFieldGroup("hero_image", "secondary_cta_label_i18n")).toBe("essential");
    });

    it("correctly classifies product_grid fields", () => {
        expect(getFieldGroup("product_grid", "heading_i18n")).toBe("essential");
        expect(getFieldGroup("product_grid", "mode")).toBe("logic");
        expect(getFieldGroup("product_grid", "query")).toBe("logic");
        expect(getFieldGroup("product_grid", "manual_product_ids")).toBe("logic");
        expect(getFieldGroup("product_grid", "pinned_product_ids")).toBe("logic");
        expect(getFieldGroup("product_grid", "scribble_color")).toBe("style");
    });

    it("correctly classifies cta_banner fields", () => {
        expect(getFieldGroup("cta_banner", "heading_i18n")).toBe("essential");
        expect(getFieldGroup("cta_banner", "sub_i18n")).toBe("essential");
        expect(getFieldGroup("cta_banner", "cta_label_i18n")).toBe("essential");
        expect(getFieldGroup("cta_banner", "cta_href")).toBe("logic");
        expect(getFieldGroup("cta_banner", "bg_tint")).toBe("style");
        expect(getFieldGroup("cta_banner", "align")).toBe("style");
    });

    it("correctly classifies pdp_buy_box fields", () => {
        expect(getFieldGroup("pdp_buy_box", "add_to_cart_label_i18n")).toBe("essential");
        expect(getFieldGroup("pdp_buy_box", "show_compare_price")).toBe("style");
        expect(getFieldGroup("pdp_buy_box", "show_variant_picker")).toBe("style");
        expect(getFieldGroup("pdp_buy_box", "show_qty_stepper")).toBe("style");
    });

    it("correctly classifies exit_intent_offer fields", () => {
        expect(getFieldGroup("exit_intent_offer", "heading_i18n")).toBe("essential");
        expect(getFieldGroup("exit_intent_offer", "body_i18n")).toBe("essential");
        expect(getFieldGroup("exit_intent_offer", "cta_href")).toBe("logic");
        expect(getFieldGroup("exit_intent_offer", "discount_code")).toBe("logic");
        expect(getFieldGroup("exit_intent_offer", "triggered_after_seconds")).toBe("logic");
    });

    it("correctly classifies sticky_cta_bar fields", () => {
        expect(getFieldGroup("sticky_cta_bar", "primary_label_i18n")).toBe("essential");
        expect(getFieldGroup("sticky_cta_bar", "primary_href")).toBe("logic");
        expect(getFieldGroup("sticky_cta_bar", "secondary_kind")).toBe("logic");
        expect(getFieldGroup("sticky_cta_bar", "show_total")).toBe("style");
    });

    it("correctly classifies newsletter_inline fields", () => {
        expect(getFieldGroup("newsletter_inline", "heading_i18n")).toBe("essential");
        expect(getFieldGroup("newsletter_inline", "list_id")).toBe("logic");
        expect(getFieldGroup("newsletter_inline", "analytics_tag")).toBe("logic");
        expect(getFieldGroup("newsletter_inline", "bg")).toBe("style");
    });

    it("correctly classifies instagram_grid fields", () => {
        expect(getFieldGroup("instagram_grid", "items")).toBe("essential");
        expect(getFieldGroup("instagram_grid", "columns")).toBe("style");
        expect(getFieldGroup("instagram_grid", "handle")).toBe("logic");
    });
});

describe("getFieldGroup — dot-joined paths resolve leading segment only", () => {
    it("resolves 'title_i18n.en' to essential (same as 'title_i18n')", () => {
        expect(getFieldGroup("hero_image", "title_i18n.en")).toBe("essential");
    });

    it("resolves 'secondary_cta_kind.something' to logic", () => {
        expect(getFieldGroup("hero_image", "secondary_cta_kind.something")).toBe("logic");
    });

    it("resolves 'bg_tint.inner' to style", () => {
        expect(getFieldGroup("cta_banner", "bg_tint.inner")).toBe("style");
    });
});

describe("getFieldGroup — undefined sectionType is accepted (backward compat)", () => {
    it("still classifies by field name when sectionType is undefined", () => {
        expect(getFieldGroup(undefined, "heading_i18n")).toBe("essential");
        expect(getFieldGroup(undefined, "cta_href")).toBe("logic");
        expect(getFieldGroup(undefined, "bg_tint")).toBe("style");
        expect(getFieldGroup(undefined, "analytics_tag")).toBe("logic");
        expect(getFieldGroup(undefined, "manual_product_ids")).toBe("logic");
        expect(getFieldGroup(undefined, "items")).toBe("essential");
    });
});

describe("hasFieldGroups", () => {
    it("returns true for all 45 known section types", () => {
        const knownTypes = [
            "about_block", "accordion_richtext", "brand_story",
            "cart_line_items", "cart_summary", "category_grid",
            "checkout_form", "checkout_order_summary", "countdown_card",
            "cta_banner", "delivery_promise", "exit_intent_offer",
            "faq_accordion", "feature_grid", "founder_note",
            "free_gift_strip", "hero_image", "hero_marquee",
            "hero_split", "hero_video", "html_embed", "image_gallery",
            "instagram_grid", "logo_strip", "marquee_strip",
            "newsletter_inline", "numbers_stat_strip", "order_tracker",
            "pdp_add_to_cart", "pdp_buy_box", "pdp_gallery",
            "pdp_info_block", "pdp_info_tabs", "pdp_related_products",
            "pdp_variants", "policy_content", "press_quotes",
            "product_grid", "promo_banner", "search_results_grid",
            "sticky_cta_bar", "testimonials_carousel", "track_order_lookup",
            "trust_strip", "video_block",
        ];
        for (const type of knownTypes) {
            expect(hasFieldGroups(type), `expected hasFieldGroups('${type}') to be true`).toBe(true);
        }
    });

    it("returns false for unknown/unregistered section types", () => {
        expect(hasFieldGroups("totally_unknown")).toBe(false);
        expect(hasFieldGroups("")).toBe(false);
    });

    it("returns false when sectionType is undefined", () => {
        expect(hasFieldGroups(undefined)).toBe(false);
    });
});

describe("FIELD_GROUPS_ORDER", () => {
    it("is deterministic and in the expected render order", () => {
        expect(FIELD_GROUPS_ORDER).toEqual(["essential", "style", "logic"]);
    });
});

// ─────────────────────────────────────────────────────────────────────
// Simple ⇄ Advanced mode — isFieldVisible
// ─────────────────────────────────────────────────────────────────────

describe("isFieldVisible", () => {
    it("advanced mode shows every field", () => {
        expect(isFieldVisible("advanced", "hero_image", "cta_href")).toBe(true);
        expect(isFieldVisible("advanced", "product_grid", "manual_skus")).toBe(true);
        expect(isFieldVisible("advanced", undefined, "analytics_tag")).toBe(true);
    });

    it("simple mode hides logic-group fields and keeps essential/style", () => {
        expect(isFieldVisible("simple", "hero_image", "analytics_tag")).toBe(false);
        expect(isFieldVisible("simple", "product_grid", "query")).toBe(false);
        expect(isFieldVisible("simple", "hero_image", "title_i18n")).toBe(true);
        expect(isFieldVisible("simple", "hero_image", "image_url")).toBe(true);
        expect(isFieldVisible("simple", "hero_image", "align")).toBe(true);
    });

    it("UX2-01: merchant-essential wiring stays visible in Simple", () => {
        // A button whose text is editable must have an editable target.
        expect(isFieldVisible("simple", "hero_image", "cta_href")).toBe(true);
        expect(isFieldVisible("simple", "hero_image", "secondary_cta_kind")).toBe(true);
        expect(isFieldVisible("simple", "hero_image", "secondary_cta_value")).toBe(true);
        // Grids need their product picker; countdowns need their date.
        expect(isFieldVisible("simple", "product_grid", "product_ids")).toBe(true);
        expect(isFieldVisible("simple", "product_grid", "manual_skus")).toBe(true);
        expect(isFieldVisible("simple", "countdown_card", "countdown_to_iso")).toBe(true);
        expect(isFieldVisible("simple", "free_gift_strip", "threshold_iqd")).toBe(true);
        expect(isFieldVisible("simple", "exit_intent_offer", "discount_code")).toBe(true);
        expect(isFieldVisible("simple", "category_grid", "category_id")).toBe(true);
    });

    it("UX2-01: whitelisted wiring is promoted into the essential group in Simple", () => {
        expect(getFieldGroupForMode("simple", "hero_image", "cta_href")).toBe("essential");
        expect(getFieldGroupForMode("simple", "product_grid", "product_ids")).toBe("essential");
        // Advanced keeps the true classification.
        expect(getFieldGroupForMode("advanced", "hero_image", "cta_href")).toBe("logic");
        // Non-whitelisted keys keep their group in Simple too.
        expect(getFieldGroupForMode("simple", "hero_image", "title_i18n")).toBe("essential");
        expect(getFieldGroupForMode("simple", "hero_image", "align")).toBe("style");
    });

    it("UX2-16: raw HTML is Advanced-only", () => {
        expect(isFieldVisible("simple", "html_embed", "html")).toBe(false);
        expect(isFieldVisible("advanced", "html_embed", "html")).toBe(true);
    });

    it("unknown section types never hide fields they can't misclassify as logic", () => {
        // Fallback safety: unknown types still classify by name only —
        // an essential-named field stays visible.
        expect(isFieldVisible("simple", "totally_unknown", "title_i18n")).toBe(true);
    });

    it("every known section keeps at least one Simple-visible field", async () => {
        const { SECTIONS_MANIFEST } = await import("./sections-manifest");
        for (const entry of SECTIONS_MANIFEST) {
            const def = (entry.schema as unknown as { _def?: { type?: string } })._def;
            if (def?.type !== "object") continue;
            const shape = (entry.schema as unknown as {
                shape: Record<string, unknown>;
            }).shape;
            const visible = Object.keys(shape).filter((k) =>
                isFieldVisible("simple", entry.type, k),
            );
            expect(
                visible.length,
                `section '${entry.type}' has NO Simple-visible fields`,
            ).toBeGreaterThan(0);
        }
        // The dynamic import loads every section's module and schema — about
        // a second alone, and well past vitest's 5s default when the suite
        // shares the machine with lint, type-check and build in one CI run.
    }, 30_000);
});
