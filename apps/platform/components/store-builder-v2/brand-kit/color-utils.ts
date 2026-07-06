// =====================================================================
// Brand-kit color utilities (extracted from brand-kit-editor, 4.2)
// =====================================================================
// Pure color math + the canvas-based logo palette extractor. No React —
// safe to reuse from a future mini style panel or server-side checks.
// =====================================================================

import type { BrandColors } from "@scheniders/shared";

export const GOOGLE_FONTS: readonly string[] = [
    "Bricolage Grotesque",
    "DM Sans",
    "Inter",
    "Playfair Display",
    "Manrope",
    "Outfit",
    "Space Grotesk",
    "Plus Jakarta Sans",
    "Public Sans",
    "IBM Plex Sans",
    "Anton",
    "Bebas Neue",
    "Newsreader",
    "EB Garamond",
    "Source Serif Pro",
    "Lora",
    "Cormorant",
    "Fraunces",
    "Geist",
    "Geist Mono",
    "Karla",
    "Lexend",
    "Montserrat",
    "Nunito",
    "Poppins",
    "Raleway",
    "Roboto",
    "Work Sans",
    "Bricolage",
    "Playfair",
] as const;

export const CANDY_DEFAULTS: Readonly<BrandColors> = {
    primary: "#ff5a8a",
    secondary: "#c5b6ff",
    accent: "#ffd84a",
    surface: "#fff7ed",
    surface_alt: "#ffffff",
    ink: "#1a1a1a",
    success: "#7cf0bd",
    danger: "#ff4d4d",
} as const;

export const HEX_RE = /^#[0-9a-f]{6}$/i;

export function isValidHex(value: string): boolean {
    return HEX_RE.test(value);
}

export function clamp(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

export function pad2(n: number): string {
    const s = Math.round(clamp(n, 0, 255)).toString(16);
    return s.length === 1 ? `0${s}` : s;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace("#", "");
    return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
    };
}

export function rgbToHex(r: number, g: number, b: number): string {
    return `#${pad2(r)}${pad2(g)}${pad2(b)}`;
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
    if (!isValidHex(hex)) return { h: 0, s: 0, l: 0 };
    const { r: R, g: G, b: B } = hexToRgb(hex);
    const r = R / 255;
    const g = G / 255;
    const b = B / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h *= 60;
    }
    return {
        h: Math.round(h),
        s: Math.round(s * 100),
        l: Math.round(l * 100),
    };
}

export function hslToHex(h: number, s: number, l: number): string {
    const hh = ((h % 360) + 360) % 360 / 360;
    const ss = clamp(s, 0, 100) / 100;
    const ll = clamp(l, 0, 100) / 100;
    if (ss === 0) {
        const v = Math.round(ll * 255);
        return rgbToHex(v, v, v);
    }
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    const conv = (t: number): number => {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
    };
    return rgbToHex(
        Math.round(conv(hh + 1 / 3) * 255),
        Math.round(conv(hh) * 255),
        Math.round(conv(hh - 1 / 3) * 255),
    );
}

/** Relative luminance per WCAG. */
export function luminance(hex: string): number {
    if (!isValidHex(hex)) return 0;
    const { r, g, b } = hexToRgb(hex);
    const norm = (c: number): number => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * norm(r) + 0.7152 * norm(g) + 0.0722 * norm(b);
}

export function contrastRatio(a: string, b: string): number {
    const la = luminance(a);
    const lb = luminance(b);
    const [lo, hi] = la < lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

export type ContrastGrade = "AAA" | "AA" | "Fail";

export function gradeContrast(ratio: number): ContrastGrade {
    if (ratio >= 7) return "AAA";
    if (ratio >= 4.5) return "AA";
    return "Fail";
}

/** Generate ~12 harmonious tones around a given color. */
export function suggestedTones(hex: string): string[] {
    if (!isValidHex(hex)) return [];
    const { h, s, l } = hexToHsl(hex);
    const out: string[] = [];
    // Lightness ladder
    out.push(hslToHex(h, s, clamp(l + 28, 5, 95)));
    out.push(hslToHex(h, s, clamp(l + 14, 5, 95)));
    out.push(hslToHex(h, s, clamp(l - 14, 5, 95)));
    out.push(hslToHex(h, s, clamp(l - 28, 5, 95)));
    // Saturation variants
    out.push(hslToHex(h, clamp(s - 30, 0, 100), l));
    out.push(hslToHex(h, clamp(s + 20, 0, 100), l));
    // Complementary
    out.push(hslToHex(h + 180, s, l));
    out.push(hslToHex(h + 180, s, clamp(l + 15, 5, 95)));
    // Analogous
    out.push(hslToHex(h + 30, s, l));
    out.push(hslToHex(h - 30, s, l));
    // Triadic
    out.push(hslToHex(h + 120, s, l));
    out.push(hslToHex(h - 120, s, l));
    return out;
}

export function randomHarmoniousPalette(): BrandColors {
    const baseHue = Math.floor(Math.random() * 360);
    return {
        primary: hslToHex(baseHue, 75, 60),
        secondary: hslToHex((baseHue + 150) % 360, 60, 70),
        accent: hslToHex((baseHue + 45) % 360, 85, 60),
        surface: hslToHex(baseHue, 30, 96),
        surface_alt: "#ffffff",
        ink: hslToHex(baseHue, 25, 12),
        success: "#7cf0bd",
        danger: "#ff4d4d",
    };
}


/* ─────────────────────────────────────────────────────────────────── */
/* Logo palette extractor                                               */
/* ─────────────────────────────────────────────────────────────────── */

export async function extractPaletteFromLogo(url: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const SIZE = 64;
                const canvas = document.createElement("canvas");
                canvas.width = SIZE;
                canvas.height = SIZE;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Canvas unavailable"));
                    return;
                }
                ctx.drawImage(img, 0, 0, SIZE, SIZE);
                const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

                // Bucket by 16 hue bins × lightness band.
                const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i] ?? 0;
                    const g = data[i + 1] ?? 0;
                    const b = data[i + 2] ?? 0;
                    const a = data[i + 3] ?? 0;
                    if (a < 128) continue;
                    // Exclude near-white & near-black
                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);
                    const l = (max + min) / 2 / 255;
                    if (l > 0.95 || l < 0.05) continue;
                    const hex = rgbToHex(r, g, b);
                    const { h, l: ll } = hexToHsl(hex);
                    const hueBucket = Math.floor(h / (360 / 16));
                    const lightBucket = ll < 33 ? "d" : ll > 66 ? "l" : "m";
                    const key = `${hueBucket}-${lightBucket}`;
                    const entry = buckets.get(key);
                    if (entry) {
                        entry.count += 1;
                        entry.r += r;
                        entry.g += g;
                        entry.b += b;
                    } else {
                        buckets.set(key, { count: 1, r, g, b });
                    }
                }

                const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
                const palette: string[] = [];
                for (const entry of sorted) {
                    const hex = rgbToHex(
                        entry.r / entry.count,
                        entry.g / entry.count,
                        entry.b / entry.count,
                    );
                    // dedupe near-identical colors
                    const exists = palette.some((p) => contrastRatio(p, hex) < 1.1);
                    if (!exists) palette.push(hex);
                    if (palette.length >= 5) break;
                }
                resolve(palette);
            } catch (err) {
                reject(err instanceof Error ? err : new Error("Extraction failed"));
            }
        };
        img.onerror = () => reject(new Error("Failed to load logo"));
        img.src = url;
    });
}

