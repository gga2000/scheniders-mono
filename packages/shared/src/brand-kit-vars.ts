// =====================================================================
// Brand-kit CSS-variable emitter
// =====================================================================
// Pure function that turns a `BrandKit` (single source of truth for
// visual identity) into a flat `React.CSSProperties` object of `--bk-*`
// custom properties. The storefront layout spreads the result on the
// root `<div>`; downstream components consume the tokens via the
// `bk-*` Tailwind theme tokens or by reading the vars directly.
//
// 37 variables emitted, namespaced `--bk-*`:
//   - 22 colors (8 base + 11 derived + 3 fixed candy accents)
//   -  4 typography
//   -  7 shape (radius, borders, shadows)
//   -  3 motion
//   -  1 wedge multiplier
//   -  9 misc (covered by the above categories — see VAR_NAMES below)
//
// All values are deterministic and safe to call during SSR.
// Invalid colour inputs silently fall back to `EMPTY_BRAND_KIT.colors`
// equivalents — never throws.
// =====================================================================

import type React from "react";
import type {
  BrandKit,
  BrandShape,
  BrandMotion,
  BrandTypography,
} from "./types/store-config-v2";
import { EMPTY_BRAND_KIT } from "./types/store-config-v2-resolver";

/* ─────────────────────────────────────────────────────────────────── */
/* Color helpers — no deps                                              */
/* ─────────────────────────────────────────────────────────────────── */

const HEX_RE = /^#([0-9a-f]{6})$/i;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse `#rrggbb`. Returns null on any malformed input. */
function parseHex(hex: string | undefined | null): Rgb | null {
  if (!hex || typeof hex !== "string") return null;
  const m = HEX_RE.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return {
    r: (n >> 16) & 0xff,
    g: (n >> 8) & 0xff,
    b: n & 0xff,
  };
}

/** Sanitize a hex string against a fallback. Always returns a valid `#rrggbb`. */
function safeHex(hex: string | undefined, fallback: string): string {
  return parseHex(hex) ? hex!.toLowerCase() : fallback.toLowerCase();
}

/** Format an `Rgb` as `#rrggbb`. */
function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Relative luminance per WCAG 2.x. Returns 0–1.
 * Used to decide whether overlay text should be light or dark.
 */
function luminance(rgb: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Linear blend of two RGB colours. `t` is the weight of `b` (0..1). */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const w = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * w,
    g: a.g + (b.g - a.g) * w,
    b: a.b + (b.b - a.b) * w,
  };
}

/** `rgb(r g b / a)` string with `a` clamped to [0, 1]. */
function rgba(rgb: Rgb, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  return `rgb(${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)} / ${a})`;
}

/** RGB → HSL. `h` in degrees [0, 360), `s`/`l` in [0, 1]. */
function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}

/** HSL → RGB. `h` in degrees (wrapped), `s`/`l` in [0, 1]. */
function hslToRgb(h: number, s: number, l: number): Rgb {
  const hn = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    hn < 60 ? [c, x, 0]
    : hn < 120 ? [x, c, 0]
    : hn < 180 ? [0, c, x]
    : hn < 240 ? [0, x, c]
    : hn < 300 ? [x, 0, c]
    : [c, 0, x];
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

/**
 * Decorative surface band. Sections use three tinted surfaces to separate
 * adjacent blocks (note cards, FAQ icons, filter chips, announcement
 * tones). They must satisfy two constraints at once:
 *
 *   1. Follow the tenant's brand — a fixed pastel is unthemeable, which is
 *      what pinning them to mint/lilac/sky literals got us.
 *   2. Never collapse into one another — deriving each from a *different*
 *      brand colour did exactly that whenever a tenant set `secondary`
 *      close to `success`.
 *
 * Both hold if all three come from ONE anchor hue at fixed offsets, with
 * saturation and lightness clamped to a single band. Distinctness is then
 * a property of the offsets, not of the merchant's palette.
 */
const DECOR_HUE_OFFSETS = [0, 42, 200] as const;
const DECOR_SATURATION = { min: 0.42, max: 0.72 } as const;
const DECOR_LIGHTNESS = 0.82;
/**
 * Foreground lightness for the decorative band. It is NOT `onColor(...)`:
 * that picks between white and the tenant's ink, and a tenant running a
 * dark surface has a near-white ink, which on these permanently light
 * surfaces renders light-on-light. Because the band's lightness is fixed,
 * the readable foreground is fixed too — a deep shade of the same hue,
 * which keeps it on-brand while clearing AA by construction.
 */
const DECOR_INK_LIGHTNESS = 0.16;

function decorHue(anchor: Rgb): { h: number; sat: number } {
  const { h, s } = rgbToHsl(anchor);
  return {
    h,
    sat: Math.max(DECOR_SATURATION.min, Math.min(DECOR_SATURATION.max, s)),
  };
}

function decorSurface(anchor: Rgb, hueOffset: number): string {
  const { h, sat } = decorHue(anchor);
  return toHex(hslToRgb(h + hueOffset, sat, DECOR_LIGHTNESS));
}

function decorForeground(anchor: Rgb): string {
  const { h, sat } = decorHue(anchor);
  return toHex(hslToRgb(h, sat, DECOR_INK_LIGHTNESS));
}

/* ─────────────────────────────────────────────────────────────────── */
/* Token tables                                                         */
/* ─────────────────────────────────────────────────────────────────── */

const RADIUS_CARD_PX: Record<BrandShape["radius"], number> = {
  none: 0,
  soft: 8,
  round: 16,
  pill: 9999,
};

const RADIUS_INPUT_PX: Record<BrandShape["radius"], number> = {
  none: 0,
  soft: 6,
  round: 12,
  pill: 9999,
};

const BORDER_THICKNESS_PX: Record<BrandShape["border_thickness"], number> = {
  none: 0,
  thin: 1,
  thick: 2,
  chunky: 3,
};

const SCALE_BASE_REM: Record<BrandTypography["scale"], number> = {
  compact: 0.875,
  comfortable: 1,
  spacious: 1.125,
};

const SCALE_LEADING: Record<BrandTypography["scale"], number> = {
  compact: 1.4,
  comfortable: 1.55,
  spacious: 1.7,
};

const DURATION_FAST_MS: Record<BrandMotion["speed"], number> = {
  snappy: 80,
  normal: 150,
  slow: 300,
};

const DURATION_BASE_MS: Record<BrandMotion["speed"], number> = {
  snappy: 150,
  normal: 250,
  slow: 500,
};

/**
 * Section entrance — the scroll reveal. Deliberately slower than `base`: it
 * moves a whole block of the page, not a control under the pointer. It was a
 * fixed 0.7s, so a merchant who chose "snappy" still watched every section
 * ease in at the same pace as one who chose "slow".
 */
const DURATION_REVEAL_MS: Record<BrandMotion["speed"], number> = {
  snappy: 400,
  normal: 700,
  slow: 1100,
};

/**
 * Ambient loops — the marquee strips. One full pass, so the numbers are in
 * seconds, not the tens of milliseconds the other tiers deal in. Also a fixed
 * value before this: `BrandMotion.speed` governed the hover feedback and
 * nothing about the one piece of motion that runs continuously on the page.
 */
const DURATION_DRIFT_MS: Record<BrandMotion["speed"], number> = {
  snappy: 14000,
  normal: 22000,
  slow: 34000,
};

const WEDGE_MULTIPLIER: Record<BrandShape["rotation_intensity"], number> = {
  none: 0,
  subtle: 0.35,
  playful: 1,
  wild: 1.75,
};

/* ─────────────────────────────────────────────────────────────────── */
/* Shadow string builders                                               */
/* ─────────────────────────────────────────────────────────────────── */

function cardShadow(style: BrandShape["shadow_style"]): string {
  switch (style) {
    case "flat":
      return "none";
    case "soft":
      return "0 4px 12px rgb(0 0 0 / 0.08)";
    case "hard-offset":
      return "4px 4px 0px 0px var(--bk-ink)";
    case "elevated":
      return "0 10px 30px rgb(0 0 0 / 0.18)";
  }
}

function buttonShadow(style: BrandShape["shadow_style"]): string {
  switch (style) {
    case "flat":
      return "none";
    case "soft":
      return "0 2px 6px rgb(0 0 0 / 0.08)";
    case "hard-offset":
      return "2px 2px 0px 0px var(--bk-ink)";
    case "elevated":
      return "0 6px 18px rgb(0 0 0 / 0.16)";
  }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Font-stack builder                                                   */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Families the storefront root layout self-hosts through `next/font/google`
 * and exposes as CSS variables (RC3). The generated face gets a hashed
 * family name, so a stack must reference the variable to use it; the plain
 * name stays as the `var()` fallback for surfaces that do not mount the
 * root layout (platform live-preview, tests) — those resolve exactly as
 * before. Keep in sync with `apps/storefront/app/layout.tsx`.
 */
export const SELF_HOSTED_FONT_VARS: Readonly<Record<string, string>> = {
  "Bricolage Grotesque": "--font-bricolage",
  "DM Sans": "--font-dm-sans",
  Cairo: "--font-cairo",
  "Noto Sans Arabic": "--font-noto-arabic",
};

/** A single font-family entry: the self-hosted `var()` when available, else the quoted name. */
export function fontFamilyRef(name: string): string {
  const cssVar = SELF_HOSTED_FONT_VARS[name];
  return cssVar ? `var(${cssVar}, '${name}')` : `'${name}'`;
}

/** Build a CSS font-family stack from a Google-Font display name. */
export function fontStack(name: string | undefined, fallback: string, kind: "display" | "body"): string {
  const generic = kind === "display" ? "sans-serif" : "sans-serif";
  const cleaned = (name && name.trim()) || fallback;
  // EC14: 'Noto Sans Arabic' covers the Arabic/Kurdish glyphs that the Latin
  // brand faces (Bricolage / DM Sans / most Google display fonts) lack — without
  // it, Arabic text drops to the system font. It is subset to the Arabic
  // unicode-range, so Latin-only stores never download it.
  return `${fontFamilyRef(cleaned)}, ${fontFamilyRef(fallback)}, ${fontFamilyRef("Noto Sans Arabic")}, ${generic}`;
}

/* ─────────────────────────────────────────────────────────────────── */
/* The 40 emitted variable names — exported for tests & debugging       */
/* ─────────────────────────────────────────────────────────────────── */

export const BK_VAR_NAMES = [
  // Colors — base (8)
  "--bk-primary",
  "--bk-secondary",
  "--bk-accent",
  "--bk-surface",
  "--bk-surface-alt",
  "--bk-ink",
  "--bk-success",
  "--bk-danger",
  // Colors — decorative surfaces derived from the accent hue (4)
  "--bk-decor-a",
  "--bk-decor-b",
  "--bk-decor-c",
  "--bk-on-decor",
  // Colors — derived (11)
  "--bk-on-primary",
  "--bk-on-secondary",
  "--bk-on-accent",
  "--bk-primary-hover",
  "--bk-primary-active",
  "--bk-primary-soft",
  "--bk-primary-disabled",
  "--bk-focus-ring",
  "--bk-ink-soft",
  "--bk-ink-faint",
  "--bk-divider",
  // Typography (6)
  "--bk-font-display",
  "--bk-font-body",
  "--bk-font-display-ar",
  "--bk-font-body-ar",
  "--bk-scale-base",
  "--bk-scale-leading",
  // Shape (7)
  "--bk-radius-card",
  "--bk-radius-pill",
  "--bk-radius-input",
  "--bk-border-thickness",
  "--bk-border-thickness-bold",
  "--bk-shadow-card",
  "--bk-shadow-button",
  // Motion (5)
  "--bk-motion",
  "--bk-duration-fast",
  "--bk-duration-base",
  "--bk-duration-reveal",
  "--bk-duration-drift",
  // Wedge / rotation intensity (1)
  "--bk-wedge-multiplier",
] as const;

export type BkVarName = (typeof BK_VAR_NAMES)[number];

/* ─────────────────────────────────────────────────────────────────── */
/* The emitter                                                          */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Build a flat CSS-vars object for a `BrandKit`. Spread on the root
 * `<div style={...}>` of the storefront tenant layout. Pure, SSR-safe,
 * never throws — malformed colour inputs silently fall back to the
 * corresponding `EMPTY_BRAND_KIT.colors` value.
 *
 * Emits exactly the variables listed in `BK_VAR_NAMES` (34 entries
 * grouped into the documented colour/typography/shape/motion surface).
 */
export function buildBrandKitVars(
  kit: BrandKit,
  opts?: {
    /**
     * Locale of the page being rendered. When `ar`/`ku` AND the kit
     * carries an Arabic pairing ([D3]), the MAIN font vars swap to the
     * Arabic stack (Latin face kept as fallback for mixed content).
     * Sections consume the vars via inline styles, so the swap must
     * happen at emit time — a stylesheet `:lang()` override can never
     * beat an inline `font-family: var(--bk-font-display)`.
     */
    locale?: string;
  },
): React.CSSProperties {
  const defaults = EMPTY_BRAND_KIT.colors;

  // Colors — sanitize all inputs against EMPTY_BRAND_KIT.
  const primaryHex = safeHex(kit.colors?.primary, defaults.primary);
  const secondaryHex = safeHex(kit.colors?.secondary, defaults.secondary);
  const accentHex = safeHex(kit.colors?.accent, defaults.accent);
  const surfaceHex = safeHex(kit.colors?.surface, defaults.surface);
  const surfaceAltHex = safeHex(kit.colors?.surface_alt, defaults.surface_alt);
  const inkHex = safeHex(kit.colors?.ink, defaults.ink);
  const successHex = safeHex(kit.colors?.success, defaults.success);
  const dangerHex = safeHex(kit.colors?.danger, defaults.danger);

  // We already validated, so these parses are guaranteed.
  const primary = parseHex(primaryHex)!;
  const secondary = parseHex(secondaryHex)!;
  const accent = parseHex(accentHex)!;
  const ink = parseHex(inkHex)!;

  const onColor = (c: Rgb): string => (luminance(c) < 0.5 ? "#ffffff" : inkHex);

  const [decorA, decorB, decorC] = DECOR_HUE_OFFSETS.map((o) =>
    decorSurface(accent, o),
  ) as [string, string, string];
  const onDecor = decorForeground(accent);

  const primaryHoverHex = toHex(mix(primary, ink, 0.1));
  const primaryActiveHex = toHex(mix(primary, ink, 0.18));
  const primarySoft = rgba(primary, 0.12);
  const primaryDisabled = rgba(primary, 0.4);
  const focusRing = rgba(primary, 0.5);
  // 0.7 clears WCAG AA (4.5:1) for secondary text on the cream/white
  // surfaces; 0.25 failed badly so faint is bumped for de-emphasised labels
  // (placeholders, decorative) while real text uses ink-soft.
  const inkSoft = rgba(ink, 0.7);
  const inkFaint = rgba(ink, 0.38);
  const divider = rgba(ink, 0.1);

  // Typography
  const latinDisplay = fontStack(kit.typography?.display, "Bricolage Grotesque", "display");
  const latinBody = fontStack(kit.typography?.body, "DM Sans", "body");
  // Arabic pairing ([D3]): prepend the Arabic face to the Latin stack so
  // Latin brand names inside Arabic copy still render in the brand face.
  const arDisplayName = kit.typography?.display_ar?.trim();
  const arBodyName = kit.typography?.body_ar?.trim();
  const fontDisplayAr = arDisplayName ? `${fontFamilyRef(arDisplayName)}, ${latinDisplay}` : latinDisplay;
  const fontBodyAr = arBodyName ? `${fontFamilyRef(arBodyName)}, ${latinBody}` : latinBody;
  const isArabicScript = opts?.locale === "ar" || opts?.locale === "ku";
  const fontDisplay = isArabicScript ? fontDisplayAr : latinDisplay;
  const fontBody = isArabicScript ? fontBodyAr : latinBody;
  const scale: BrandTypography["scale"] = kit.typography?.scale ?? "comfortable";
  const scaleBase = SCALE_BASE_REM[scale] ?? SCALE_BASE_REM.comfortable;
  const scaleLeading = SCALE_LEADING[scale] ?? SCALE_LEADING.comfortable;

  // Shape
  const radius: BrandShape["radius"] = kit.shape?.radius ?? "round";
  const borderKey: BrandShape["border_thickness"] = kit.shape?.border_thickness ?? "chunky";
  const shadowStyle: BrandShape["shadow_style"] = kit.shape?.shadow_style ?? "hard-offset";
  const rotationKey: BrandShape["rotation_intensity"] = kit.shape?.rotation_intensity ?? "playful";

  const radiusCardPx = RADIUS_CARD_PX[radius] ?? RADIUS_CARD_PX.round;
  const radiusInputPx = RADIUS_INPUT_PX[radius] ?? RADIUS_INPUT_PX.round;
  const borderPx = BORDER_THICKNESS_PX[borderKey] ?? BORDER_THICKNESS_PX.chunky;
  const borderBoldPx = Math.round(borderPx * 1.33);

  // Motion
  const motionEnabled = kit.motion?.enabled !== false;
  const speed: BrandMotion["speed"] = kit.motion?.speed ?? "normal";
  const fast = DURATION_FAST_MS[speed] ?? DURATION_FAST_MS.normal;
  const base = DURATION_BASE_MS[speed] ?? DURATION_BASE_MS.normal;
  const reveal = DURATION_REVEAL_MS[speed] ?? DURATION_REVEAL_MS.normal;
  const drift = DURATION_DRIFT_MS[speed] ?? DURATION_DRIFT_MS.normal;

  const wedge = WEDGE_MULTIPLIER[rotationKey] ?? WEDGE_MULTIPLIER.playful;

  const vars: Record<string, string | number> = {
    // Colors — base
    "--bk-primary": primaryHex,
    "--bk-secondary": secondaryHex,
    "--bk-accent": accentHex,
    "--bk-surface": surfaceHex,
    "--bk-surface-alt": surfaceAltHex,
    "--bk-ink": inkHex,
    "--bk-success": successHex,
    "--bk-danger": dangerHex,
    // Colors — decorative surfaces. Anchored on the accent hue at fixed
    // offsets so they track the brand yet stay mutually distinct; see
    // `decorSurface`. `on-decor` is computed once because all three share
    // one lightness band, so one foreground reads correctly on all of them
    // — including on a dark-ink tenant, where hardcoded ink did not.
    "--bk-decor-a": decorA,
    "--bk-decor-b": decorB,
    "--bk-decor-c": decorC,
    "--bk-on-decor": onDecor,
    // Colors — derived
    "--bk-on-primary": onColor(primary),
    "--bk-on-secondary": onColor(secondary),
    "--bk-on-accent": onColor(accent),
    "--bk-primary-hover": primaryHoverHex,
    "--bk-primary-active": primaryActiveHex,
    "--bk-primary-soft": primarySoft,
    "--bk-primary-disabled": primaryDisabled,
    "--bk-focus-ring": focusRing,
    "--bk-ink-soft": inkSoft,
    "--bk-ink-faint": inkFaint,
    "--bk-divider": divider,
    // Typography
    "--bk-font-display": fontDisplay,
    "--bk-font-body": fontBody,
    "--bk-font-display-ar": fontDisplayAr,
    "--bk-font-body-ar": fontBodyAr,
    "--bk-scale-base": `${scaleBase}rem`,
    "--bk-scale-leading": String(scaleLeading),
    // Shape
    "--bk-radius-card": `${radiusCardPx}px`,
    "--bk-radius-pill": `9999px`,
    "--bk-radius-input": `${radiusInputPx}px`,
    "--bk-border-thickness": `${borderPx}px`,
    "--bk-border-thickness-bold": `${borderBoldPx}px`,
    "--bk-shadow-card": cardShadow(shadowStyle),
    "--bk-shadow-button": buttonShadow(shadowStyle),
    // Motion
    "--bk-motion": motionEnabled ? "auto" : "reduce",
    "--bk-duration-fast": `${fast}ms`,
    "--bk-duration-base": `${base}ms`,
    "--bk-duration-reveal": `${reveal}ms`,
    "--bk-duration-drift": `${drift}ms`,
    // Wedge
    "--bk-wedge-multiplier": String(wedge),
  };

  // React typings don't expose custom properties on CSSProperties without
  // a cast — this is the idiomatic escape hatch.
  return vars as unknown as React.CSSProperties;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Google-fonts URL builder (used by the tenant layout)                 */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Weights requested for every Google-hosted kit font. Section headings use
 * `font-black` (900); the previous 400-700 request made Google serve 700 and
 * the browser synthesised the rest (P2-2). Families that do not carry a
 * weight are simply omitted by the Google CSS endpoint.
 */
export const BRAND_KIT_FONT_WEIGHTS = "400;500;600;700;800;900";

/**
 * Build a Google Fonts CSS2 URL for the kit's display + body fonts,
 * skipping any name in `skip` (self-hosted by the root layout, see
 * SELF_HOSTED_FONT_VARS) and deduping repeats. Returns `null` if nothing
 * remains to fetch.
 */
export function buildBrandKitFontsUrl(
  kit: BrandKit,
  skip: ReadonlySet<string> = new Set(Object.keys(SELF_HOSTED_FONT_VARS)),
): string | null {
  const names = new Set<string>();
  const add = (n: string | undefined) => {
    if (!n) return;
    const t = n.trim();
    if (!t) return;
    if (skip.has(t)) return;
    names.add(t);
  };
  add(kit.typography?.display);
  add(kit.typography?.body);
  add(kit.typography?.display_ar);
  add(kit.typography?.body_ar);
  if (names.size === 0) return null;
  const families = Array.from(names)
    .map((f) => `family=${f.replace(/\s+/g, "+")}:wght@${BRAND_KIT_FONT_WEIGHTS}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
