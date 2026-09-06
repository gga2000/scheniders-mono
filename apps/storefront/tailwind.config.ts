import type { Config } from "tailwindcss";

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
    { pattern: /^bg-bk-(primary|secondary|accent|surface|surface-alt|ink|success|danger|primary-hover|primary-active|primary-soft|primary-disabled)$/ },
    { pattern: /^text-bk-(primary|secondary|accent|surface|surface-alt|ink|success|danger|on-primary|on-secondary|on-accent|ink-soft|ink-faint|primary-active|primary-disabled)$/ },
    { pattern: /^border-bk-(primary|secondary|accent|surface|surface-alt|ink|success|danger|divider)$/ },
    { pattern: /^(rounded|shadow)-bk-(card|button|input|pill)$/ },
    { pattern: /^ring-bk-focus$/ },
    { pattern: /^(px|py|p|gap|gap-x|gap-y|space-y|space-x|mb|mt)-bk-(2xs|xs|sm|md|lg|xl|2xl|section|section-dense|section-generous)$/ },
    { pattern: /^text-bk-(hero|h1|h2|h3)$/ },
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
        bk: {
          primary: "var(--bk-primary)",
          secondary: "var(--bk-secondary)",
          accent: "var(--bk-accent)",
          surface: "var(--bk-surface)",
          "surface-alt": "var(--bk-surface-alt)",
          surfaceAlt: "var(--bk-surface-alt)",
          ink: "var(--bk-ink)",
          success: "var(--bk-success)",
          danger: "var(--bk-danger)",
          "on-primary": "var(--bk-on-primary)",
          "on-secondary": "var(--bk-on-secondary)",
          "on-accent": "var(--bk-on-accent)",
          "primary-hover": "var(--bk-primary-hover)",
          "primary-active": "var(--bk-primary-active)",
          "primary-soft": "var(--bk-primary-soft)",
          "primary-disabled": "var(--bk-primary-disabled)",
          "ink-soft": "var(--bk-ink-soft)",
          "ink-faint": "var(--bk-ink-faint)",
          divider: "var(--bk-divider)",
        },
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
        marquee: "marquee 22s linear infinite",
        "sticker-pop": "stickerPop 0.3s ease-out both",
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
