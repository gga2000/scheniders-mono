import type { StoreConfig } from "@scheniders/shared/types";

/**
 * Full schneiders-template tenant with hero, about disabled, trust pills,
 * testimonial, promo bar, analytics pixels, newsletter popup, and a couple
 * of dynamic sections. Represents the realistic "live tenant" shape.
 */
export const LEGACY_SCHNEIDERS_FULL: StoreConfig = {
  template: "schneiders",
  hero: {
    title: "Schneiders — beauty essentials",
    subtitle: "Express delivery across Iraq",
    cta_text: "Shop the drop",
    image_url: "https://cdn.example.com/schneiders-hero.jpg",
    secondary_cta_kind: "whatsapp",
  },
  about: {
    enabled: false,
    title: "Our story",
    body: "Born in Baghdad, made for the region.",
  },
  contact: {
    whatsapp_number: "+9647710000000",
    instagram: "@schneiders",
    facebook: "schneidersIQ",
  },
  sections_order: [
    "hero",
    "trust",
    "customer_love",
    "testimonials-block",
    "newsletter-block",
  ],
  enable_whatsapp_order: true,
  logo_url: "https://cdn.example.com/schneiders-logo.svg",
  design_tokens: {
    colors: {
      primary: "#ff5a8a",
      secondary: "#7cf0bd",
      accent: "#ffd84a",
      background: "#fff7ed",
      text: "#1a1a1a",
    },
    fonts: { heading: "Bricolage Grotesque", body: "DM Sans" },
    radius: "lg",
    spacing: "comfortable",
    shadows: "elevated",
  },
  sections: [
    {
      id: "testimonials-block",
      type: "testimonials",
      enabled: true,
      data: {
        items: [
          { name: "Lina", quote: "Loved it", rating: 5 },
          { name: "Yusuf", quote: "Fast delivery", rating: 5 },
        ],
      },
    },
    {
      id: "newsletter-block",
      type: "newsletter",
      enabled: true,
      data: { title: "Stay in the loop", placeholder: "Your email" },
    },
  ],
  seo: {
    meta_title: "Schneiders",
    meta_description: "Iraqi beauty store",
    og_image_url: "https://cdn.example.com/og.jpg",
  },
  schneiders: {
    testimonial: {
      enabled: true,
      quote: "The delivery was incredibly fast!",
      reviewer_name: "Lina K.",
      reviewer_city: "Erbil",
      avatar_url: "https://cdn.example.com/avatars/lina.jpg",
      rating: 5,
      badge_text: "5 ★ RATED",
    },
    promo_bar: {
      enabled: true,
      messages: ["24h delivery", "Cash on delivery", "Free shipping over 75k IQD"],
    },
    trust_pills: [
      { label: "Cash on Delivery", icon: "payments", bg: "mint", enabled: true },
      { label: "24h Express", icon: "bolt", bg: "butter", enabled: true },
      { label: "100% Original", icon: "verified", bg: "sky", enabled: true },
      { label: "Easy Returns", icon: "sentiment_satisfied", bg: "lilac", enabled: true },
    ],
    analytics: {
      meta_pixel_id: "123456789",
      tiktok_pixel_id: "CABCDEF",
      google_analytics_id: "G-XXXXXX",
    },
    newsletter_popup: {
      enabled: true,
      discount_iqd: 15_000,
      label: "Get 15,000 IQD off your first order",
      popup_after_seconds: 30,
      popup_after_pages: 1,
    },
    wedge_intensity: "playful",
    wordmark_style: "italic-yellow-box",
  },
};
