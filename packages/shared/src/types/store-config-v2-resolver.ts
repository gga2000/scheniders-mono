// =====================================================================
// Store Config v2 — Variant resolver
// =====================================================================
// The single function that powers 11 features (multi-locale, breakpoint,
// scheduled changes, A/B tests, segments, per-product overrides, etc.).
//
// Pure. Synchronous. Deterministic. Property-tested.
// =====================================================================

import type {
  AudienceSegment,
  GlobalSections,
  PageConfig,
  PageId,
  RuntimeContext,
  SectionInstance,
  SegmentRule,
  StoreConfigV2,
  Variant,
  VariantCondition,
  VisibilityRule,
} from "./store-config-v2";

/* ─────────────────────────────────────────────────────────────────── */
/* Variant matching                                                     */
/* ─────────────────────────────────────────────────────────────────── */

function matchCondition(c: VariantCondition, ctx: RuntimeContext): boolean {
  switch (c.kind) {
    case "locale":
      return c.values.includes(ctx.locale);
    case "breakpoint":
      return c.values.includes(ctx.breakpoint);
    case "page":
      return c.values.includes(ctx.page_id);
    case "governorate":
      return ctx.governorate ? c.values.includes(ctx.governorate) : false;
    case "product":
      return ctx.product_id ? c.product_ids.includes(ctx.product_id) : false;
    case "category":
      return ctx.category_id ? c.category_ids.includes(ctx.category_id) : false;
    case "audience":
      return ctx.audience_segments.includes(c.segment_id);
    case "ab_test":
      return ctx.ab_test_arms[c.experiment_id] === c.arm;
    case "time_window": {
      const now = ctx.now.getTime();
      const start = Date.parse(c.start_iso);
      if (Number.isNaN(start)) return false;
      if (now < start) return false;
      if (c.end_iso) {
        const end = Date.parse(c.end_iso);
        if (!Number.isNaN(end) && now > end) return false;
      }
      return true;
    }
    default: {
      // Exhaustiveness — TS guards this at compile time.
      const _exhaustive: never = c;
      return _exhaustive;
    }
  }
}

function variantMatches(v: Variant, ctx: RuntimeContext): boolean {
  if (v.enabled === false) return false;
  // ALL conditions must match (AND semantics). Empty conditions = always match.
  return v.conditions.every((c) => matchCondition(c, ctx));
}

/* ─────────────────────────────────────────────────────────────────── */
/* Deep merge — preserves type tag for discriminated unions             */
/* ─────────────────────────────────────────────────────────────────── */

function isPlainObject(x: unknown): x is Record<string, unknown> {
  if (x === null || typeof x !== "object") return false;
  const proto = Object.getPrototypeOf(x);
  return proto === null || proto === Object.prototype;
}

/**
 * Deep merge two plain objects. Arrays are REPLACED (not concatenated)
 * because for our domain (e.g. `product_ids`, `trust_pills`), the merchant
 * intent on override is "replace" not "extend".
 */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Partial<T>,
): T {
  if (!isPlainObject(override)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(
        out[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Public API                                                           */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Resolve a section's final props by applying matching variants in
 * ascending priority order (low first, high last — so high wins).
 *
 * Determinism: same (instance, ctx) always returns the same props.
 */
export function resolveSection<Props extends Record<string, unknown>>(
  instance: SectionInstance,
  ctx: RuntimeContext,
): Props {
  const matched = (instance.variants ?? [])
    .filter((v) => variantMatches(v, ctx))
    .sort((a, b) => a.priority - b.priority);
  return matched.reduce(
    (acc, v) => deepMerge(acc, v.override as Partial<typeof acc>),
    instance.base,
  ) as Props;
}

/**
 * Resolve whether all of a section's visibility rules match the runtime
 * context. Empty / missing rules always pass.
 */
export function matchesVisibility(
  rules: VisibilityRule[] | undefined,
  ctx: RuntimeContext,
): boolean {
  if (!rules || rules.length === 0) return true;
  // VisibilityRule is a strict subset of VariantCondition, so the same
  // matcher applies — ALL rules must match (AND semantics).
  return rules.every((r) => matchCondition(r as VariantCondition, ctx));
}

/**
 * Resolve whether a section is enabled in the current context. A variant
 * may toggle `enabled` itself via `override: { enabled: false }`. If the
 * instance has `visibility` rules, ALL must match — otherwise the section
 * is treated as disabled (hidden) for this context.
 */
export function isSectionEnabled(
  instance: SectionInstance,
  ctx: RuntimeContext,
): boolean {
  if (!instance.enabled) return false;
  if (!matchesVisibility(instance.visibility, ctx)) return false;
  const props = resolveSection<{ enabled?: boolean }>(instance, ctx);
  return props.enabled !== false;
}

/**
 * Resolve a whole page's sections — filtering disabled, applying variants.
 */
export function resolvePage(
  config: StoreConfigV2,
  ctx: RuntimeContext,
): Array<{ instance: SectionInstance; props: Record<string, unknown> }> {
  const page = config.pages.find((p) => p.page_id === ctx.page_id);
  if (!page) return [];
  return page.sections
    .filter((s) => isSectionEnabled(s, ctx))
    .map((s) => ({ instance: s, props: resolveSection(s, ctx) }));
}

/**
 * Resolve global sections (header, footer, promo bar) for the current ctx.
 */
export function resolveGlobals(
  globals: GlobalSections,
  ctx: RuntimeContext,
): Partial<Record<keyof GlobalSections, Record<string, unknown>>> {
  const out: Partial<Record<keyof GlobalSections, Record<string, unknown>>> = {};
  for (const [slot, instance] of Object.entries(globals)) {
    if (!instance || !isSectionEnabled(instance, ctx)) continue;
    out[slot as keyof GlobalSections] = resolveSection(instance, ctx);
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Audience-segment evaluation                                          */
/* ─────────────────────────────────────────────────────────────────── */

export interface SegmentEvalContext {
  /** Visitor's first hit ≤ this many minutes ago. */
  minutes_since_first_visit: number;
  /** True if visitor has any cookie/session record from a previous visit. */
  is_returning: boolean;
  /** True if visitor's phone matches a prior completed order. */
  has_ordered_before: boolean;
  /** Total IQD in cart right now. */
  cart_total_iqd: number;
  /** Minutes since last cart activity (Infinity if no cart). */
  minutes_since_cart_activity: number;
  /** Visitor governorate (geo-IP or last order). */
  governorate?: import("../governorates").GovernorateCode;
  /** UTM source bucketed. */
  traffic_source?: "meta" | "tiktok" | "google" | "whatsapp" | "direct";
  /** Current breakpoint. */
  breakpoint: import("./store-config-v2").Breakpoint;
}

function evalRule(rule: SegmentRule, ctx: SegmentEvalContext): boolean {
  switch (rule.kind) {
    case "first_visit":
      return rule.within_minutes
        ? ctx.minutes_since_first_visit <= rule.within_minutes
        : !ctx.is_returning;
    case "returning_visitor":
      return ctx.is_returning;
    case "has_ordered_before":
      return ctx.has_ordered_before;
    case "cart_total":
      return rule.op === ">="
        ? ctx.cart_total_iqd >= rule.value_iqd
        : ctx.cart_total_iqd <= rule.value_iqd;
    case "abandoned_cart":
      return ctx.minutes_since_cart_activity >= rule.minutes_since && ctx.cart_total_iqd > 0;
    case "governorate":
      return ctx.governorate ? rule.values.includes(ctx.governorate) : false;
    case "traffic_source":
      return ctx.traffic_source ? rule.values.includes(ctx.traffic_source) : false;
    case "device":
      return rule.values.includes(ctx.breakpoint);
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

/** Returns the set of segment ids the visitor matches. */
export function evaluateSegments(
  segments: AudienceSegment[],
  ctx: SegmentEvalContext,
): string[] {
  return segments
    .filter((s) => {
      const results = s.rules.map((r) => evalRule(r, ctx));
      return s.combine === "any" ? results.some(Boolean) : results.every(Boolean);
    })
    .map((s) => s.id);
}

/* ─────────────────────────────────────────────────────────────────── */
/* A/B test arm assignment — sticky via deterministic hashing            */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Deterministically assign a visitor to an arm given a stable visitor key
 * (e.g. cookie ID). Uses splitmix32-style hashing for an even distribution.
 *
 * Returns the arm id, or null if the experiment is not running.
 */
export function assignAbArm(
  experiment: import("./store-config-v2").Experiment,
  visitorKey: string,
): string | null {
  if (experiment.status !== "running") return null;
  if (!experiment.arms.length) return null;
  const totalPct = experiment.arms.reduce((s, a) => s + a.traffic_pct, 0);
  if (totalPct <= 0) return null;
  const bucket = hashToBucket(`${experiment.id}:${visitorKey}`, totalPct);
  let cum = 0;
  for (const arm of experiment.arms) {
    cum += arm.traffic_pct;
    if (bucket < cum) return arm.id;
  }
  return experiment.arms[experiment.arms.length - 1].id;
}

function hashToBucket(input: string, mod: number): number {
  // FNV-1a 32-bit — fast, deterministic, no deps.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h) % mod;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Empty/default config — used for fresh tenants                        */
/* ─────────────────────────────────────────────────────────────────── */

export const EMPTY_BRAND_KIT: import("./store-config-v2").BrandKit = {
  identity: {},
  colors: {
    primary: "#ff5a8a",
    secondary: "#7cf0bd",
    accent: "#ffd84a",
    surface: "#fff7ed",
    surface_alt: "#ffffff",
    ink: "#1a1a1a",
    // Candy Bento equates success with mint (#7cf0bd) — see DESIGN.md
    // ("Mint #7cf0bd — success / WhatsApp / fresh accent"). The old emerald
    // (#22c55e) made every --bk-success surface off-palette.
    success: "#7cf0bd",
    danger: "#ef4444",
  },
  typography: {
    display: "Bricolage Grotesque",
    body: "DM Sans",
    scale: "comfortable",
  },
  shape: {
    radius: "round",
    border_thickness: "chunky",
    shadow_style: "hard-offset",
    rotation_intensity: "playful",
  },
  motion: { enabled: true, speed: "normal" },
  voice: { formality: "playful" },
};

export function emptyStoreConfigV2(): StoreConfigV2 {
  const defaultPage = (id: PageId): PageConfig => ({ page_id: id, sections: [] });
  return {
    schema_version: 2,
    brand_kit: EMPTY_BRAND_KIT,
    pages: (
      [
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
      ] as PageId[]
    ).map(defaultPage),
    globals: {},
    experiments: [],
    segments: [],
    schedules: [],
    default_locale: "en",
    enabled_locales: ["en"],
  };
}
