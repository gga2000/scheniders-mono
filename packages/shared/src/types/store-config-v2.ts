// =====================================================================
// Store Config v2 — Schneiders Builder
// =====================================================================
// The v2 data model. Lives alongside the legacy `StoreConfig` until all
// tenants are migrated (see migration script + dual-write window).
//
// Design principles:
//  1. Everything is a *section instance* on a *page*. No top-level
//     "hero" / "about" / "trust" — those are section types.
//  2. Every section supports *variants* — conditional overrides keyed
//     on locale / breakpoint / time / segment / experiment / governorate
//     / product / category / page. ONE primitive powers 11 features.
//  3. Brand kit is a single source of truth. Visual fields elsewhere
//     reference brand-kit tokens, not raw values.
//  4. Multi-locale is baked into every text field via the `I18nString`
//     helper. Storefront resolves at render time.
// =====================================================================

import type { GovernorateCode } from "../governorates";

/* ─────────────────────────────────────────────────────────────────── */
/* Locale & i18n                                                       */
/* ─────────────────────────────────────────────────────────────────── */

export type LocaleCode = "ar" | "en" | "ku";

export const SUPPORTED_LOCALES: LocaleCode[] = ["ar", "en", "ku"];

export const LOCALE_LABELS: Record<LocaleCode, string> = {
  ar: "العربية",
  en: "English",
  ku: "کوردی",
};

/**
 * A localized string. At least `en` is required by convention; other
 * locales fall back to `en` if unset, then to an empty string.
 */
export type I18nString = Partial<Record<LocaleCode, string>>;

/** Helper: resolve a localized string against a runtime locale. */
export function resolveI18n(s: I18nString | string | undefined, locale: LocaleCode): string {
  if (typeof s === "string") return s;
  if (!s) return "";
  return s[locale] ?? s.en ?? Object.values(s).find((v) => !!v) ?? "";
}

/* ─────────────────────────────────────────────────────────────────── */
/* Pages                                                                */
/* ─────────────────────────────────────────────────────────────────── */

export type PageId =
  | "home"
  | "category"
  | "product"
  | "search"
  | "cart"
  | "checkout"
  | "checkout_success"
  | "track"
  | "about"
  | "faq"
  | "contact"
  | "policy_shipping"
  | "policy_returns"
  | "policy_privacy"
  | "policy_terms"
  | "not_found";

export interface PageConfig {
  page_id: PageId;
  /** Ordered, draggable. */
  sections: SectionInstance[];
  meta?: PageMeta;
}

export interface PageMeta {
  title?: I18nString;
  description?: I18nString;
  og_image_url?: string;
  noindex?: boolean;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Variants — the polymorphic feature engine                            */
/* ─────────────────────────────────────────────────────────────────── */

export type Breakpoint = "mobile" | "tablet" | "desktop";

export type VariantCondition =
  | { kind: "locale"; values: LocaleCode[] }
  | { kind: "breakpoint"; values: Breakpoint[] }
  | { kind: "time_window"; start_iso: string; end_iso?: string; timezone?: string }
  | { kind: "ab_test"; experiment_id: string; arm: string }
  | { kind: "audience"; segment_id: string }
  | { kind: "governorate"; values: GovernorateCode[] }
  | { kind: "product"; product_ids: string[] }
  | { kind: "category"; category_ids: string[] }
  | { kind: "page"; values: PageId[] };

/**
 * A conditional override of a section's props. ALL conditions must
 * match for the variant to apply. Higher priority wins ties.
 */
export interface Variant {
  id: string;
  /** Human label shown in the editor (e.g. "Arabic", "Mobile", "VIP"). */
  label: string;
  conditions: VariantCondition[];
  /** Partial override of base props — deep merged. */
  override: Record<string, unknown>;
  priority: number;
  /** Allow merchants to temporarily disable without deleting. */
  enabled?: boolean;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Section instances                                                    */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Per-section visibility rule. A subset of the variant condition union —
 * audience, geo, schedule, locale, breakpoint, page targeting. ALL rules
 * must match for the section to render. Reuses `VariantCondition` so the
 * editor UI and runtime semantics stay aligned with the variant SDK.
 */
export type VisibilityRule = Extract<
  VariantCondition,
  | { kind: "locale" }
  | { kind: "breakpoint" }
  | { kind: "time_window" }
  | { kind: "audience" }
  | { kind: "governorate" }
  | { kind: "page" }
>;

/**
 * A concrete instance of a section type on a specific page.
 * The `type` field references a section in the registry; the registry
 * provides the Zod schema, default props, and React render function.
 */
export interface SectionInstance {
  /** Stable id (uuid) — used by variants, drag-drop, click-to-edit. */
  id: string;
  /** Registered section type (e.g. "hero_image", "trust_strip"). */
  type: string;
  enabled: boolean;
  /** Base props matching the section's Zod schema. */
  base: Record<string, unknown>;
  variants?: Variant[];
  /** Optional human label for the editor outline. */
  label?: string;
  /**
   * Optional conditional-visibility rules. ALL rules must match the
   * runtime context for the section to render. When omitted the section
   * is always visible (subject only to `enabled` and variant overrides).
   */
  visibility?: VisibilityRule[];
  /**
   * Optional outer spacing applied as `marginTop` / `marginBottom` on
   * the section wrapper at render time. Driven by the in-preview
   * spacing handles. Values are pixels; both are clamped to [0, 200]
   * in the editor. Undefined means "no extra spacing" — the section
   * renders with whatever internal padding it has.
   */
  spacing?: { top_px?: number; bottom_px?: number };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Brand kit — single source of truth for visual identity               */
/* ─────────────────────────────────────────────────────────────────── */

export interface BrandKit {
  identity: BrandIdentity;
  colors: BrandColors;
  typography: BrandTypography;
  shape: BrandShape;
  motion: BrandMotion;
  voice: BrandVoice;
}

export interface BrandIdentity {
  name?: string;
  tagline?: I18nString;
  logo_url?: string;
  favicon_url?: string;
  og_image_url?: string;
}

export interface BrandColors {
  /** Hex (#rrggbb). */
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  surface_alt: string;
  ink: string;
  success: string;
  danger: string;
}

export type GoogleFontName = string;

export interface BrandTypography {
  display: GoogleFontName;
  body: GoogleFontName;
  scale: "compact" | "comfortable" | "spacious";
}

export interface BrandShape {
  radius: "none" | "soft" | "round" | "pill";
  border_thickness: "none" | "thin" | "thick" | "chunky";
  shadow_style: "flat" | "soft" | "hard-offset" | "elevated";
  rotation_intensity: "none" | "subtle" | "playful" | "wild";
}

export interface BrandMotion {
  enabled: boolean;
  speed: "slow" | "normal" | "snappy";
}

export interface BrandVoice {
  formality: "formal" | "casual" | "playful" | "luxe";
  notes?: I18nString;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Globals — header, footer, promo bar (rendered on every page)         */
/* ─────────────────────────────────────────────────────────────────── */

export interface GlobalSections {
  header?: SectionInstance;
  footer?: SectionInstance;
  promo_bar?: SectionInstance;
  sticky_bottom_bar?: SectionInstance;
  newsletter_popup?: SectionInstance;
  analytics_pixels?: SectionInstance;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Experiments (A/B testing)                                            */
/* ─────────────────────────────────────────────────────────────────── */

export interface ExperimentArm {
  id: string;
  label: string;
  traffic_pct: number; // 0–100, sums to 100 across arms
}

export interface Experiment {
  id: string;
  name: string;
  status: "draft" | "running" | "paused" | "completed";
  starts_at?: string;
  ends_at?: string;
  primary_metric: "orders" | "add_to_cart" | "click_through" | "revenue";
  arms: ExperimentArm[];
}

/* ─────────────────────────────────────────────────────────────────── */
/* Audience segments                                                    */
/* ─────────────────────────────────────────────────────────────────── */

export type SegmentRule =
  | { kind: "first_visit"; within_minutes?: number }
  | { kind: "returning_visitor" }
  | { kind: "has_ordered_before" }
  | { kind: "cart_total"; op: ">=" | "<="; value_iqd: number }
  | { kind: "abandoned_cart"; minutes_since: number }
  | { kind: "governorate"; values: GovernorateCode[] }
  | { kind: "traffic_source"; values: Array<"meta" | "tiktok" | "google" | "whatsapp" | "direct"> }
  | { kind: "device"; values: Breakpoint[] };

export interface AudienceSegment {
  id: string;
  name: string;
  description?: string;
  rules: SegmentRule[];
  /** Match logic across rules. */
  combine: "all" | "any";
}

/* ─────────────────────────────────────────────────────────────────── */
/* Scheduled changes (top-level view of all time_window variants)       */
/* ─────────────────────────────────────────────────────────────────── */

export interface ScheduledChange {
  id: string;
  label: string;
  starts_at_iso: string;
  ends_at_iso?: string;
  timezone: string;
  /** References specific (page_id, section_id, variant_id) tuples. */
  targets: Array<{ page_id: PageId; section_id: string; variant_id: string }>;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Version history                                                      */
/* ─────────────────────────────────────────────────────────────────── */

export interface NamedSnapshot {
  id: string;
  label: string;
  created_at: string;
  created_by: string;
  author_name: string;
  diff_summary?: { added: number; removed: number; changed: number };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Root config                                                          */
/* ─────────────────────────────────────────────────────────────────── */

export interface StoreConfigV2 {
  schema_version: 2;
  /** Single source of truth for visual identity. */
  brand_kit: BrandKit;
  /** Per-page section trees. Order in array is the visual order. */
  pages: PageConfig[];
  /** Header / footer / promo bar / popup / pixels — shared across pages. */
  globals: GlobalSections;
  /** A/B tests. */
  experiments: Experiment[];
  /** Audience segments referenced by variants. */
  segments: AudienceSegment[];
  /** Future-dated changes (also implicit in variants — this is the index). */
  schedules: ScheduledChange[];
  /** Default locale used when visitor's locale is unsupported. */
  default_locale: LocaleCode;
  /** Locales the store actively supports. */
  enabled_locales: LocaleCode[];
}

/* ─────────────────────────────────────────────────────────────────── */
/* Runtime context — what the storefront knows about the current visit  */
/* ─────────────────────────────────────────────────────────────────── */

export interface RuntimeContext {
  /** Currently rendering page. */
  page_id: PageId;
  /** Current breakpoint at render time (server SSR uses "mobile" default). */
  breakpoint: Breakpoint;
  /** Negotiated locale. */
  locale: LocaleCode;
  /** Visitor's audience segments (subset matched at request time). */
  audience_segments: string[];
  /** A/B test arm assignments (experiment_id → arm). */
  ab_test_arms: Record<string, string>;
  /** Visitor's governorate if known (geo-IP or cart address). */
  governorate?: GovernorateCode;
  /** Current product/category if applicable. */
  product_id?: string;
  category_id?: string;
  /** Current server time — used for time_window matching. */
  now: Date;
}
