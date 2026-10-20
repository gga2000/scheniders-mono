// =====================================================================
// Brand themes — curated full-kit presets ([D1])
// =====================================================================
// A non-designer can't compose a coherent palette + type + shape from
// eight raw hex pickers. These presets are complete, contrast-checked
// looks seeded for Iraq SMB verticals — one tap applies colors,
// typography and shape together (identity/motion/voice are untouched).
//
// Rules:
//   - Every `primary` must pass WCAG AA (≥ 4.5:1) against the button
//     text the emitter will actually pick (white when luminance < 0.5,
//     else ink) — asserted by brand-themes.test.ts. A merchant applying
//     a theme can never ship unreadable buttons.
//   - Fonts must exist in the brand-kit editor's Google Fonts catalogue
//     (Arabic faces in its Arabic list).
//   - The Arabic body face must ship 400/500/600/700 (WEIGHT_COMPLETE_FONTS):
//     body copy and labels sit at 500/600, and a family missing either
//     (Almarai has neither, Tajawal has no 600) renders them as 400/700,
//     flattening hierarchy.
//   - Names are trilingual; Arabic is what most merchants read.
// =====================================================================

import type { BrandColors, BrandShape, BrandTypography } from "@scheniders/shared";
import type { EditorString } from "@/lib/editor-i18n";

export interface BrandTheme {
    id: string;
    name: EditorString;
    /** Vertical hint shown as a sublabel (e.g. "cosmetics & beauty"). */
    hint: EditorString;
    colors: BrandColors;
    typography: BrandTypography;
    shape: BrandShape;
}

export const BRAND_THEMES: BrandTheme[] = [
    {
        id: "baghdad_rose",
        name: { en: "Baghdad Rose", ar: "وردة بغداد", ku: "گوڵی بەغدا" },
        hint: { en: "Beauty & cosmetics", ar: "جمال ومستحضرات تجميل", ku: "جوانکاری" },
        colors: {
            primary: "#be123c",
            secondary: "#fda4af",
            accent: "#fbcfe8",
            surface: "#fff1f2",
            surface_alt: "#ffffff",
            ink: "#231318",
            success: "#10b981",
            danger: "#dc2626",
        },
        typography: { display: "Playfair Display", body: "Manrope", display_ar: "El Messiri", body_ar: "Noto Sans Arabic", scale: "comfortable" },
        shape: { radius: "round", border_thickness: "thin", shadow_style: "soft", rotation_intensity: "subtle" },
    },
    {
        id: "mashreq_gold",
        name: { en: "Mashreq Gold", ar: "ذهب المشرق", ku: "زێڕی ڕۆژهەڵات" },
        hint: { en: "Perfume & jewelry", ar: "عطور ومجوهرات", ku: "بۆن و خشڵ" },
        colors: {
            primary: "#1c1917",
            secondary: "#e7d9b8",
            accent: "#eab308",
            surface: "#faf8f3",
            surface_alt: "#ffffff",
            ink: "#1c1917",
            success: "#15803d",
            danger: "#b91c1c",
        },
        typography: { display: "Cormorant", body: "Karla", display_ar: "Amiri", body_ar: "Noto Sans Arabic", scale: "spacious" },
        shape: { radius: "soft", border_thickness: "thin", shadow_style: "flat", rotation_intensity: "none" },
    },
    {
        id: "tech_blue",
        name: { en: "Tech Blue", ar: "أزرق تقني", ku: "شینی تەکنۆلۆژی" },
        hint: { en: "Electronics & gadgets", ar: "إلكترونيات وأجهزة", ku: "ئەلیکترۆنیات" },
        colors: {
            primary: "#1d4ed8",
            secondary: "#bfdbfe",
            accent: "#f59e0b",
            surface: "#f8fafc",
            surface_alt: "#ffffff",
            ink: "#0f172a",
            success: "#059669",
            danger: "#dc2626",
        },
        typography: { display: "Space Grotesk", body: "Inter", display_ar: "Cairo", body_ar: "IBM Plex Sans Arabic", scale: "comfortable" },
        shape: { radius: "soft", border_thickness: "thin", shadow_style: "elevated", rotation_intensity: "none" },
    },
    {
        id: "souq_mint",
        name: { en: "Souq Mint", ar: "نعناع السوق", ku: "پونگی بازاڕ" },
        hint: { en: "Food & grocery", ar: "طعام وبقالة", ku: "خواردن و بازاڕی" },
        colors: {
            primary: "#047857",
            secondary: "#a7f3d0",
            accent: "#fbbf24",
            surface: "#f6fdf9",
            surface_alt: "#ffffff",
            ink: "#122620",
            success: "#059669",
            danger: "#dc2626",
        },
        typography: { display: "Bricolage Grotesque", body: "Nunito", display_ar: "Changa", body_ar: "Rubik", scale: "comfortable" },
        shape: { radius: "round", border_thickness: "thin", shadow_style: "soft", rotation_intensity: "subtle" },
    },
    {
        id: "warm_sands",
        name: { en: "Warm Sands", ar: "رمال دافئة", ku: "لمە گەرمەکان" },
        hint: { en: "Home & furniture", ar: "منزل وأثاث", ku: "ماڵ و کەلوپەل" },
        colors: {
            primary: "#9a3412",
            secondary: "#fed7aa",
            accent: "#fbbf24",
            surface: "#fdf6ee",
            surface_alt: "#ffffff",
            ink: "#292018",
            success: "#15803d",
            danger: "#b91c1c",
        },
        typography: { display: "Fraunces", body: "Work Sans", display_ar: "Noto Kufi Arabic", body_ar: "IBM Plex Sans Arabic", scale: "comfortable" },
        shape: { radius: "soft", border_thickness: "thin", shadow_style: "soft", rotation_intensity: "none" },
    },
    {
        id: "modern_lilac",
        name: { en: "Modern Lilac", ar: "ليلكي حديث", ku: "مۆری مۆدێرن" },
        hint: { en: "Fashion & apparel", ar: "أزياء وملابس", ku: "جلوبەرگ" },
        colors: {
            primary: "#6d28d9",
            secondary: "#ddd6fe",
            accent: "#fde047",
            surface: "#faf8ff",
            surface_alt: "#ffffff",
            ink: "#1e1b2e",
            success: "#059669",
            danger: "#dc2626",
        },
        typography: { display: "Outfit", body: "DM Sans", display_ar: "Cairo", body_ar: "Rubik", scale: "comfortable" },
        shape: { radius: "round", border_thickness: "thin", shadow_style: "hard-offset", rotation_intensity: "playful" },
    },
    {
        id: "classic_mono",
        name: { en: "Classic Mono", ar: "كلاسيك أحادي", ku: "کلاسیکی یەکڕەنگ" },
        hint: { en: "Any store — quiet & serious", ar: "أي متجر — هادئ وجاد", ku: "هەر فرۆشگایەک" },
        colors: {
            primary: "#1e1e1e",
            secondary: "#e5e5e5",
            accent: "#ffd84a",
            surface: "#fafaf9",
            surface_alt: "#ffffff",
            ink: "#1a1a1a",
            success: "#15803d",
            danger: "#dc2626",
        },
        typography: { display: "Anton", body: "Inter", display_ar: "Noto Kufi Arabic", body_ar: "Cairo", scale: "comfortable" },
        shape: { radius: "soft", border_thickness: "thin", shadow_style: "flat", rotation_intensity: "none" },
    },
];

export function getBrandTheme(id: string): BrandTheme | undefined {
    return BRAND_THEMES.find((t) => t.id === id);
}
