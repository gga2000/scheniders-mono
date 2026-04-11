// =============================================
// Canonical Store Configuration Types
// =============================================
// These types are the single source of truth for store config
// across platform (editor), storefront (renderer), and admin.

export type TemplateName = "fashion" | "beauty" | "electronics" | "general" | "clean";

// ── Design Tokens ──

export interface DesignTokenColors {
  primary: string;
  secondary: string;
  accent: string;
  background?: string;
  text?: string;
}

export interface DesignTokenFonts {
  heading: string;
  body: string;
  pairing_id?: string;
}

export type DesignTokenRadius = "none" | "sm" | "md" | "lg" | "full";
export type DesignTokenSpacing = "compact" | "comfortable" | "spacious";
export type DesignTokenShadows = "flat" | "subtle" | "elevated";

export interface DesignTokens {
  colors?: DesignTokenColors;
  fonts?: DesignTokenFonts;
  radius?: DesignTokenRadius;
  spacing?: DesignTokenSpacing;
  shadows?: DesignTokenShadows;
}

// ── Section Config ──

export type SectionAnimationType = "none" | "fade" | "slide" | "scale";

export interface SectionAnimation {
  type: SectionAnimationType;
  duration?: number;
  delay?: number;
}

export interface SectionConfig {
  id: string;
  type: string;
  enabled: boolean;
  variant?: string;
  data: Record<string, unknown>;
  animation?: SectionAnimation;
}

// ── SEO Config ──

export interface SEOConfig {
  meta_title?: string;
  meta_description?: string;
  og_image_url?: string;
  canonical_url?: string;
}

// ── Hero Config ──

export interface HeroConfig {
  title?: string;
  subtitle?: string;
  cta_text?: string;
  image_url?: string;
}

// ── About Config ──

export interface AboutConfig {
  enabled?: boolean;
  title?: string;
  body?: string;
}

// ── Contact Config ──

export interface ContactConfig {
  whatsapp_number?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
}

// ── Main Store Config ──

export interface StoreConfig {
  // Template
  template?: TemplateName;

  // Core sections (existing)
  hero?: HeroConfig;
  about?: AboutConfig;
  contact?: ContactConfig;
  sections_order?: string[];
  enable_whatsapp_order?: boolean;

  // Branding & theming
  design_tokens?: DesignTokens;
  logo_url?: string;
  custom_css?: string;

  // Section-based architecture
  sections?: SectionConfig[];

  // SEO
  seo?: SEOConfig;
}
