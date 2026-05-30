import type { StoreConfig } from "@scheniders/shared/types";

/**
 * Bare-bones legacy config — hero + about + dynamic sections, no `schneiders`
 * block at all. Represents an early-adopter tenant from before the
 * template-bundle config landed.
 */
export const LEGACY_MINIMAL: StoreConfig = {
  template: "general",
  hero: {
    title: "Welcome to Acme",
    subtitle: "The best stuff in town",
    cta_text: "Shop now",
    image_url: "https://cdn.example.com/hero.jpg",
    secondary_cta_kind: "whatsapp",
  },
  about: {
    enabled: true,
    title: "About us",
    body: "We sell things people want.",
  },
  contact: {
    whatsapp_number: "+9647700000000",
    instagram: "@acme",
  },
  sections_order: ["hero", "about", "promo-1"],
  enable_whatsapp_order: true,
  logo_url: "https://cdn.example.com/logo.png",
  design_tokens: {
    colors: { primary: "#0066ff", secondary: "#22cc88", accent: "#ffaa00" },
    fonts: { heading: "Poppins", body: "Inter" },
    radius: "md",
    spacing: "comfortable",
    shadows: "subtle",
  },
  sections: [
    {
      id: "promo-1",
      type: "promotions",
      enabled: true,
      data: { title: "Spring sale", percent_off: 20 },
    },
  ],
};
