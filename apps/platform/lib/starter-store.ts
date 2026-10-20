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
    SectionInstance,
    StoreConfigV2,
} from "@scheniders/shared";
import { STORE_TEMPLATES, applyStoreTemplate, getStoreTemplate } from "./store-templates";
import { applyContentPack, packCategoryRows, resolveContentPack } from "./store-templates/content-packs";
import type { ContentPack, PackAttribute } from "./store-templates/content-packs";

/** Templates offered in the wizard's "pick a starter" step. */
export const STARTER_TEMPLATES = STORE_TEMPLATES;

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
    { id: "fashion", label: "Fashion & apparel", recommendedTemplateId: "cobalt_broadsheet" },
    { id: "beauty", label: "Beauty & cosmetics", recommendedTemplateId: "aurora_glass" },
    { id: "electronics", label: "Electronics & gadgets", recommendedTemplateId: "kinetic_ink" },
    { id: "food", label: "Food & grocery", recommendedTemplateId: "sunbleach" },
    { id: "home_goods", label: "Home & furniture", recommendedTemplateId: "cobalt_broadsheet" },
    { id: "general", label: "Something else", recommendedTemplateId: "sunbleach" },
];

/** Recommended template id for a vertical, falling back to the first template. */
export function recommendedTemplateForVertical(verticalId: string): string {
    const v = STARTER_VERTICALS.find((x) => x.id === verticalId);
    return v?.recommendedTemplateId ?? STARTER_TEMPLATES[0]?.id ?? "";
}

// Re-export from the server-safe module so client components that already
// import from starter-store keep working without a path change.
export type { WizardIndustry } from "./wizard-industry-types";
export { FALLBACK_INDUSTRIES } from "./wizard-industry-types";

/** Version of the direction stacks seeded today; bump when a direction's stacks change shape. */
export const STORE_TEMPLATE_VERSION = 1;

export interface StarterStoreInput {
    /** Chosen `PageTemplate.id` (home starter pack). */
    templateId: string;
    /**
     * Content pack id chosen (or derived from the industry). Wins over
     * `industryId` when both are present.
     */
    packId?: string;
    /**
     * Wizard vertical (e.g. "beauty", "electronics"). Drives the
     * industry copy pack so the seeded story/reviews/about read like
     * THIS store's vertical, never another one's. Unknown/absent ids
     * fall back to a neutral de-branded pack.
     */
    industryId?: string;
    /** Merchant's business name → brand identity + (template) hero copy. */
    businessName: string;
    /** Optional brand primary colour, `#rrggbb`. Invalid values are ignored. */
    brandColor?: string;
    /** Optional uploaded logo URL → brand_kit.identity.logo_url. */
    logoUrl?: string;
    /** Optional WhatsApp number → enables WhatsApp ordering. */
    whatsappNumber?: string;
    /**
     * Standard COD delivery fee (IQD). When > 0 it seeds the per-governorate
     * shipping engine's `default_rate`; otherwise the store falls back to the
     * legacy flat fee. The merchant sets this in the wizard — never guessed.
     */
    deliveryFeeIqd?: number;
    /** Cart subtotal (IQD) at/above which delivery is free. Ignored if ≤ 0. */
    freeDeliveryThresholdIqd?: number;
    /**
     * Locales the store supports. First entry becomes `default_locale`.
     * Defaults to Arabic (the Iraq market default).
     */
    enabledLocales?: LocaleCode[];
}

/** `#rrggbb` only — keep it strict so a bad value can't poison the brand kit. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Per-section field that should carry the merchant's business name, so the
 * seeded store reads like *their* store, not template filler. Keep this to
 * fields that are genuinely a brand label (the hero eyebrow), never the
 * curated marketing headline/body — that copy is a better starting point
 * than a bare store name.
 */
const BRAND_NAME_FIELD: Record<string, string> = {
    hero_image: "eyebrow_i18n",
};

/** Build an I18nString carrying the same name across the enabled locales. */
function nameI18n(name: string, locales: LocaleCode[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const locale of locales) out[locale] = name;
    return out;
}

/** Stamp the business name onto the brand-label field of matching sections. */
function personalizeSections(
    sections: SectionInstance[],
    name: string,
    locales: LocaleCode[],
): void {
    for (const section of sections) {
        const field = BRAND_NAME_FIELD[section.type];
        if (!field) continue;
        if (section.base && typeof section.base === "object") {
            (section.base as Record<string, unknown>)[field] = nameI18n(
                name,
                locales,
            );
        }
    }
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

    // ── Visual direction + every page the template covers ───────────
    // Applied FIRST because the template owns the whole brand kit: the
    // merchant's own colour below has to win over the template's primary,
    // not be overwritten by it. Unknown template id → the store stays on
    // the default kit with empty pages (defensive; the wizard only sends
    // known ids, and legacy ids resolve through LEGACY_TEMPLATE_ALIAS).
    const template = getStoreTemplate(input.templateId);
    if (template) applyStoreTemplate(cfg, template);

    // ── Brand identity ──────────────────────────────────────────────
    const name = input.businessName.trim();
    if (name) cfg.brand_kit.identity.name = name;
    if (input.brandColor && HEX_COLOR.test(input.brandColor)) {
        cfg.brand_kit.colors.primary = input.brandColor;
    }
    const logo = input.logoUrl?.trim();
    if (logo) cfg.brand_kit.identity.logo_url = logo;

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

    // ── Delivery (per-governorate engine default_rate) ──────────────
    const fee = input.deliveryFeeIqd;
    if (typeof fee === "number" && Number.isFinite(fee) && fee > 0) {
        const threshold = input.freeDeliveryThresholdIqd;
        const hasThreshold =
            typeof threshold === "number" &&
            Number.isFinite(threshold) &&
            threshold > 0;
        cfg.commerce = {
            ...(cfg.commerce ?? {}),
            shipping: {
                default_rate: {
                    fee_iqd: Math.round(fee),
                    ...(hasThreshold
                        ? { free_threshold_iqd: Math.round(threshold) }
                        : {}),
                },
            },
        };
    }

    // ── Content pack (UX-11 / W6.1) ─────────────────────────────────
    // After the direction so it overlays every seeded section; before
    // name-personalization so the brand-label stamp always wins.
    const pack = resolveContentPack(input.packId ?? input.industryId);
    applyContentPack(cfg, pack);
    cfg.template = {
        direction_id: template?.id ?? input.templateId,
        pack_id: pack.id,
        version: STORE_TEMPLATE_VERSION,
        applied_at: new Date().toISOString(),
    };

    // ── Personalize: stamp the business name onto brand-label fields ─
    if (name) {
        for (const page of cfg.pages) {
            personalizeSections(page.sections, name, cfg.enabled_locales);
        }
    }

    return cfg;
}

/**
 * The taxonomy a pack seeds beside the config: starter categories (which
 * the direction's tiles already link to) and the product attributes
 * shoppers filter by. Written by the seed endpoint under the member's RLS.
 */
export function starterTaxonomy(packId: string | undefined): {
    pack: ContentPack;
    categories: ReturnType<typeof packCategoryRows>;
    attribute_defs: PackAttribute[];
} {
    const pack = resolveContentPack(packId);
    return { pack, categories: packCategoryRows(pack), attribute_defs: pack.attributes };
}
