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

// Per-locale fallback chains. Iraq market: Kurdish falls back to Arabic before
// English, and Arabic to English. (The old code sent `ku` straight to `en`,
// skipping Arabic.)
const LOCALE_FALLBACKS: Record<LocaleCode, readonly LocaleCode[]> = {
  ar: ["ar", "en"],
  ku: ["ku", "ar", "en"],
  en: ["en", "ar"],
};

/** Helper: resolve a localized string against a runtime locale. */
export function resolveI18n(
  s: I18nString | string | undefined,
  locale: LocaleCode,
): string {
  if (typeof s === "string") return s;
  if (!s) return "";
  // Walk the locale's fallback chain, skipping empty/whitespace values so a
  // blank `{ en: "" }` falls through to a populated locale instead of rendering
  // nothing.
  for (const loc of LOCALE_FALLBACKS[locale]) {
    const v = s[loc];
    if (v && v.trim()) return v;
  }
  // Last resort: any non-empty value (covers a locale outside the chain).
  const any = Object.values(s).find((v) => typeof v === "string" && v.trim());
  return any ?? "";
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
  /**
   * Optional Arabic-script pairing ([D3]). Latin display faces have no
   * Arabic glyphs; when set, Arabic/Kurdish pages render headlines/body
   * in these faces instead of an arbitrary system fallback.
   */
  display_ar?: GoogleFontName;
  body_ar?: GoogleFontName;
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
/* Commerce config — V1 business fields ported forward                  */
/* ─────────────────────────────────────────────────────────────────── */

/** Per-governorate COD delivery rate. */
export interface GovernorateShippingRate {
  /** Flat delivery fee (IQD). */
  fee_iqd: number;
  /** Subtotal (IQD) at/above which delivery is free here. Omit / 0 = never free. */
  free_threshold_iqd?: number;
  /** Optional ETA shown to the customer. */
  eta_hours?: number;
}

/**
 * Per-governorate shipping engine. `rates` overrides specific governorates;
 * `default_rate` is the fallback for the rest. When the whole config is absent,
 * the storefront + server fall back to the legacy flat fee (back-compat).
 * (Named with the `Governorate` prefix to avoid clashing with the legacy V1
 * `ShippingConfig` in store-config.ts.)
 */
export interface GovernorateShippingConfig {
  rates?: Partial<Record<GovernorateCode, GovernorateShippingRate>>;
  default_rate?: GovernorateShippingRate;
}

/** A coupon / discount code (definitions; redemption caps tracked in DB later). */
export interface DiscountCode {
  /** Case-insensitive code the customer enters. */
  code: string;
  kind: "percent" | "fixed";
  /** percent: 0–100; fixed: IQD off. */
  value: number;
  /** Minimum cart subtotal (IQD) to qualify. */
  min_subtotal_iqd?: number;
  /** Cap (IQD) for a percent discount. */
  max_discount_iqd?: number;
  /** Active window (UTC ISO). */
  starts_iso?: string;
  ends_iso?: string;
  /** Default true. */
  enabled?: boolean;
}

export interface StoreCommerceConfig {
  whatsapp_number?: string;
  enable_whatsapp_order?: boolean;
  /** prefilled WhatsApp message templates (from legacy schneiders.whatsapp_templates) */
  whatsapp_templates?: { order_confirm?: I18nString; product_inquiry?: I18nString };
  socials?: { instagram?: string; facebook?: string; tiktok?: string; email?: string };
  returns_policy?: {
    window_days?: number;
    /**
     * The shopper may open the parcel and check it before paying the
     * courier. Rendered wherever merchant commitments appear (PDP order
     * form, delivery promise). Off unless the merchant says so — this is a
     * promise made at the door, never assumed.
     */
    inspect_before_paying?: boolean;
  };
  delivery_promise?: { baghdad_hours?: number; provinces_hours?: number; governorates_covered?: number };
  /** Per-governorate shipping rates (EC2/EC16 engine). */
  shipping?: GovernorateShippingConfig;
  /** Coupon / discount codes. */
  discounts?: DiscountCode[];
  /** Abandoned-cart WhatsApp recovery (opt-in per tenant). */
  cart_recovery?: CartRecoveryConfig;
  /** "Frequently bought together" bundles (AOV upsell). */
  bundles?: Bundle[];
  /** Points-based loyalty program (opt-in per tenant). */
  loyalty?: LoyaltyConfig;
  /** Free gift above a spending threshold (opt-in per tenant). */
  free_gift?: FreeGiftRewardConfig;
  /** Referral program: a friend's discount + the referrer's points (opt-in). */
  referral?: ReferralConfig;
  /** Per-stage copy for the order tracker. Missing stages use the shipped defaults. */
  order_status_narratives?: Partial<Record<CustomerOrderStage, OrderStatusNarrative>>;
  /** Who contacts the buyer after an order, and when (the "who contacts
   *  you" line). Absent = no line anywhere. */
  contact?: StoreContactConfig;
}

/** Weekday codes for call hours, Sunday first (matches `Date#getUTCDay`). */
export type ContactWeekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/**
 * When the store's team calls buyers to confirm orders. Wall-clock hours in
 * `tz`; `from` is strictly before `to` (no overnight windows). A malformed
 * block is ignored and the line names the channel only — it never guesses.
 */
export interface StoreCallHours {
  days: ContactWeekday[];
  /** "HH:mm", 24-hour. */
  from: string;
  /** "HH:mm", 24-hour, after `from`. */
  to: string;
  /** IANA zone; absent = Asia/Baghdad. */
  tz?: string;
}

/**
 * The structured contact promise shown under the order button and on the
 * thank-you card. `call_number` must be an Iraqi mobile: it is the number
 * the buyer is told to answer, so a malformed one hides the line instead
 * of printing a number nobody calls from.
 */
export interface StoreContactConfig {
  call_number?: string;
  call_hours?: StoreCallHours;
  /** The store sends the instant WhatsApp confirmation for storefront
   *  orders, so the line may announce it. Off unless set. */
  whatsapp_confirm?: boolean;
}

/**
 * Free gift above a spending threshold. Off unless the merchant has both
 * enabled it AND chosen a product: a threshold with no gift behind it is a
 * promise the checkout cannot keep.
 *
 * Named apart from the legacy V1 `FreeGiftConfig` in store-config.ts, which
 * carries a threshold and a label but no product — which is why it never
 * delivered a gift either.
 */
export interface FreeGiftRewardConfig {
  enabled?: boolean;
  /** The product added to the order, at no charge. */
  product_id?: string;
  /** Item subtotal (IQD) at or above which the gift is added. */
  threshold_iqd?: number;
}

/**
 * Referral program. A shopper who ordered gets a code; a friend using it on
 * their FIRST order gets `friend_discount_pct` off, and the referrer is
 * credited `referrer_points` when that order is delivered (via the loyalty
 * ledger, so loyalty must be on for the referrer side to mean anything).
 */
export interface ReferralConfig {
  /** Off by default — merchant must opt in. */
  enabled?: boolean;
  /** Friend's discount on their first order, 0–100 %. */
  friend_discount_pct?: number;
  /** Cap (IQD) on that discount. */
  friend_max_discount_iqd?: number;
  /** Points credited to the referrer when the friend's order is delivered. */
  referrer_points?: number;
}

/**
 * What a shopper sees when they look up an order in a given customer-facing
 * stage. Every string is merchant-editable; the shipped defaults are Iraqi
 * dialect and assume the WhatsApp-confirmation flow. `{contact}` in any
 * string is replaced with the tenant's contact number — never hardcoded.
 */
export interface OrderStatusNarrative {
  title_i18n?: I18nString;
  body_i18n?: I18nString;
  /** What happens next, or what the shopper should do. */
  next_i18n?: I18nString;
  cta?: {
    kind: "whatsapp" | "phone" | "link" | "review" | "reorder";
    label_i18n?: I18nString;
    /** Path for `link`; ignored for the other kinds, which resolve their own target. */
    value?: string;
  };
}

/**
 * Customer-facing stages. Deliberately NOT the internal order status: the
 * public lookup maps the 13 internal statuses down to these so anon never
 * learns operational state, and the merchant edits copy per stage.
 */
export type CustomerOrderStage =
  | "placed"
  | "awaiting_confirmation"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "no_response"
  | "on_hold"
  | "cancelled"
  | "returning"
  | "refunded";

export interface LoyaltyConfig {
  /** Off by default — merchant must opt in. */
  enabled?: boolean;
  /** Points earned per 1 IQD spent (e.g. 0.001 = 1 point per 1,000 IQD). */
  earn_per_iqd?: number;
  /** IQD value of one point on redemption (e.g. 1 = 1 point → 1 IQD off). */
  redeem_value_iqd?: number;
  /** Minimum points balance required before any redemption. */
  min_redeem_points?: number;
  /** Cap redemption to this % of the order subtotal (0–100). */
  max_redeem_pct?: number;
}

export interface Bundle {
  id: string;
  name?: I18nString;
  /** Products that must ALL be in the cart for the bundle to apply. */
  product_ids: string[];
  /** Discount kind applied to the bundle's combined item subtotal. */
  kind: "percent" | "fixed";
  value: number;
  enabled?: boolean;
}

export interface CartRecoveryConfig {
  /** Off by default — the merchant must opt in before any nudge is sent. */
  enabled?: boolean;
  /** Idle minutes after the last checkout activity before the nudge (5–1440). */
  delay_minutes?: number;
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
  /** V1 business fields: WhatsApp, socials, returns policy, delivery promise. */
  commerce?: StoreCommerceConfig;   // NEW
  /** Merchant-supplied CSS injected into the storefront <head>. */
  custom_css?: string;              // NEW
  /** URL redirects (e.g. after a slug change) — see RedirectRule. */
  redirects?: RedirectRule[];       // NEW
  /** Merchant-authored custom pages, served at /s/<tenant>/p/<slug>. */
  custom_pages?: CustomPage[];      // NEW
  /**
   * What the store was seeded from: a visual direction × a content pack,
   * at a template version. Lets the platform offer upgrades later and tell
   * a merchant which look and niche their store started as. Absent on
   * stores seeded before this existed.
   */
  template?: StoreTemplateStamp;
}

export interface StoreTemplateStamp {
  direction_id: string;
  pack_id?: string;
  /** Version of the direction the stacks were seeded from. */
  version: number;
  /** ISO timestamp of the seed. */
  applied_at?: string;
}

/**
 * A single URL redirect. Source/destination are tenant-relative paths with a
 * leading slash (e.g. `/products/old-slug` → `/products/new-slug`); `to` may
 * also be an absolute URL. Used to keep inbound ad/WhatsApp/search links alive
 * when a slug changes.
 */
export interface RedirectRule {
  /** Tenant-relative source path, leading slash. */
  from: string;
  /** Destination — tenant-relative path or absolute URL. */
  to: string;
  /** 308 permanent (default) vs 307 temporary. */
  permanent?: boolean;
}

/**
 * Marks a custom page as a dated article — a guide, a how-to, a story.
 *
 * A custom page is already a full authored page: sections, SEO meta, its own
 * URL. What an article needs on top is the handful of facts a *list* of them
 * needs — when it was published, what it looks like, and what it is about —
 * so guides can be shown newest-first somewhere else on the store. Everything
 * here is optional, and the block itself is optional, so a page that is not
 * an article carries nothing and behaves exactly as it did.
 */
export interface ArticleMeta {
  /**
   * ISO date. A date in the future means "not yet published": the article
   * keeps its URL but stays out of every list until then, which makes
   * scheduling a guide free rather than a feature to build later.
   */
  published_at?: string;
  /** Short summary for the listing card. Falls back to the page's SEO description. */
  excerpt?: I18nString;
  /** Listing card image. Falls back to the page's OG image. */
  cover_url?: string;
  /** Byline. Rendered only when set — never invented from the store name. */
  author?: string;
}

/**
 * A merchant-authored custom page (campaign / landing / lookbook). Served at
 * `/s/<tenant>/p/<slug>`. Unlike the fixed system pages, custom pages have a
 * stable id + a URL slug; otherwise they reuse the same section + meta model.
 */
export interface CustomPage {
  /** Stable id (React keys / reorder). */
  id: string;
  /** URL slug, unique per tenant (kebab-case). */
  slug: string;
  /** Editor + navigation label. */
  title?: I18nString;
  /** Section tree — same model as system pages. */
  sections: SectionInstance[];
  /** Per-page SEO. */
  meta?: PageMeta;
  /** Hidden = not served (404) without deleting. */
  hidden?: boolean;
  /** Present when this page is a dated article. Absent for an ordinary page. */
  article?: ArticleMeta;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Runtime context — what the storefront knows about the current visit  */
/* ─────────────────────────────────────────────────────────────────── */

export interface RuntimeContext {
  /**
   * Currently rendering page. A system PageId, or a custom page's slug (custom
   * pages have a non-enum identity). Page-conditioned variants only ever target
   * system PageIds, so a custom slug simply matches none — see the resolver.
   */
  page_id: PageId | (string & {});
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
  /**
   * Order number the shopper just placed (thank-you page `?order=`). Read by
   * `order_confirmation`; absent everywhere else.
   */
  order_number?: string;
  /**
   * Server-side search query (search page `?q=`, trimmed). Read by
   * `search_results_grid` so results are filtered in the SSR pass instead of
   * after hydration.
   */
  search_query?: string;
  /** Current server time — used for time_window matching. */
  now: Date;
}
