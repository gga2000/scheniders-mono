// =====================================================================
// WizardIndustry — server-safe type + fallback
// =====================================================================
// Kept separate from starter-store.ts so the server component
// (app/store/onboarding/page.tsx) can import it without pulling in
// page-templates → sale-page → sections-manifest → @scheniders/sections,
// which imports "use client" section modules whose bodies are not
// executed server-side, causing getManifestEntry() to throw at
// module evaluation time.
// =====================================================================

export interface WizardIndustry {
    id: string;
    name: string;
    name_ar: string | null;
    icon: string | null;
    color: string | null;
    recommended_template_id: string | null;
}

/**
 * Static fallback used when the DB industries fetch fails or returns empty.
 * Mirrors STARTER_VERTICALS from starter-store.ts — must stay in sync with
 * the seeded DB rows and STARTER_VERTICALS if those change.
 */
export const FALLBACK_INDUSTRIES: WizardIndustry[] = [
    { id: "fashion",     name: "Fashion & apparel",     name_ar: null, icon: "Shirt",          color: "#FF8899", recommended_template_id: "cobalt_broadsheet" },
    { id: "beauty",      name: "Beauty & cosmetics",    name_ar: null, icon: "Sparkles",        color: "#FF69B4", recommended_template_id: "aurora_glass" },
    { id: "electronics", name: "Electronics & gadgets", name_ar: null, icon: "Smartphone",      color: "#60A5FA", recommended_template_id: "kinetic_ink" },
    { id: "food",        name: "Food & grocery",        name_ar: null, icon: "UtensilsCrossed", color: "#F59E0B", recommended_template_id: "sunbleach" },
    { id: "home_goods",  name: "Home & furniture",      name_ar: null, icon: "Sofa",            color: "#8B5CF6", recommended_template_id: "cobalt_broadsheet" },
    { id: "general",     name: "Something else",        name_ar: null, icon: "Package",         color: "#6B7280", recommended_template_id: "sunbleach" },
];
