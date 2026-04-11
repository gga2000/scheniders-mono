// =============================================
// Color Utilities for Store Builder
// =============================================
// Palette generation, color harmony, and accessibility checking

export interface HSL {
    h: number; // 0-360
    s: number; // 0-100
    l: number; // 0-100
}

export interface ColorPalette {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
    950: string;
}

export interface ColorHarmony {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
}

// ── Conversion ──

export function hexToHsl(hex: string): HSL {
    const cleaned = hex.replace("#", "");
    const r = parseInt(cleaned.substring(0, 2), 16) / 255;
    const g = parseInt(cleaned.substring(2, 4), 16) / 255;
    const b = parseInt(cleaned.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
        return { h: 0, s: 0, l: Math.round(l * 100) };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;

    switch (max) {
        case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            break;
        case g:
            h = ((b - r) / d + 2) / 6;
            break;
        default:
            h = ((r - g) / d + 4) / 6;
            break;
    }

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100),
    };
}

export function hslToHex({ h, s, l }: HSL): string {
    const sNorm = s / 100;
    const lNorm = l / 100;
    const a = sNorm * Math.min(lNorm, 1 - lNorm);

    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color)
            .toString(16)
            .padStart(2, "0");
    };

    return `#${f(0)}${f(8)}${f(4)}`;
}

// ── Palette Generation ──

export function generatePalette(hex: string): ColorPalette {
    const hsl = hexToHsl(hex);

    // Generate shades by adjusting lightness and saturation
    const shade = (lightness: number, saturationAdjust: number = 0): string => {
        return hslToHex({
            h: hsl.h,
            s: Math.max(0, Math.min(100, hsl.s + saturationAdjust)),
            l: lightness,
        });
    };

    return {
        50: shade(97, -20),
        100: shade(94, -15),
        200: shade(87, -10),
        300: shade(77, -5),
        400: shade(64, 0),
        500: shade(50, 0),    // Base color (closest to input)
        600: shade(42, 5),
        700: shade(35, 8),
        800: shade(27, 10),
        900: shade(20, 12),
        950: shade(12, 15),
    };
}

// ── Color Harmony ──

export function generateHarmony(hex: string): ColorHarmony {
    const hsl = hexToHsl(hex);

    // Complementary color (180 degrees opposite)
    const secondary = hslToHex({
        h: (hsl.h + 180) % 360,
        s: Math.max(20, hsl.s - 15),
        l: Math.min(60, hsl.l + 5),
    });

    // Analogous accent (30 degrees offset)
    const accent = hslToHex({
        h: (hsl.h + 30) % 360,
        s: Math.min(90, hsl.s + 10),
        l: Math.min(55, hsl.l + 5),
    });

    return {
        primary: hex,
        secondary,
        accent,
        background: "#ffffff",
        text: "#111827",
    };
}

// ── Accessibility ──

function luminance(hex: string): number {
    const cleaned = hex.replace("#", "");
    const r = parseInt(cleaned.substring(0, 2), 16) / 255;
    const g = parseInt(cleaned.substring(2, 4), 16) / 255;
    const b = parseInt(cleaned.substring(4, 6), 16) / 255;

    const toLinear = (c: number) =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function getContrastRatio(hex1: string, hex2: string): number {
    const l1 = luminance(hex1);
    const l2 = luminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

export function isAccessible(foreground: string, background: string, level: "AA" | "AAA" = "AA"): boolean {
    const ratio = getContrastRatio(foreground, background);
    return level === "AA" ? ratio >= 4.5 : ratio >= 7;
}

// ── Curated Palettes ──

export interface CuratedPalette {
    id: string;
    name: string;
    nameAr: string;
    primary: string;
    secondary: string;
    accent: string;
}

export const CURATED_PALETTES: CuratedPalette[] = [
    { id: "ocean", name: "Ocean", nameAr: "محيط", primary: "#0ea5e9", secondary: "#6366f1", accent: "#f59e0b" },
    { id: "forest", name: "Forest", nameAr: "غابة", primary: "#16a34a", secondary: "#065f46", accent: "#84cc16" },
    { id: "sunset", name: "Sunset", nameAr: "غروب", primary: "#f97316", secondary: "#dc2626", accent: "#facc15" },
    { id: "midnight", name: "Midnight", nameAr: "منتصف الليل", primary: "#1e293b", secondary: "#475569", accent: "#3b82f6" },
    { id: "rose", name: "Rose", nameAr: "وردي", primary: "#e11d48", secondary: "#be123c", accent: "#fb7185" },
    { id: "lavender", name: "Lavender", nameAr: "لافندر", primary: "#8b5cf6", secondary: "#7c3aed", accent: "#c4b5fd" },
    { id: "gold", name: "Gold", nameAr: "ذهبي", primary: "#ca8a04", secondary: "#92400e", accent: "#fbbf24" },
    { id: "teal", name: "Teal", nameAr: "أخضر مزرق", primary: "#0d9488", secondary: "#115e59", accent: "#2dd4bf" },
    { id: "coral", name: "Coral", nameAr: "مرجاني", primary: "#f43f5e", secondary: "#e11d48", accent: "#fda4af" },
    { id: "slate", name: "Slate", nameAr: "رمادي", primary: "#475569", secondary: "#334155", accent: "#94a3b8" },
    { id: "emerald", name: "Emerald", nameAr: "زمردي", primary: "#059669", secondary: "#047857", accent: "#34d399" },
    { id: "royal", name: "Royal", nameAr: "ملكي", primary: "#4338ca", secondary: "#3730a3", accent: "#818cf8" },
];
