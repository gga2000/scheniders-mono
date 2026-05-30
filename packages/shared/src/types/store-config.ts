// =============================================
// Canonical Store Configuration Types
// =============================================
// These types are the single source of truth for store config
// across platform (editor), storefront (renderer), and admin.

export type TemplateName = "schneiders" | "fashion" | "beauty" | "electronics" | "general" | "clean";

// ── Design Tokens ──

export interface DesignTokenColors {
  primary: string;
  secondary: string;
  accent: string;
  background?: string;
  text?: string;
}

export interface DesignTokenFonts {
  heading: string;
  body: string;
  pairing_id?: string;
}

export type DesignTokenRadius = "none" | "sm" | "md" | "lg" | "full";
export type DesignTokenSpacing = "compact" | "comfortable" | "spacious";
export type DesignTokenShadows = "flat" | "subtle" | "elevated";

export interface DesignTokens {
  colors?: DesignTokenColors;
  fonts?: DesignTokenFonts;
  radius?: DesignTokenRadius;
  spacing?: DesignTokenSpacing;
  shadows?: DesignTokenShadows;
}

// ── Section Config ──

export type SectionAnimationType = "none" | "fade" | "slide" | "scale";

export interface SectionAnimation {
  type: SectionAnimationType;
  duration?: number;
  delay?: number;
}

export interface SectionConfig {
  id: string;
  type: string;
  enabled: boolean;
  variant?: string;
  data: Record<string, unknown>;
  animation?: SectionAnimation;
}

// ── SEO Config ──

export interface SEOConfig {
  meta_title?: string;
  meta_description?: string;
  og_image_url?: string;
  canonical_url?: string;
}

// ── Hero Config ──

export interface HeroConfig {
  title?: string;
  subtitle?: string;
  cta_text?: string;
  /** Secondary CTA kind (mobile shows alongside the primary CTA). */
  secondary_cta_kind?: "whatsapp" | "call" | "category_link" | "none";
  image_url?: string;
}

// ── About Config ──

export interface AboutConfig {
  enabled?: boolean;
  title?: string;
  body?: string;
}

// ── Contact Config ──

export interface ContactConfig {
  whatsapp_number?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  email?: string;
}

// ─────────────────────────────────────────────────────────
//  Schneiders-template-specific config (additive — all
//  fields are optional; storefront falls back to sensible
//  defaults when missing so existing tenants keep working.)
// ─────────────────────────────────────────────────────────

/** Candy palette keys used for accent pairing + pill tints. */
export type CandyColor = "pink" | "mint" | "butter" | "lilac" | "sky" | "cream" | "ink";

/** #1 — Customer testimonial used in the "For You" wedge (mobile) +
 *  the Customer Love card (desktop). */
export interface TestimonialConfig {
  enabled?: boolean;
  quote?: string;
  reviewer_name?: string;
  reviewer_city?: string;
  avatar_url?: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  badge_text?: string;
}

/** #2 — Social-proof stat banner ("247 orders today" on desktop). */
export interface SocialProofConfig {
  enabled?: boolean;
  /** If "auto", storefront pulls live count from orders table. */
  source?: "manual" | "auto";
  manual_number?: number;
  label?: string;
}

/** #3 — Delivery promise card (PDP + Shipping policy). */
export interface DeliveryPromiseConfig {
  baghdad_hours?: number;
  provinces_hours?: number;
  inspection_text?: string;
  /** ISO country code stays "IQ" — only governorates vary by tenant. */
  governorates_covered?: string[];
}

/** #4 — Shipping fees + free-shipping thresholds (Cart + Checkout). */
export interface ShippingConfig {
  baghdad_threshold_iqd?: number;
  provinces_threshold_iqd?: number;
  baghdad_fee_iqd?: number;
  provinces_fee_iqd?: number;
  express_fee_iqd?: number;
  /** #17 — Per-governorate override; falls back to baghdad/provinces. */
  governorate_pricing?: Array<{
    code: string;
    fee_iqd: number;
    eta_hours: number;
  }>;
}

/** #5 — Reassurance copy ("we'll call within 30 minutes"). */
export interface ReassuranceConfig {
  call_within_min?: number;
  support_hours?: string;
}

/** #6 — Top promo bar (rotating messages). */
export interface PromoBarConfig {
  enabled?: boolean;
  messages?: string[];
}

/** #7 — Candy palette accent pairing (primary CTA + supporting tint). */
export interface AccentPairConfig {
  primary?: CandyColor;
  secondary?: CandyColor;
}

/** #8 — How aggressive the playful rotations + wedges are. */
export type WedgeIntensity = "none" | "subtle" | "playful" | "wild";

/** #9 — Wordmark styling on header + footer (desktop). */
export type WordmarkStyle = "classic" | "italic-yellow-box" | "minimal";

/** #10 — Custom trust pills shown across the site. */
export interface TrustPillConfig {
  label: string;
  icon?: string; // Material Symbols name
  bg?: CandyColor;
  enabled?: boolean;
}

/** #12 — Section-visibility toggles for the home page. */
export interface HomeSectionToggles {
  promo_bar?: boolean;
  hero?: boolean;
  trust_strip?: boolean;
  categories?: boolean;
  for_you?: boolean;
  new_arrivals?: boolean;
  about?: boolean;
  customer_love?: boolean;
  gift_guides?: boolean;
  trust_banner?: boolean;
  newsletter?: boolean;
}

/** #13 — PDP-level toggles. */
export interface PDPOptions {
  show_stock_urgency?: boolean;
  show_star_rating?: boolean;
  show_size_guide_link?: boolean;
  related_products_count?: number;
  show_delivery_card?: boolean;
  show_about_collapsible?: boolean;
}

/** #14 — Cart toggles + tenant-owned promo codes. */
export interface CartOptions {
  show_promo_code?: boolean;
  promo_codes?: Array<{
    code: string;
    percent_off?: number;
    fixed_off_iqd?: number;
    expires_at?: string;
  }>;
  show_whatsapp_alternative?: boolean;
  show_upsell_rail?: boolean;
}

/** #15 — Checkout payment + form options. */
export interface CheckoutOptions {
  payment_methods_enabled?: Array<"cod" | "card" | "fastpay">;
  notes_field?: boolean;
  agree_to_terms_required?: boolean;
  /** Optional override of the global trust_pills shown on checkout only. */
  trust_pills_override?: TrustPillConfig[];
}

/** #25 — Returns policy options. */
export interface ReturnsPolicyConfig {
  window_days?: number;
}

/** #26 — Last-updated stamp shown on Privacy and Terms pages. */
export interface PolicyMetaConfig {
  last_updated_label?: string;
}

/** #16 — WhatsApp prefilled-message templates. Variables: {product_name},
 *  {variant_name}, {price}, {total}, {order_id}, {qty}. */
export interface WhatsAppTemplatesConfig {
  pdp_template?: string;
  cart_template?: string;
  support_template?: string;
}

/** #18 — Order-confirmation behaviour. */
export interface OrderConfirmConfig {
  call_within_min?: number;
  send_whatsapp_confirmation?: boolean;
  send_sms_confirmation?: boolean;
  thank_you_subheadline?: string;
}

/** #19 — Analytics + pixel IDs (critical for ad compliance + ROAS). */
export interface AnalyticsConfig {
  meta_pixel_id?: string;
  tiktok_pixel_id?: string;
  google_analytics_id?: string;
  snapchat_pixel_id?: string;
  /** Custom GTM container (overrides individual pixels if set). */
  gtm_container_id?: string;
}

/** #20 — Empty-state recovery (404 + empty-cart suggestions). */
export interface EmptyStatesConfig {
  fallback_categories?: Array<{ slug: string; label: string; emoji?: string; bg?: CandyColor }>;
  empty_cart_message?: string;
  not_found_message?: string;
}

/** #21 — Sale-sticker styling. */
export interface SaleStickerConfig {
  style?: "absolute_iqd" | "percent" | "label";
  /** Free-text label used when style="label" (e.g. "LIMITED TIME"). */
  label?: string;
  rotate_deg?: number;
  bg?: CandyColor;
}

/** #23 — Free-gift-with-purchase threshold (cart upsell). */
export interface FreeGiftConfig {
  enabled?: boolean;
  threshold_iqd?: number;
  label?: string;
  image_url?: string;
}

/** #24 — Newsletter / email-capture popup. */
export interface NewsletterPopupConfig {
  enabled?: boolean;
  discount_iqd?: number;
  /** Free-text label (e.g. "Get 15,000 IQD off your first order"). */
  label?: string;
  popup_after_seconds?: number;
  popup_after_pages?: number;
}

// ── Schneiders-specific bundle (groups all template options) ──

export interface SchneidersConfig {
  testimonial?: TestimonialConfig;            // #1
  social_proof?: SocialProofConfig;           // #2
  delivery_promise?: DeliveryPromiseConfig;   // #3
  shipping?: ShippingConfig;                  // #4 + #17
  reassurance?: ReassuranceConfig;            // #5
  promo_bar?: PromoBarConfig;                 // #6
  accent_pair?: AccentPairConfig;             // #7
  wedge_intensity?: WedgeIntensity;           // #8
  wordmark_style?: WordmarkStyle;             // #9
  trust_pills?: TrustPillConfig[];            // #10
  hero_ctas?: {                                // #11 — Hero CTA labels
    primary_label?: string;
    secondary_kind?: "whatsapp" | "call" | "category_link" | "none";
  };
  home_sections?: HomeSectionToggles;          // #12
  pdp?: PDPOptions;                            // #13
  cart?: CartOptions;                          // #14
  checkout?: CheckoutOptions;                  // #15
  whatsapp_templates?: WhatsAppTemplatesConfig; // #16
  order_confirm?: OrderConfirmConfig;          // #18
  analytics?: AnalyticsConfig;                 // #19
  empty_states?: EmptyStatesConfig;            // #20
  sale_sticker?: SaleStickerConfig;            // #21
  /** #22 — Best-sellers pill label on the desktop hero. */
  best_sellers_label?: string;
  free_gift?: FreeGiftConfig;                  // #23
  newsletter_popup?: NewsletterPopupConfig;    // #24
  returns_policy?: ReturnsPolicyConfig;        // #25
  policy_meta?: PolicyMetaConfig;              // #26
}

// ── Main Store Config ──

export interface StoreConfig {
  // Template
  template?: TemplateName;

  // Core sections (existing)
  hero?: HeroConfig;
  about?: AboutConfig;
  contact?: ContactConfig;
  sections_order?: string[];
  enable_whatsapp_order?: boolean;

  // Branding & theming
  design_tokens?: DesignTokens;
  logo_url?: string;
  custom_css?: string;

  // Section-based architecture
  sections?: SectionConfig[];

  // SEO
  seo?: SEOConfig;

  /**
   * Schneiders-template options bundle.
   * All fields are optional — storefront falls back to the same hardcoded
   * defaults that shipped originally, so existing tenants keep working.
   */
  schneiders?: SchneidersConfig;
}

// ── Defaults (single source of truth, reused by storefront + editor) ──

export const SCHNEIDERS_DEFAULTS: Required<Omit<SchneidersConfig, "trust_pills">> & {
  trust_pills: TrustPillConfig[];
} = {
  testimonial: {
    enabled: true,
    quote: "The delivery was incredibly fast! The quality is amazing!",
    reviewer_name: "Lina K.",
    reviewer_city: "Erbil",
    avatar_url: "",
    rating: 5,
    badge_text: "5 ★ RATED",
  },
  social_proof: {
    enabled: true,
    source: "manual",
    manual_number: 247,
    label: "Items delivered in the last 24h",
  },
  delivery_promise: {
    baghdad_hours: 24,
    provinces_hours: 48,
    inspection_text: "Inspect before paying",
    governorates_covered: [
      "Baghdad", "Basra", "Erbil", "Mosul", "Najaf", "Karbala",
      "Sulaymaniyah", "Kirkuk", "Anbar", "Babil", "Diwaniyah",
      "Diyala", "Dhi Qar", "Maysan", "Muthanna", "Salah ad-Din",
      "Wasit", "Dohuk",
    ],
  },
  shipping: {
    baghdad_threshold_iqd: 75_000,
    provinces_threshold_iqd: 100_000,
    baghdad_fee_iqd: 5_000,
    provinces_fee_iqd: 7_500,
    express_fee_iqd: 10_000,
    governorate_pricing: [],
  },
  reassurance: {
    call_within_min: 30,
    support_hours: "Sat–Thu, 9am–9pm",
  },
  promo_bar: {
    enabled: true,
    messages: [
      "✨ 24h Delivery • Cash on Delivery • 15% Off First Order 🎉",
    ],
  },
  accent_pair: {
    primary: "pink",
    secondary: "mint",
  },
  wedge_intensity: "playful",
  wordmark_style: "italic-yellow-box",
  trust_pills: [
    { label: "Cash on Delivery", icon: "payments", bg: "mint", enabled: true },
    { label: "24h Express", icon: "bolt", bg: "butter", enabled: true },
    { label: "100% Original", icon: "verified", bg: "sky", enabled: true },
    { label: "Easy Returns", icon: "sentiment_satisfied", bg: "lilac", enabled: true },
  ],
  hero_ctas: {
    primary_label: "Shop Now",
    secondary_kind: "whatsapp",
  },
  home_sections: {
    promo_bar: true,
    hero: true,
    trust_strip: true,
    categories: true,
    for_you: true,
    new_arrivals: true,
    about: false,
    customer_love: true,
    gift_guides: true,
    trust_banner: true,
    newsletter: false,
  },
  pdp: {
    show_stock_urgency: true,
    show_star_rating: true,
    show_size_guide_link: true,
    related_products_count: 4,
    show_delivery_card: true,
    show_about_collapsible: true,
  },
  cart: {
    show_promo_code: true,
    promo_codes: [{ code: "WELCOME15", percent_off: 15 }],
    show_whatsapp_alternative: true,
    show_upsell_rail: true,
  },
  checkout: {
    payment_methods_enabled: ["cod"],
    notes_field: true,
    agree_to_terms_required: true,
  },
  whatsapp_templates: {
    pdp_template: "Hi! I'd like to order:\n\n{product_name}{variant_block}\nQty: {qty}\nTotal: {total}",
    cart_template: "Hi! I'd like to place this order:\n\n{items}\n\nTotal: {total}",
    support_template: "Hi! I have a question:",
  },
  order_confirm: {
    call_within_min: 30,
    send_whatsapp_confirmation: true,
    send_sms_confirmation: false,
    thank_you_subheadline: "To confirm your address and delivery time. No upfront payment needed.",
  },
  analytics: {},
  empty_states: {
    fallback_categories: [
      { slug: "shoes", label: "Shoes", emoji: "👟", bg: "mint" },
      { slug: "skincare", label: "Skincare", emoji: "🧴", bg: "butter" },
      { slug: "fashion", label: "Fashion", emoji: "👕", bg: "pink" },
      { slug: "home", label: "Home", emoji: "🏠", bg: "sky" },
    ],
    empty_cart_message: "Your cart is empty 🛒",
    not_found_message: "This page is on vacation 🏖️",
  },
  sale_sticker: {
    style: "absolute_iqd",
    label: "LIMITED TIME",
    rotate_deg: -8,
    bg: "pink",
  },
  best_sellers_label: "Best Sellers",
  free_gift: {
    enabled: false,
    threshold_iqd: 150_000,
    label: "Free Gift with this order 🎁",
    image_url: "",
  },
  newsletter_popup: {
    enabled: false,
    discount_iqd: 15_000,
    label: "Get 15,000 IQD off your first order",
    popup_after_seconds: 30,
    popup_after_pages: 1,
  },
  returns_policy: {
    window_days: 7,
  },
  policy_meta: {
    last_updated_label: "May 2026",
  },
};

/** Merge tenant config with defaults to produce a fully-resolved config
 *  ready for rendering. Deep-merges nested objects one level. */
export function resolveSchneidersConfig(
  config: SchneidersConfig | null | undefined,
): typeof SCHNEIDERS_DEFAULTS {
  const c = config ?? {};
  return {
    testimonial: { ...SCHNEIDERS_DEFAULTS.testimonial, ...(c.testimonial ?? {}) },
    social_proof: { ...SCHNEIDERS_DEFAULTS.social_proof, ...(c.social_proof ?? {}) },
    delivery_promise: { ...SCHNEIDERS_DEFAULTS.delivery_promise, ...(c.delivery_promise ?? {}) },
    shipping: { ...SCHNEIDERS_DEFAULTS.shipping, ...(c.shipping ?? {}) },
    reassurance: { ...SCHNEIDERS_DEFAULTS.reassurance, ...(c.reassurance ?? {}) },
    promo_bar: { ...SCHNEIDERS_DEFAULTS.promo_bar, ...(c.promo_bar ?? {}) },
    accent_pair: { ...SCHNEIDERS_DEFAULTS.accent_pair, ...(c.accent_pair ?? {}) },
    wedge_intensity: c.wedge_intensity ?? SCHNEIDERS_DEFAULTS.wedge_intensity,
    wordmark_style: c.wordmark_style ?? SCHNEIDERS_DEFAULTS.wordmark_style,
    trust_pills: c.trust_pills ?? SCHNEIDERS_DEFAULTS.trust_pills,
    hero_ctas: { ...SCHNEIDERS_DEFAULTS.hero_ctas, ...(c.hero_ctas ?? {}) },
    home_sections: { ...SCHNEIDERS_DEFAULTS.home_sections, ...(c.home_sections ?? {}) },
    pdp: { ...SCHNEIDERS_DEFAULTS.pdp, ...(c.pdp ?? {}) },
    cart: { ...SCHNEIDERS_DEFAULTS.cart, ...(c.cart ?? {}) },
    checkout: { ...SCHNEIDERS_DEFAULTS.checkout, ...(c.checkout ?? {}) },
    whatsapp_templates: { ...SCHNEIDERS_DEFAULTS.whatsapp_templates, ...(c.whatsapp_templates ?? {}) },
    order_confirm: { ...SCHNEIDERS_DEFAULTS.order_confirm, ...(c.order_confirm ?? {}) },
    analytics: { ...SCHNEIDERS_DEFAULTS.analytics, ...(c.analytics ?? {}) },
    empty_states: { ...SCHNEIDERS_DEFAULTS.empty_states, ...(c.empty_states ?? {}) },
    sale_sticker: { ...SCHNEIDERS_DEFAULTS.sale_sticker, ...(c.sale_sticker ?? {}) },
    best_sellers_label: c.best_sellers_label ?? SCHNEIDERS_DEFAULTS.best_sellers_label,
    free_gift: { ...SCHNEIDERS_DEFAULTS.free_gift, ...(c.free_gift ?? {}) },
    newsletter_popup: { ...SCHNEIDERS_DEFAULTS.newsletter_popup, ...(c.newsletter_popup ?? {}) },
    returns_policy: { ...SCHNEIDERS_DEFAULTS.returns_policy, ...(c.returns_policy ?? {}) },
    policy_meta: { ...SCHNEIDERS_DEFAULTS.policy_meta, ...(c.policy_meta ?? {}) },
  };
}
