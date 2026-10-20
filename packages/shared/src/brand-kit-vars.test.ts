// =====================================================================
// Tests for the brand-kit CSS-variable emitter.
// =====================================================================

import { describe, expect, it } from "vitest";
import { EMPTY_BRAND_KIT } from "./types/store-config-v2-resolver";
import type { BrandKit } from "./types/store-config-v2";

import {
  BK_VAR_NAMES,
  BRAND_KIT_FONT_WEIGHTS,
  buildBrandKitFontsUrl,
  buildBrandKitVars,
  fontStack,
} from "./brand-kit-vars";

/** Shallow-clone the empty brand kit so individual tests can mutate safely. */
function cloneKit(): BrandKit {
  return JSON.parse(JSON.stringify(EMPTY_BRAND_KIT)) as BrandKit;
}

describe("buildBrandKitVars — default snapshot", () => {
  it("emits exactly the documented variable surface with the expected defaults", () => {
    const vars = buildBrandKitVars(EMPTY_BRAND_KIT) as Record<string, string | number>;
    expect(Object.keys(vars).sort()).toEqual([...BK_VAR_NAMES].sort());
    expect(vars).toMatchInlineSnapshot(`
      {
        "--bk-accent": "#ffd84a",
        "--bk-border-thickness": "3px",
        "--bk-border-thickness-bold": "4px",
        "--bk-danger": "#ef4444",
        "--bk-decor-a": "#f2e4b0",
        "--bk-decor-b": "#d2f2b0",
        "--bk-decor-c": "#b8b0f2",
        "--bk-divider": "rgb(26 26 26 / 0.1)",
        "--bk-duration-base": "250ms",
        "--bk-duration-drift": "22000ms",
        "--bk-duration-fast": "150ms",
        "--bk-duration-reveal": "700ms",
        "--bk-focus-ring": "rgb(255 90 138 / 0.5)",
        "--bk-font-body": "var(--font-dm-sans, 'DM Sans'), var(--font-dm-sans, 'DM Sans'), var(--font-noto-arabic, 'Noto Sans Arabic'), sans-serif",
        "--bk-font-body-ar": "var(--font-dm-sans, 'DM Sans'), var(--font-dm-sans, 'DM Sans'), var(--font-noto-arabic, 'Noto Sans Arabic'), sans-serif",
        "--bk-font-display": "var(--font-bricolage, 'Bricolage Grotesque'), var(--font-bricolage, 'Bricolage Grotesque'), var(--font-noto-arabic, 'Noto Sans Arabic'), sans-serif",
        "--bk-font-display-ar": "var(--font-bricolage, 'Bricolage Grotesque'), var(--font-bricolage, 'Bricolage Grotesque'), var(--font-noto-arabic, 'Noto Sans Arabic'), sans-serif",
        "--bk-ink": "#1a1a1a",
        "--bk-ink-faint": "rgb(26 26 26 / 0.38)",
        "--bk-ink-soft": "rgb(26 26 26 / 0.7)",
        "--bk-motion": "auto",
        "--bk-on-accent": "#1a1a1a",
        "--bk-on-decor": "#463a0b",
        "--bk-on-primary": "#1a1a1a",
        "--bk-on-secondary": "#1a1a1a",
        "--bk-primary": "#ff5a8a",
        "--bk-primary-active": "#d64e76",
        "--bk-primary-disabled": "rgb(255 90 138 / 0.4)",
        "--bk-primary-hover": "#e8547f",
        "--bk-primary-soft": "rgb(255 90 138 / 0.12)",
        "--bk-radius-card": "16px",
        "--bk-radius-input": "12px",
        "--bk-radius-pill": "9999px",
        "--bk-scale-base": "1rem",
        "--bk-scale-leading": "1.55",
        "--bk-secondary": "#7cf0bd",
        "--bk-shadow-button": "2px 2px 0px 0px var(--bk-ink)",
        "--bk-shadow-card": "4px 4px 0px 0px var(--bk-ink)",
        "--bk-success": "#7cf0bd",
        "--bk-surface": "#fff7ed",
        "--bk-surface-alt": "#ffffff",
        "--bk-wedge-multiplier": "1",
      }
    `);
  });
});

describe("buildBrandKitVars — color derivations", () => {
  it("pure black primary derives the kit's surface as its on-color", () => {
    const k = cloneKit();
    k.colors.primary = "#000000";
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-on-primary"]).toBe(k.colors.surface.toLowerCase());
  });

  it("the default candy pink gets ink, not white (2.97:1 failed AA; ink is 5.87:1)", () => {
    const v = buildBrandKitVars(cloneKit()) as Record<string, string>;
    expect(v["--bk-on-primary"]).toBe(EMPTY_BRAND_KIT.colors.ink.toLowerCase());
  });

  it("a dark kit with a light primary gets the dark surface, not light ink (Chrome Night)", () => {
    const k = cloneKit();
    k.colors = {
      primary: "#d6dce4",
      secondary: "#878e98",
      accent: "#eceef1",
      surface: "#141619",
      surface_alt: "#1d2126",
      ink: "#eceef1",
      success: "#4fbf8b",
      danger: "#e5645d",
    };
    const v = buildBrandKitVars(k) as Record<string, string>;
    // The old luminance rule picked ink #eceef1 here: about 1.1:1.
    expect(v["--bk-on-primary"]).toBe("#141619");
    expect(v["--bk-on-accent"]).toBe("#141619");
    expect(v["--bk-on-secondary"]).toBe("#141619");
  });

  it("trims a padded hex before emitting it", () => {
    const k = cloneKit();
    k.colors.primary = "  #AABBCC ";
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-primary"]).toBe("#aabbcc");
  });

  it("pure white primary derives ink on-color", () => {
    const k = cloneKit();
    k.colors.primary = "#ffffff";
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-on-primary"]).toBe(k.colors.ink.toLowerCase());
  });

  it("invalid hex silently falls back to the EMPTY_BRAND_KIT default", () => {
    const k = cloneKit();
    k.colors.primary = "#zzzzzz";
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-primary"]).toBe(EMPTY_BRAND_KIT.colors.primary.toLowerCase());
  });

  it("emits primary-soft as a 0.12 alpha of primary", () => {
    const k = cloneKit();
    k.colors.primary = "#ff0000";
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-primary-soft"]).toBe("rgb(255 0 0 / 0.12)");
  });

  it("emits ink-soft / ink-faint / divider as alpha mixes of ink", () => {
    const k = cloneKit();
    k.colors.ink = "#000000";
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-ink-soft"]).toBe("rgb(0 0 0 / 0.7)");
    expect(v["--bk-ink-faint"]).toBe("rgb(0 0 0 / 0.38)");
    expect(v["--bk-divider"]).toBe("rgb(0 0 0 / 0.1)");
  });
});

describe("buildBrandKitVars — shape mapping", () => {
  it.each([
    ["none", "0px", "0px"],
    ["soft", "8px", "6px"],
    ["round", "16px", "12px"],
    ["pill", "9999px", "9999px"],
  ] as const)("radius=%s emits card=%s input=%s", (radius, card, input) => {
    const k = cloneKit();
    k.shape.radius = radius;
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-radius-card"]).toBe(card);
    expect(v["--bk-radius-input"]).toBe(input);
    expect(v["--bk-radius-pill"]).toBe("9999px");
  });

  it.each([
    ["none", "0px", "0px"],
    ["thin", "1px", "1px"],
    ["thick", "2px", "3px"],
    ["chunky", "3px", "4px"],
  ] as const)("border_thickness=%s emits %s + bold=%s", (thickness, px, bold) => {
    const k = cloneKit();
    k.shape.border_thickness = thickness;
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-border-thickness"]).toBe(px);
    expect(v["--bk-border-thickness-bold"]).toBe(bold);
  });

  it("shadow_style=flat emits none for both card and button", () => {
    const k = cloneKit();
    k.shape.shadow_style = "flat";
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-shadow-card"]).toBe("none");
    expect(v["--bk-shadow-button"]).toBe("none");
  });

  it.each([
    ["none", "0"],
    ["subtle", "0.35"],
    ["playful", "1"],
    ["wild", "1.75"],
  ] as const)("rotation_intensity=%s emits multiplier %s", (intensity, mult) => {
    const k = cloneKit();
    k.shape.rotation_intensity = intensity;
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-wedge-multiplier"]).toBe(mult);
  });
});

describe("buildBrandKitVars — typography scale", () => {
  it.each([
    ["compact", "0.875rem", "1.4"],
    ["comfortable", "1rem", "1.55"],
    ["spacious", "1.125rem", "1.7"],
  ] as const)("scale=%s emits base=%s leading=%s", (scale, b, l) => {
    const k = cloneKit();
    k.typography.scale = scale;
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-scale-base"]).toBe(b);
    expect(v["--bk-scale-leading"]).toBe(l);
  });
});

describe("buildBrandKitVars — motion", () => {
  it("motion.enabled=false emits --bk-motion: reduce", () => {
    const k = cloneKit();
    k.motion.enabled = false;
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-motion"]).toBe("reduce");
  });

  it("motion.enabled=true emits --bk-motion: auto", () => {
    const k = cloneKit();
    k.motion.enabled = true;
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-motion"]).toBe("auto");
  });

  it.each([
    ["snappy", "80ms", "150ms"],
    ["normal", "150ms", "250ms"],
    ["slow", "300ms", "500ms"],
  ] as const)("motion.speed=%s emits fast=%s base=%s", (speed, fast, base) => {
    const k = cloneKit();
    k.motion.speed = speed;
    const v = buildBrandKitVars(k) as Record<string, string>;
    expect(v["--bk-duration-fast"]).toBe(fast);
    expect(v["--bk-duration-base"]).toBe(base);
  });
});

describe("buildBrandKitVars — interaction-state tokens", () => {
  it("emits primary-active, primary-disabled, and focus-ring", () => {
    const vars = buildBrandKitVars(EMPTY_BRAND_KIT) as Record<string, string>;
    expect(vars["--bk-primary-active"]).toBeDefined();
    expect(vars["--bk-primary-disabled"]).toBeDefined();
    expect(vars["--bk-focus-ring"]).toBeDefined();
    expect(BK_VAR_NAMES).toContain("--bk-primary-active");
    expect(BK_VAR_NAMES).toContain("--bk-primary-disabled");
    expect(BK_VAR_NAMES).toContain("--bk-focus-ring");
  });

  it("derives primary-active as a darker mix and disabled/focus as primary alphas", () => {
    const k = cloneKit();
    k.colors.primary = "#ff0000";
    k.colors.ink = "#000000";
    const v = buildBrandKitVars(k) as Record<string, string>;
    // mix(#ff0000, #000000, 0.18) → 209 → #d10000
    expect(v["--bk-primary-active"]).toBe("#d10000");
    expect(v["--bk-primary-disabled"]).toBe("rgb(255 0 0 / 0.4)");
    expect(v["--bk-focus-ring"]).toBe("rgb(255 0 0 / 0.5)");
  });
});

describe("fontStack — self-hosted faces resolve through their next/font variable", () => {
  it("maps Cairo (scheniders_signature) to --font-cairo with the plain name as fallback", () => {
    expect(fontStack("Cairo", "Bricolage Grotesque", "display")).toBe(
      "var(--font-cairo, 'Cairo'), var(--font-bricolage, 'Bricolage Grotesque'), var(--font-noto-arabic, 'Noto Sans Arabic'), sans-serif",
    );
  });

  it("leaves Google-hosted families as quoted names but keeps the self-hosted Arabic tail", () => {
    expect(fontStack("Space Grotesk", "DM Sans", "body")).toBe(
      "'Space Grotesk', var(--font-dm-sans, 'DM Sans'), var(--font-noto-arabic, 'Noto Sans Arabic'), sans-serif",
    );
  });

  it("prepends the Arabic pairing through the same mapping", () => {
    const k = cloneKit();
    k.typography.display_ar = "Cairo";
    k.typography.body_ar = "Tajawal";
    const v = buildBrandKitVars(k, { locale: "ar" }) as Record<string, string>;
    expect(v["--bk-font-display"]).toMatch(/^var\(--font-cairo, 'Cairo'\), /);
    expect(v["--bk-font-body"]).toMatch(/^'Tajawal', /);
  });
});

describe("buildBrandKitFontsUrl", () => {
  it("returns null when both fonts are already in the skip set", () => {
    expect(buildBrandKitFontsUrl(EMPTY_BRAND_KIT)).toBeNull();
  });

  it("skips Cairo and Noto Sans Arabic — self-hosted by the root layout", () => {
    const k = cloneKit();
    k.typography.display = "Cairo";
    k.typography.body = "Cairo";
    k.typography.display_ar = "Cairo";
    k.typography.body_ar = "Noto Sans Arabic";
    expect(buildBrandKitFontsUrl(k)).toBeNull();
  });

  it("emits a Google Fonts URL for a non-default display font with the 400-900 weight range", () => {
    const k = cloneKit();
    k.typography.display = "Space Grotesk";
    const url = buildBrandKitFontsUrl(k);
    expect(url).not.toBeNull();
    expect(BRAND_KIT_FONT_WEIGHTS).toBe("400;500;600;700;800;900");
    expect(url).toContain(`family=Space+Grotesk:wght@${BRAND_KIT_FONT_WEIGHTS}`);
    expect(url).toContain("display=swap");
  });

  it("dedupes when display === body", () => {
    const k = cloneKit();
    k.typography.display = "Inter";
    k.typography.body = "Inter";
    const url = buildBrandKitFontsUrl(k)!;
    expect(url.match(/family=Inter/g)?.length).toBe(1);
  });
});

describe("decorative surfaces", () => {
  const DECOR = ["--bk-decor-a", "--bk-decor-b", "--bk-decor-c"] as const;

  /** Relative luminance per WCAG 2.x, for the contrast assertions below. */
  function luminance(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    const ch = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return (
      0.2126 * ch((n >> 16) & 0xff) +
      0.7152 * ch((n >> 8) & 0xff) +
      0.0722 * ch(n & 0xff)
    );
  }

  function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  const ACCENTS = [
    "#ffd84a", // default butter
    "#ff5a8a", // pink
    "#25d366", // WhatsApp green — collides with the old `success` binding
    "#2e4b7a", // deep blue
    "#111111", // near-black, no usable saturation
    "#ffffff", // white, no usable saturation
  ];

  it.each(ACCENTS)("keeps the three surfaces distinct for accent %s", (accent) => {
    const k = cloneKit();
    k.colors.accent = accent;
    const v = buildBrandKitVars(k) as Record<string, string>;
    const values = DECOR.map((d) => v[d]);
    expect(new Set(values).size).toBe(3);
  });

  it("tracks the accent hue rather than staying a fixed pastel", () => {
    const a = cloneKit();
    a.colors.accent = "#ffd84a";
    const b = cloneKit();
    b.colors.accent = "#2e4b7a";
    const va = buildBrandKitVars(a) as Record<string, string>;
    const vb = buildBrandKitVars(b) as Record<string, string>;
    for (const d of DECOR) expect(va[d]).not.toBe(vb[d]);
  });

  it("does not follow success or secondary, which a tenant recolours freely", () => {
    const base = cloneKit();
    const moved = cloneKit();
    moved.colors.success = "#123456";
    moved.colors.secondary = "#654321";
    const vb = buildBrandKitVars(base) as Record<string, string>;
    const vm = buildBrandKitVars(moved) as Record<string, string>;
    for (const d of DECOR) expect(vb[d]).toBe(vm[d]);
  });

  it("emits one foreground that clears AA on all three surfaces", () => {
    for (const accent of ACCENTS) {
      const k = cloneKit();
      k.colors.accent = accent;
      const v = buildBrandKitVars(k) as Record<string, string>;
      for (const d of DECOR) {
        expect(contrast(v["--bk-on-decor"], v[d])).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("stays readable when the tenant's ink is light (dark-surface store)", () => {
    // The old binding hardcoded `--bk-ink` as the foreground, which inverted
    // to near-white here and rendered light text on a light pastel.
    const k = cloneKit();
    k.colors.ink = "#f5f5f5";
    k.colors.surface = "#101010";
    const v = buildBrandKitVars(k) as Record<string, string>;
    for (const d of DECOR) {
      expect(contrast(v["--bk-on-decor"], v[d])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
