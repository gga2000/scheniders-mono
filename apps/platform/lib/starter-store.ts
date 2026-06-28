// =====================================================================
// Starter store seeder — onboarding Phase 1
// =====================================================================
// Turns the answers from the post-signup onboarding wizard into a full,
// valid `StoreConfigV2` that gets written to `store_config_v2_draft`, so
// the editor opens on a real, branded store instead of 16 empty pages.
//
// It composes two existing primitives:
//   - `emptyStoreConfigV2()` — the 16 default pages + empty brand kit.
//   - the home-page `PAGE_TEMPLATES` + `applyTemplate` (id rehash).
//
// Phase 1 seeds the HOME page (the first impression) plus store-level
// brand identity + commerce. Other pages stay empty for the merchant to
// fill — that's intentional, not a gap to paper over.
// =====================================================================

import { emptyStoreConfigV2 } from "@scheniders/shared";
import type {
    LocaleCode,
    PageId,
    SectionInstance,
    StoreConfigV2,
} from "@scheniders/shared";
import { PAGE_TEMPLATES, applyTemplate, getPageTemplate } from "./page-templates";
import { getManifestEntry } from "./sections-manifest";

/** Templates offered in the wizard's "pick a starter" step. */
export const STARTER_TEMPLATES = PAGE_TEMPLATES;

/**
 * Business verticals shown in the wizard's first "what do you sell?" step.
 * Each maps to the home template we recommend for that kind of store — the
 * merchant can still pick any template afterwards. `recommendedTemplateId`
 * must match a `STARTER_TEMPLATES` id (enforced by a unit test).
 */
export interface StarterVertical {
    id: string;
    label: string;
    /** Recommended `PageTemplate.id` for this vertical. */
    recommendedTemplateId: string;
}

export const STARTER_VERTICALS: StarterVertical[] = [
    { id: "fashion", label: "Fashion & apparel", recommendedTemplateId: "brand_story" },
    { id: "beauty", label: "Beauty & cosmetics", recommendedTemplateId: "product_launch" },
    { id: "electronics", label: "Electronics & gadgets", recommendedTemplateId: "minimal_catalog" },
    { id: "food", label: "Food & grocery", recommendedTemplateId: "iraqi_market_landing" },
    { id: "home_goods", label: "Home & furniture", recommendedTemplateId: "brand_story" },
    { id: "general", label: "Something else", recommendedTemplateId: "iraqi_market_landing" },
];

/** Recommended template id for a vertical, falling back to the first template. */
export function recommendedTemplateForVertical(verticalId: string): string {
    const v = STARTER_VERTICALS.find((x) => x.id === verticalId);
    return v?.recommendedTemplateId ?? STARTER_TEMPLATES[0]?.id ?? "";
}

export interface StarterStoreInput {
    /** Chosen `PageTemplate.id` (home starter pack). */
    templateId: string;
    /** Merchant's business name → brand identity + (template) hero copy. */
    businessName: string;
    /** Optional brand primary colour, `#rrggbb`. Invalid values are ignored. */
    brandColor?: string;
    /** Optional WhatsApp number → enables WhatsApp ordering. */
    whatsappNumber?: string;
    /**
     * Locales the store supports. First entry becomes `default_locale`.
     * Defaults to Arabic (the Iraq market default).
     */
    enabledLocales?: LocaleCode[];
}

/** `#rrggbb` only — keep it strict so a bad value can't poison the brand kit. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Baseline content seeded onto the supporting pages so a fresh store is
 * close to launch-ready, not just a home page. The policy pages each get a
 * `policy_content` section — that alone satisfies the ad-compliance health
 * checks (which only require ≥1 section) and unblocks publish.
 */
const SUPPORTING_PAGE_SECTIONS: Partial<Record<PageId, string[]>> = {
    about: ["about_block", "founder_note"],
    faq: ["faq_accordion"],
    policy_shipping: ["policy_content"],
    policy_returns: ["policy_content"],
    policy_privacy: ["policy_content"],
    policy_terms: ["policy_content"],
};

function freshSectionId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `sec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Instantiate a section from its manifest defaults with a fresh id. */
function makeSection(type: string): SectionInstance {
    const entry = getManifestEntry(type);
    if (!entry) throw new Error(`Missing manifest entry: ${type}`);
    return {
        id: freshSectionId(),
        type,
        enabled: true,
        base: JSON.parse(JSON.stringify(entry.defaultProps)),
    };
}

/**
 * Build a fully-populated `StoreConfigV2` draft from the wizard answers.
 * Pure + deterministic apart from the fresh section ids `applyTemplate`
 * mints, so it's safe to unit-test and to run on the client.
 */
export function buildStarterStoreConfigV2(
    input: StarterStoreInput,
): StoreConfigV2 {
    const cfg = emptyStoreConfigV2();

    // ── Brand identity ──────────────────────────────────────────────
    const name = input.businessName.trim();
    if (name) cfg.brand_kit.identity.name = name;
    if (input.brandColor && HEX_COLOR.test(input.brandColor)) {
        cfg.brand_kit.colors.primary = input.brandColor;
    }

    // ── Locales (Iraq → Arabic default) ─────────────────────────────
    const locales =
        input.enabledLocales && input.enabledLocales.length > 0
            ? input.enabledLocales
            : (["ar"] as LocaleCode[]);
    cfg.enabled_locales = locales;
    cfg.default_locale = locales[0];

    // ── Commerce / WhatsApp ─────────────────────────────────────────
    const whatsapp = input.whatsappNumber?.trim();
    if (whatsapp) {
        cfg.commerce = {
            ...(cfg.commerce ?? {}),
            whatsapp_number: whatsapp,
            enable_whatsapp_order: true,
        };
    }

    // ── Home page from the chosen template ──────────────────────────
    // Unknown template id → home stays empty (defensive; the wizard only
    // ever sends a known id).
    const template = getPageTemplate(input.templateId);
    if (template) {
        const home = cfg.pages.find((p) => p.page_id === "home");
        if (home) home.sections = applyTemplate(template);
    }

    // ── Supporting pages (about / faq / policies) ───────────────────
    for (const [pageId, types] of Object.entries(SUPPORTING_PAGE_SECTIONS)) {
        const page = cfg.pages.find((p) => p.page_id === pageId);
        if (page) page.sections = types.map(makeSection);
    }

    return cfg;
}
