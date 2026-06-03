// =====================================================================
// Legacy StoreConfig  →  StoreConfigV2 mapper
// =====================================================================
// Pure, deterministic, idempotent. Given the same legacy input, always
// returns the same v2 output. No I/O, no random ids (we derive stable
// ids from section content + page-id + slot).
// =====================================================================

import type {
  StoreConfig,
  SchneidersConfig,
  TestimonialConfig,
  TrustPillConfig,
  PromoBarConfig,
  AnalyticsConfig,
  NewsletterPopupConfig,
  HeroConfig,
  AboutConfig,
  SectionConfig,
  DesignTokens,
} from "@scheniders/shared/types";
import type {
  StoreConfigV2,
  SectionInstance,
  PageConfig,
  PageId,
  BrandKit,
  GlobalSections,
  I18nString,
  StoreCommerceConfig,
} from "@scheniders/shared/types";
// Value imports must resolve to the source module, not a barrel that the
// node ESM loader can't statically map. Use the resolver module directly.
import {
  EMPTY_BRAND_KIT,
  emptyStoreConfigV2,
} from "../../packages/shared/src/types/store-config-v2-resolver";

/* ─────────────────────────────────────────────────────────────────── */
/* Stable id derivation                                                */
/* ─────────────────────────────────────────────────────────────────── */

// FNV-1a 32-bit hash → hex. Deterministic & dep-free. Used to derive
// stable SectionInstance ids so that re-running the migration produces
// byte-identical output (idempotence requirement).
function stableId(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `mig_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

/* ─────────────────────────────────────────────────────────────────── */
/* i18n helpers                                                        */
/* ─────────────────────────────────────────────────────────────────── */

function en(value: string | undefined | null): I18nString | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return { en: value };
}

function enRequired(value: string | undefined | null): I18nString {
  return { en: value ?? "" };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Brand kit mapping                                                   */
/* ─────────────────────────────────────────────────────────────────── */

const CANDY_DEFAULT_COLORS = {
  primary: "#ff5a8a",
  secondary: "#7cf0bd",
  accent: "#ffd84a",
  surface: "#fff7ed",
  ink: "#1a1a1a",
};

type LegacyRadius = NonNullable<DesignTokens["radius"]>;
type LegacySpacing = NonNullable<DesignTokens["spacing"]>;
type LegacyShadows = NonNullable<DesignTokens["shadows"]>;

const RADIUS_MAP: Record<LegacyRadius, BrandKit["shape"]["radius"]> = {
  none: "none",
  sm: "soft",
  md: "soft",
  lg: "round",
  full: "pill",
};

const SPACING_MAP: Record<LegacySpacing, BrandKit["typography"]["scale"]> = {
  compact: "compact",
  comfortable: "comfortable",
  spacious: "spacious",
};

const SHADOWS_MAP: Record<LegacyShadows, BrandKit["shape"]["shadow_style"]> = {
  flat: "flat",
  subtle: "soft",
  elevated: "elevated",
};

function mapBrandKit(legacy: StoreConfig): BrandKit {
  const tokens = legacy.design_tokens ?? {};
  const colors = tokens.colors;
  const fonts = tokens.fonts;

  const identity: BrandKit["identity"] = {
    ...EMPTY_BRAND_KIT.identity,
  };
  if (legacy.logo_url) identity.logo_url = legacy.logo_url;
  if (legacy.seo?.og_image_url) identity.og_image_url = legacy.seo.og_image_url;

  return {
    identity,
    colors: {
      primary: colors?.primary ?? CANDY_DEFAULT_COLORS.primary,
      secondary: colors?.secondary ?? CANDY_DEFAULT_COLORS.secondary,
      accent: colors?.accent ?? CANDY_DEFAULT_COLORS.accent,
      surface: colors?.background ?? CANDY_DEFAULT_COLORS.surface,
      surface_alt: EMPTY_BRAND_KIT.colors.surface_alt,
      ink: colors?.text ?? CANDY_DEFAULT_COLORS.ink,
      success: EMPTY_BRAND_KIT.colors.success,
      danger: EMPTY_BRAND_KIT.colors.danger,
    },
    typography: {
      display: fonts?.heading ?? EMPTY_BRAND_KIT.typography.display,
      body: fonts?.body ?? EMPTY_BRAND_KIT.typography.body,
      scale: tokens.spacing
        ? SPACING_MAP[tokens.spacing]
        : EMPTY_BRAND_KIT.typography.scale,
    },
    shape: {
      radius: tokens.radius ? RADIUS_MAP[tokens.radius] : EMPTY_BRAND_KIT.shape.radius,
      border_thickness: EMPTY_BRAND_KIT.shape.border_thickness,
      shadow_style: tokens.shadows
        ? SHADOWS_MAP[tokens.shadows]
        : EMPTY_BRAND_KIT.shape.shadow_style,
      rotation_intensity: mapWedgeIntensity(legacy.schneiders?.wedge_intensity),
    },
    motion: { ...EMPTY_BRAND_KIT.motion },
    voice: { ...EMPTY_BRAND_KIT.voice },
  };
}

function mapWedgeIntensity(
  wi: SchneidersConfig["wedge_intensity"],
): BrandKit["shape"]["rotation_intensity"] {
  if (!wi) return EMPTY_BRAND_KIT.shape.rotation_intensity;
  return wi;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Section builders                                                    */
/* ─────────────────────────────────────────────────────────────────── */

function buildHeroSection(hero: HeroConfig | undefined): SectionInstance | null {
  if (!hero) return null;
  // If literally everything is empty/undefined, skip — nothing to migrate.
  const hasAnyContent =
    !!hero.title || !!hero.subtitle || !!hero.cta_text || !!hero.image_url;
  if (!hasAnyContent) return null;

  return {
    id: stableId(`home:hero:${hero.title ?? ""}:${hero.image_url ?? ""}`),
    type: "hero_image",
    enabled: true,
    label: "Hero",
    base: {
      title_i18n: enRequired(hero.title),
      subtitle_i18n: enRequired(hero.subtitle),
      // Section registry uses `cta_label_i18n` + `cta_href` (Agent D).
      cta_label_i18n: enRequired(hero.cta_text),
      cta_href: "#products",
      image_url: hero.image_url ?? undefined,
      secondary_cta_kind: hero.secondary_cta_kind ?? "none",
    },
  };
}

function buildAboutSection(about: AboutConfig | undefined): SectionInstance | null {
  if (!about) return null;
  const hasAnyContent = !!about.title || !!about.body;
  if (!hasAnyContent) return null;

  return {
    id: stableId(`home:about:${about.title ?? ""}`),
    type: "about_block",
    enabled: about.enabled !== false,
    label: "About",
    base: {
      title_i18n: enRequired(about.title),
      body_i18n: enRequired(about.body),
      // about_block schema requires image_position; legacy About had none.
      image_position: "right" as const,
    },
  };
}

function buildTrustStripSection(
  pills: TrustPillConfig[] | undefined,
): SectionInstance | null {
  if (!pills || pills.length === 0) return null;
  return {
    id: stableId(`home:trust_strip:${pills.length}`),
    type: "trust_strip",
    enabled: true,
    label: "Trust strip",
    base: {
      pills: pills.map((p) => ({
        label_i18n: enRequired(p.label),
        icon: p.icon ?? "",
        bg: p.bg ?? "mint",
        enabled: p.enabled !== false,
      })),
    },
  };
}

function buildTestimonialCardSection(
  t: TestimonialConfig | undefined,
): SectionInstance | null {
  if (!t) return null;
  const hasAnyContent = !!t.quote || !!t.reviewer_name || !!t.avatar_url;
  if (!hasAnyContent) return null;

  return {
    id: stableId(`home:testimonial:${t.reviewer_name ?? ""}:${t.quote?.slice(0, 32) ?? ""}`),
    type: "testimonial_card",
    enabled: t.enabled !== false,
    label: "Customer testimonial",
    base: {
      enabled: t.enabled !== false,
      quote_i18n: enRequired(t.quote),
      reviewer_name_i18n: enRequired(t.reviewer_name),
      reviewer_city_i18n: enRequired(t.reviewer_city),
      avatar_url: t.avatar_url ?? "",
      rating: t.rating ?? 5,
      badge_text_i18n: enRequired(t.badge_text),
    },
  };
}

// Dynamic sections preserve their original `data` shape verbatim under `base`.
// This is the "lift and shift" path — no field-by-field i18n migration here
// because the storefront still reads these via the legacy renderer until the
// section editor v2 ships per-type editors.
function buildDynamicSection(sc: SectionConfig): SectionInstance {
  return {
    id: stableId(`home:dyn:${sc.id}:${sc.type}`),
    type: sc.type,
    enabled: sc.enabled !== false,
    label: sc.type,
    base: {
      ...(sc.data ?? {}),
      // Preserve the original legacy id so we can cross-reference if needed.
      __legacy_id: sc.id,
      __legacy_variant: sc.variant,
    },
  };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Globals                                                             */
/* ─────────────────────────────────────────────────────────────────── */

function buildPromoBarGlobal(pb: PromoBarConfig | undefined): SectionInstance | undefined {
  if (!pb) return undefined;
  const messages = pb.messages ?? [];
  if (messages.length === 0 && pb.enabled === undefined) return undefined;
  return {
    id: stableId(`global:promo_bar:${messages.length}`),
    type: "promo_bar",
    enabled: pb.enabled !== false,
    label: "Promo bar",
    base: {
      messages_i18n: messages.map((m) => enRequired(m)),
    },
  };
}

function buildAnalyticsGlobal(a: AnalyticsConfig | undefined): SectionInstance | undefined {
  if (!a) return undefined;
  const hasAny =
    !!a.meta_pixel_id ||
    !!a.tiktok_pixel_id ||
    !!a.google_analytics_id ||
    !!a.snapchat_pixel_id ||
    !!a.gtm_container_id;
  if (!hasAny) return undefined;
  return {
    id: stableId(`global:analytics:${a.meta_pixel_id ?? ""}:${a.gtm_container_id ?? ""}`),
    type: "analytics_pixels",
    enabled: true,
    label: "Analytics pixels",
    base: {
      meta_pixel_id: a.meta_pixel_id ?? "",
      tiktok_pixel_id: a.tiktok_pixel_id ?? "",
      google_analytics_id: a.google_analytics_id ?? "",
      snapchat_pixel_id: a.snapchat_pixel_id ?? "",
      gtm_container_id: a.gtm_container_id ?? "",
    },
  };
}

function buildNewsletterPopupGlobal(
  n: NewsletterPopupConfig | undefined,
): SectionInstance | undefined {
  if (!n) return undefined;
  if (n.enabled === undefined && !n.label && !n.discount_iqd) return undefined;
  return {
    id: stableId(`global:newsletter_popup:${n.label ?? ""}`),
    type: "newsletter_popup",
    enabled: n.enabled === true,
    label: "Newsletter popup",
    base: {
      label_i18n: enRequired(n.label),
      discount_iqd: n.discount_iqd ?? 0,
      popup_after_seconds: n.popup_after_seconds ?? 30,
      popup_after_pages: n.popup_after_pages ?? 1,
    },
  };
}

function buildFooterGlobal(
  contact: StoreConfig["contact"] | undefined,
): SectionInstance | undefined {
  if (!contact) return undefined;
  const { instagram, facebook, tiktok, email } = contact;
  if (!instagram && !facebook && !tiktok && !email) return undefined;
  return {
    id: stableId(`global:footer:${instagram ?? ""}:${facebook ?? ""}:${tiktok ?? ""}:${email ?? ""}`),
    type: "footer",
    enabled: true,
    base: {
      ...(instagram ? { instagram } : {}),
      ...(facebook ? { facebook } : {}),
      ...(tiktok ? { tiktok } : {}),
      ...(email ? { email } : {}),
    },
  };
}

function mapGlobals(legacy: StoreConfig): GlobalSections {
  const sch = legacy.schneiders ?? {};
  const globals: GlobalSections = {};
  const promoBar = buildPromoBarGlobal(sch.promo_bar);
  if (promoBar) globals.promo_bar = promoBar;
  const analytics = buildAnalyticsGlobal(sch.analytics);
  if (analytics) globals.analytics_pixels = analytics;
  const popup = buildNewsletterPopupGlobal(sch.newsletter_popup);
  if (popup) globals.newsletter_popup = popup;
  const footer = buildFooterGlobal(legacy.contact);
  if (footer) globals.footer = footer;
  return globals;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Commerce config mapping                                             */
/* ─────────────────────────────────────────────────────────────────── */

function mapCommerce(legacy: StoreConfig): StoreCommerceConfig | undefined {
  const contact = legacy.contact;
  const sch = legacy.schneiders ?? {};

  // whatsapp_templates: legacy pdp_template → product_inquiry (I18nString),
  // legacy cart_template → order_confirm (I18nString).
  // legacy support_template has no v2 counterpart — omitted.
  const legacyTpl = sch.whatsapp_templates;
  const order_confirm = en(legacyTpl?.cart_template);
  const product_inquiry = en(legacyTpl?.pdp_template);
  const whatsapp_templates =
    order_confirm || product_inquiry
      ? {
          ...(order_confirm ? { order_confirm } : {}),
          ...(product_inquiry ? { product_inquiry } : {}),
        }
      : undefined;

  // returns_policy: window_days maps 1:1.
  const returns_policy =
    sch.returns_policy?.window_days !== undefined
      ? { window_days: sch.returns_policy.window_days }
      : undefined;

  // delivery_promise: governorates_covered in legacy is string[] (array of
  // names); v2 expects a count (number). Map .length. Fields map 1:1 otherwise.
  const legacyDp = sch.delivery_promise;
  const delivery_promise =
    legacyDp &&
    (legacyDp.baghdad_hours !== undefined ||
      legacyDp.provinces_hours !== undefined ||
      legacyDp.governorates_covered !== undefined)
      ? {
          baghdad_hours: legacyDp.baghdad_hours,
          provinces_hours: legacyDp.provinces_hours,
          governorates_covered:
            legacyDp.governorates_covered !== undefined
              ? legacyDp.governorates_covered.length
              : undefined,
        }
      : undefined;

  const socials =
    contact?.instagram !== undefined ||
    contact?.facebook !== undefined ||
    contact?.tiktok !== undefined ||
    contact?.email !== undefined
      ? {
          instagram: contact.instagram,
          facebook: contact.facebook,
          tiktok: contact.tiktok,
          email: contact.email,
        }
      : undefined;

  // Return undefined if there's truly nothing to carry forward.
  const hasData =
    contact?.whatsapp_number !== undefined ||
    legacy.enable_whatsapp_order !== undefined ||
    socials !== undefined ||
    whatsapp_templates !== undefined ||
    returns_policy !== undefined ||
    delivery_promise !== undefined;

  if (!hasData) return undefined;

  return {
    whatsapp_number: contact?.whatsapp_number,
    enable_whatsapp_order: legacy.enable_whatsapp_order,
    socials,
    whatsapp_templates,
    returns_policy,
    delivery_promise,
  };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Home page assembly                                                  */
/* ─────────────────────────────────────────────────────────────────── */

// Maps a legacy section type to its preferred slot key when present in
// `sections_order`. The legacy storefront treated promo_bar / hero / trust /
// about / customer_love / newsletter as named slots; everything else lives
// under its raw type string.
const SECTION_TYPE_BY_LEGACY_KEY: Record<string, string> = {
  hero: "hero_image",
  about: "about_block",
  trust: "trust_strip",
  customer_love: "testimonial_card",
  promo_bar: "promo_bar",
  newsletter: "newsletter",
};

function buildHomeSections(legacy: StoreConfig): SectionInstance[] {
  const sch = legacy.schneiders ?? {};
  const built: Array<{ key: string; section: SectionInstance }> = [];

  const hero = buildHeroSection(legacy.hero);
  if (hero) built.push({ key: "hero", section: hero });

  const trust = buildTrustStripSection(sch.trust_pills);
  if (trust) built.push({ key: "trust", section: trust });

  const about = buildAboutSection(legacy.about);
  if (about) built.push({ key: "about", section: about });

  const testimonial = buildTestimonialCardSection(sch.testimonial);
  if (testimonial) built.push({ key: "customer_love", section: testimonial });

  // Dynamic sections — each preserves its legacy id as the key.
  for (const sc of legacy.sections ?? []) {
    built.push({ key: sc.id, section: buildDynamicSection(sc) });
  }

  // Apply legacy sections_order to determine the final ordering. Anything not
  // in the order list goes to the end in built-order (stable).
  const order = legacy.sections_order ?? [];
  const keyToSection = new Map(built.map((b) => [b.key, b.section]));
  const ordered: SectionInstance[] = [];
  const seen = new Set<string>();

  for (const key of order) {
    // The order list can reference either a named slot ("hero", "trust",
    // "customer_love") or a dynamic section's legacy id.
    const section = keyToSection.get(key);
    if (section && !seen.has(key)) {
      ordered.push(section);
      seen.add(key);
    }
  }
  // Append any built sections not referenced in the order list.
  for (const { key, section } of built) {
    if (!seen.has(key)) {
      ordered.push(section);
      seen.add(key);
    }
  }
  return ordered;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Top-level mapper                                                    */
/* ─────────────────────────────────────────────────────────────────── */

const ALL_PAGE_IDS: PageId[] = [
  "home",
  "category",
  "product",
  "search",
  "cart",
  "checkout",
  "checkout_success",
  "track",
  "about",
  "faq",
  "contact",
  "policy_shipping",
  "policy_returns",
  "policy_privacy",
  "policy_terms",
  "not_found",
];

export function mapLegacyToV2(legacy: StoreConfig | null | undefined): StoreConfigV2 {
  const safe = legacy ?? {};
  const homeSections = buildHomeSections(safe);

  const pages: PageConfig[] = ALL_PAGE_IDS.map((id) => {
    if (id === "home") return { page_id: id, sections: homeSections };
    return { page_id: id, sections: [] };
  });

  // Use the resolver's empty config as a structural baseline so we never
  // forget a required field — then overlay our mapped pieces.
  const empty = emptyStoreConfigV2();

  const commerce = mapCommerce(safe);

  return {
    ...empty,
    brand_kit: mapBrandKit(safe),
    pages,
    globals: mapGlobals(safe),
    // Set the brand identity.name from SEO title if available — purely
    // additive; the editor will let merchants override this later.
    // (Already handled inside mapBrandKit via identity logo/og only — name
    // intentionally left unset because legacy never stored it.)
    ...(commerce !== undefined ? { commerce } : {}),
    ...(safe.custom_css !== undefined ? { custom_css: safe.custom_css } : {}),
  };
}
