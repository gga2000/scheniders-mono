// =============================================
// Curated Font Pairings for Store Builder
// =============================================
// Each pairing includes both Latin and Arabic-compatible fonts.
// Google Fonts URLs are generated dynamically.

export interface FontPairing {
    id: string;
    name: string;
    nameAr: string;
    heading: string;
    body: string;
    headingAr: string;
    bodyAr: string;
    weights: number[];
    category: "modern" | "elegant" | "bold" | "minimal" | "warm";
    previewEn: string;
    previewAr: string;
}

export const FONT_PAIRINGS: FontPairing[] = [
    {
        id: "modern-clean",
        name: "Modern Clean",
        nameAr: "عصري نظيف",
        heading: "Inter",
        body: "Inter",
        headingAr: "Tajawal",
        bodyAr: "Tajawal",
        weights: [400, 500, 600, 700],
        category: "modern",
        previewEn: "The quick brown fox",
        previewAr: "مرحباً بالعالم",
    },
    {
        id: "elegant-serif",
        name: "Elegant Serif",
        nameAr: "أنيق كلاسيكي",
        heading: "Playfair Display",
        body: "Lora",
        headingAr: "Amiri",
        bodyAr: "Noto Sans Arabic",
        weights: [400, 500, 600, 700],
        category: "elegant",
        previewEn: "The quick brown fox",
        previewAr: "مرحباً بالعالم",
    },
    {
        id: "bold-impact",
        name: "Bold Impact",
        nameAr: "جريء مؤثر",
        heading: "Poppins",
        body: "Open Sans",
        headingAr: "Cairo",
        bodyAr: "Cairo",
        weights: [400, 500, 600, 700, 800],
        category: "bold",
        previewEn: "The quick brown fox",
        previewAr: "مرحباً بالعالم",
    },
    {
        id: "minimal-sans",
        name: "Minimal Sans",
        nameAr: "بسيط بدون زوائد",
        heading: "DM Sans",
        body: "DM Sans",
        headingAr: "IBM Plex Sans Arabic",
        bodyAr: "IBM Plex Sans Arabic",
        weights: [400, 500, 600, 700],
        category: "minimal",
        previewEn: "The quick brown fox",
        previewAr: "مرحباً بالعالم",
    },
    {
        id: "warm-rounded",
        name: "Warm Rounded",
        nameAr: "دافئ مستدير",
        heading: "Nunito",
        body: "Nunito Sans",
        headingAr: "Almarai",
        bodyAr: "Almarai",
        weights: [400, 500, 600, 700],
        category: "warm",
        previewEn: "The quick brown fox",
        previewAr: "مرحباً بالعالم",
    },
    {
        id: "tech-sharp",
        name: "Tech Sharp",
        nameAr: "تقني حاد",
        heading: "Space Grotesk",
        body: "Inter",
        headingAr: "Tajawal",
        bodyAr: "Noto Sans Arabic",
        weights: [400, 500, 600, 700],
        category: "modern",
        previewEn: "The quick brown fox",
        previewAr: "مرحباً بالعالم",
    },
    {
        id: "luxury-classic",
        name: "Luxury Classic",
        nameAr: "فاخر كلاسيكي",
        heading: "Cormorant Garamond",
        body: "Montserrat",
        headingAr: "Amiri",
        bodyAr: "Cairo",
        weights: [400, 500, 600, 700],
        category: "elegant",
        previewEn: "The quick brown fox",
        previewAr: "مرحباً بالعالم",
    },
    {
        id: "friendly-casual",
        name: "Friendly Casual",
        nameAr: "ودّي عفوي",
        heading: "Quicksand",
        body: "Source Sans 3",
        headingAr: "Cairo",
        bodyAr: "Tajawal",
        weights: [400, 500, 600, 700],
        category: "warm",
        previewEn: "The quick brown fox",
        previewAr: "مرحباً بالعالم",
    },
    {
        id: "editorial-pro",
        name: "Editorial Pro",
        nameAr: "تحريري احترافي",
        heading: "Merriweather",
        body: "Roboto",
        headingAr: "Noto Naskh Arabic",
        bodyAr: "Noto Sans Arabic",
        weights: [400, 500, 700],
        category: "elegant",
        previewEn: "The quick brown fox",
        previewAr: "مرحباً بالعالم",
    },
    {
        id: "geometric-bold",
        name: "Geometric Bold",
        nameAr: "هندسي جريء",
        heading: "Sora",
        body: "Work Sans",
        headingAr: "IBM Plex Sans Arabic",
        bodyAr: "IBM Plex Sans Arabic",
        weights: [400, 500, 600, 700, 800],
        category: "bold",
        previewEn: "The quick brown fox",
        previewAr: "مرحباً بالعالم",
    },
];

/**
 * Generate Google Fonts import URL for a given pairing.
 */
export function getFontImportUrl(pairing: FontPairing): string {
    const fonts = new Set([pairing.heading, pairing.body, pairing.headingAr, pairing.bodyAr]);
    const families = Array.from(fonts).map((font) => {
        const weights = pairing.weights.join(";");
        return `family=${font.replace(/\s/g, "+")}:wght@${weights}`;
    });
    return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

/**
 * Get CSS font-family string for a pairing.
 */
export function getFontFamily(pairing: FontPairing, type: "heading" | "body"): string {
    if (type === "heading") {
        return `'${pairing.heading}', '${pairing.headingAr}', sans-serif`;
    }
    return `'${pairing.body}', '${pairing.bodyAr}', sans-serif`;
}
