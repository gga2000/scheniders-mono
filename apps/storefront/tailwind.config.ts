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
    { pattern: /^font-(bk-display|bk-body)$/ },
  ],
  theme: {
    extend: {
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
        display: ["var(--font-bricolage)", "'Bricolage Grotesque'", "sans-serif"],
        headline: ["var(--font-bricolage)", "'Bricolage Grotesque'", "sans-serif"],
        body: ["var(--font-dm-sans)", "'DM Sans'", "sans-serif"],
        label: ["var(--font-dm-sans)", "'DM Sans'", "sans-serif"],
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
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
