import type { Config } from "tailwindcss";

/**
 * Brand-kit v2 palette — single source of truth, driven by the `--bk-*` vars
 * that `buildBrandKitVars` emits on the tenant layout root.
 */
const bkPalette: Record<string, AlphaColorValue> = {
        primary: bk("bk-primary"),
        secondary: bk("bk-secondary"),
        accent: bk("bk-accent"),
        surface: bk("bk-surface"),
        "surface-alt": bk("bk-surface-alt"),
        surfaceAlt: bk("bk-surface-alt"),
        ink: bk("bk-ink"),
        success: bk("bk-success"),
        danger: bk("bk-danger"),
        "on-primary": bk("bk-on-primary"),
        "on-secondary": bk("bk-on-secondary"),
        "on-accent": bk("bk-on-accent"),
        "primary-hover": bk("bk-primary-hover"),
        "primary-active": bk("bk-primary-active"),
        "primary-soft": bk("bk-primary-soft"),
        "primary-disabled": bk("bk-primary-disabled"),
        "ink-soft": bk("bk-ink-soft"),
        "ink-faint": bk("bk-ink-faint"),
        divider: bk("bk-divider"),
        // Decorative surfaces — derived from the accent hue at fixed
        // offsets. These replace the old fixed candy pastels, which no
        // tenant could recolour. `on-decor` is the one readable
        // foreground for all three (see brand-kit-vars.ts).
        "decor-a": bk("bk-decor-a"),
        "decor-b": bk("bk-decor-b"),
        "decor-c": bk("bk-decor-c"),
        "on-decor": bk("bk-on-decor"),
      };

/**
 * A brand-kit colour that survives an opacity modifier.
 *
 * Tailwind v3 can only apply `/40` to a colour it can break into channels.
 * A bare `var(--bk-ink)` cannot be broken up, so v3 silently emits **no rule
 * at all** for `text-bk-ink/60`, `bg-bk-ink/20`, `border-bk-ink/10` and every
 * other modifier in the section library — the class lands in the shipped HTML
 * and matches nothing. Muted text rendered at full ink, tinted panels rendered
 * with no background, and hairline borders fell back to `currentColor`.
 * 45 distinct utilities were dead this way.
 *
 * Returning a function is Tailwind's documented answer for a CSS-variable
 * colour. It also keeps the `--bk-*` variables as whole colours, which the many
 * call sites reading `var(--bk-primary)` directly depend on, and leaves a
 * colour with no modifier byte-identical to what it compiled to before — so
 * where `color-mix` is unsupported the page loses a tint, never a brand colour.
 */
type AlphaColorValue = (options: { opacityValue?: string }) => string;

function bk(name: string): AlphaColorValue {
  return ({ opacityValue }) =>
    opacityValue === undefined
      ? `var(--${name})`
      : `color-mix(in srgb, var(--${name}) calc(${opacityValue} * 100%), transparent)`;
}

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./templates/**/*.{js,ts,jsx,tsx,mdx}",
    // The storefront renders @scheniders/sections — scan their source so
    // section-only utility classes (e.g. `sm:flex`) are generated, not just
    // the ones that happen to also appear in app/components/templates.
    "../../packages/sections/src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Brand-kit color utilities — used dynamically by section render code,
    // so safelist them by pattern.
    { pattern: /^bg-bk-(primary|secondary|accent|surface|surface-alt|ink|success|danger|primary-hover|primary-active|primary-soft|primary-disabled|decor-a|decor-b|decor-c)$/ },
    { pattern: /^text-bk-(primary|secondary|accent|surface|surface-alt|ink|success|danger|on-primary|on-secondary|on-accent|ink-soft|ink-faint|primary-active|primary-disabled|on-decor)$/ },
    { pattern: /^border-bk-(primary|secondary|accent|surface|surface-alt|ink|success|danger|divider|decor-a|decor-b|decor-c)$/ },
    { pattern: /^(rounded|shadow)-bk-(card|button|input|pill)$/ },
    { pattern: /^ring-bk-focus$/ },
    { pattern: /^duration-bk-(fast|base)$/ },
    { pattern: /^(px|py|p|gap|gap-x|gap-y|space-y|space-x|mb|mt)-bk-(2xs|xs|sm|md|lg|xl|2xl|section|section-dense|section-generous)$/ },
    { pattern: /^text-bk-(hero|h1|h2|h3|chapter)$/ },
    { pattern: /^font-(bk-display|bk-body)$/ },
  ],
  theme: {
    extend: {
      spacing: {
        "bk-2xs": "var(--bk-space-2xs)",
        "bk-xs": "var(--bk-space-xs)",
        "bk-sm": "var(--bk-space-sm)",
        "bk-md": "var(--bk-space-md)",
        "bk-lg": "var(--bk-space-lg)",
        "bk-xl": "var(--bk-space-xl)",
        "bk-2xl": "var(--bk-space-2xl)",
        "bk-section": "var(--bk-section-y)",
        "bk-section-dense": "var(--bk-section-y-dense)",
        "bk-section-generous": "var(--bk-section-y-generous)",
      },
      fontSize: {
        "bk-hero": ["var(--bk-text-hero)", { lineHeight: "1.0" }],
        "bk-h1": ["var(--bk-text-h1)", { lineHeight: "1.1" }],
        "bk-h2": ["var(--bk-text-h2)", { lineHeight: "1.15" }],
        "bk-h3": ["var(--bk-text-h3)", { lineHeight: "1.25" }],
        "bk-chapter": ["var(--bk-text-chapter)", { lineHeight: "1.2" }],
      },
      colors: {
        // Tenant-customizable colors driven by CSS variables (legacy).
        brand: {
          primary: "var(--brand-primary, #3b82f6)",
          secondary: "var(--brand-secondary, #8b5cf6)",
          accent: "var(--brand-accent, #f59e0b)",
        },
        // Schneiders "Candy Bento" palette (legacy).
        candy: {
          pink: "#ff5a8a",
          mint: "#7cf0bd",
          butter: "#ffd84a",
          lilac: "#c5b6ff",
          sky: "#9ad8ff",
          cream: "#fff7ed",
          ink: "#1a1a1a",
        },
        // Brand-kit v2 — single source of truth, driven by `--bk-*` vars
        // emitted by `buildBrandKitVars` on the tenant layout root.
        // Tailwind v3.4 resolves a colour value that is a function — the
        // documented way to make a CSS-variable colour answer an opacity
        // modifier — but its published `Config` type admits colour values of
        // type `string` only (`RecursiveKeyValuePair<string, string>`,
        // tailwindcss/types/config.d.ts:96). This cast is that upstream gap and
        // nothing else: `bkPalette` above is fully typed, and
        // `lib/brand-kit-alpha.test.ts` asserts every entry's runtime shape.
        bk: bkPalette as unknown as Record<string, string>,
      },
      fontFamily: {
        sans: ["var(--brand-font, system-ui)", "sans-serif"],
        // The four utilities used by section markup MUST agree with the brand
        // kit: an explicit `font-body` class beats the inherited
        // `--bk-font-body` cascade, so without the token here every element
        // carrying the class rendered Arabic in the OS fallback serif (Cairo
        // stores lost their font on descriptions, footers, nav, policies…).
        // `--bk-font-*` already expands to a full stack (tenant face → Latin
        // brand face → 'Noto Sans Arabic'); the fallbacks below only apply
        // outside the tenant wrapper where the token is unset.
        display: ["var(--bk-font-display, var(--font-bricolage))", "'Bricolage Grotesque'", "'Noto Sans Arabic'", "sans-serif"],
        headline: ["var(--bk-font-display, var(--font-bricolage))", "'Bricolage Grotesque'", "'Noto Sans Arabic'", "sans-serif"],
        body: ["var(--bk-font-body, var(--font-dm-sans))", "'DM Sans'", "'Noto Sans Arabic'", "sans-serif"],
        label: ["var(--bk-font-body, var(--font-dm-sans))", "'DM Sans'", "'Noto Sans Arabic'", "sans-serif"],
        // Brand-kit v2 fonts — driven by `--bk-font-*`.
        "bk-display": ["var(--bk-font-display)", "sans-serif"],
        "bk-body": ["var(--bk-font-body)", "sans-serif"],
      },
      transitionDuration: {
        // `BrandMotion.speed` emits --bk-duration-*, but nothing consumed
        // them, so slow / normal / snappy was a no-op on the storefront.
        // Sections use two tiers: `fast` for pointer feedback (hover,
        // press), `base` for expressive movement (image zoom, sticky
        // bars). Defaults are 150ms / 250ms.
        "bk-fast": "var(--bk-duration-fast)",
        "bk-base": "var(--bk-duration-base)",
      },
      borderWidth: {
        "3": "3px",
        "bk": "var(--bk-border-thickness)",
        "bk-bold": "var(--bk-border-thickness-bold)",
      },
      borderRadius: {
        "bk-card": "var(--bk-radius-card)",
        "bk-input": "var(--bk-radius-input)",
        "bk-pill": "var(--bk-radius-pill)",
      },
      ringColor: {
        "bk-focus": "var(--bk-focus-ring)",
      },
      boxShadow: {
        bento: "4px 4px 0px 0px rgba(26, 26, 26, 1)",
        "bento-sm": "2px 2px 0px 0px rgba(26, 26, 26, 1)",
        "bento-lg": "6px 6px 0px 0px rgba(26, 26, 26, 1)",
        "bento-inset-top": "0 -4px 0 0 rgba(26, 26, 26, 1)",
        "bk-card": "var(--bk-shadow-card)",
        "bk-button": "var(--bk-shadow-button)",
      },
      animation: {
        // The drift tier, so `BrandMotion.speed` governs the one piece of
        // motion that runs continuously on the page and not only the hover
        // feedback. Fallback is the fixed value it used to be.
        marquee: "marquee var(--bk-duration-drift, 22000ms) linear infinite",
        "sticker-pop": "stickerPop var(--bk-duration-base, 250ms) ease-out both",
      },

      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        stickerPop: {
          "0%": { transform: "scale(0.5)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
