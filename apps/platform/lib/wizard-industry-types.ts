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
    recommended_template_id: string | null;
}

/**
 * Static fallback used when the DB industries fetch fails or returns empty.
 * Mirrors STARTER_VERTICALS from starter-store.ts — must stay in sync with
 * the seeded DB rows and STARTER_VERTICALS if those change.
 */
export const FALLBACK_INDUSTRIES: WizardIndustry[] = [
    { id: "fashion",     name: "Fashion & apparel",     name_ar: null, icon: "Shirt",    recommended_template_id: "brand_story" },
    { id: "beauty",      name: "Beauty & cosmetics",    name_ar: null, icon: "Sparkles", recommended_template_id: "product_launch" },
    { id: "electronics", name: "Electronics & gadgets", name_ar: null, icon: "Smartphone", recommended_template_id: "minimal_catalog" },
    { id: "food",        name: "Food & grocery",        name_ar: null, icon: "UtensilsCrossed", recommended_template_id: "iraqi_market_landing" },
    { id: "home_goods",  name: "Home & furniture",      name_ar: null, icon: "Sofa",     recommended_template_id: "brand_story" },
    { id: "general",     name: "Something else",        name_ar: null, icon: "Package",  recommended_template_id: "iraqi_market_landing" },
];
