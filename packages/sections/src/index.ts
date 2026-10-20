// =====================================================================
// Section barrel
// =====================================================================
// Explicit imports — DO NOT switch to `import.meta.glob` or `require.context`.
// Next.js Webpack chokes on glob-style imports inside the app dir, and we
// want the registry populated in a deterministic order anyway.
//
// Importing this file is the side effect that registers every section
// type via `registerSection()` inside each module.
// =====================================================================

import hero_image from "./hero_image";
import trust_strip from "./trust_strip";
import product_grid from "./product_grid";
import faq_accordion from "./faq_accordion";
import newsletter_inline from "./newsletter_inline";

// Hero family
import hero_split from "./hero_split";
import hero_marquee from "./hero_marquee";
import hero_video from "./hero_video";

// Story family
import about_block from "./about_block";
import brand_story from "./brand_story";
import founder_note from "./founder_note";
import press_quotes from "./press_quotes";

// Content family
import testimonials_carousel from "./testimonials_carousel";
import image_gallery from "./image_gallery";
import video_block from "./video_block";
import marquee_strip from "./marquee_strip";
import announcement_bar from "./announcement_bar";

// Conversion family
import promo_banner from "./promo_banner";
import countdown_card from "./countdown_card";
import free_gift_strip from "./free_gift_strip";
import delivery_promise from "./delivery_promise";
import cta_banner from "./cta_banner";

// PDP-specific page sections
import pdp_gallery from "./pdp_gallery";
import pdp_buy_box from "./pdp_buy_box";
import pdp_info_block from "./pdp_info_block";
import pdp_info_tabs from "./pdp_info_tabs";
import pdp_variants from "./pdp_variants";
import pdp_add_to_cart from "./pdp_add_to_cart";
import pdp_related_products from "./pdp_related_products";
import product_reviews from "./product_reviews";
import product_bundles from "./product_bundles";

// Cart / checkout / track page sections
import cart_line_items from "./cart_line_items";
import cart_summary from "./cart_summary";
import checkout_form from "./checkout_form";
import checkout_order_summary from "./checkout_order_summary";
import track_order_lookup from "./track_order_lookup";
import order_tracker from "./order_tracker";
import order_confirmation from "./order_confirmation";

// Content variety
import category_grid from "./category_grid";
import feature_grid from "./feature_grid";
import numbers_stat_strip from "./numbers_stat_strip";
import instagram_grid from "./instagram_grid";
import accordion_richtext from "./accordion_richtext";
import html_embed from "./html_embed";
import logo_strip from "./logo_strip";
import search_results_grid from "./search_results_grid";
import policy_content from "./policy_content";

// Conversion overlays / sticky
import exit_intent_offer from "./exit_intent_offer";
import sticky_cta_bar from "./sticky_cta_bar";

// Global chrome (live in globals.header / globals.footer)
import site_header from "./site_header";
import site_footer from "./site_footer";

// Signature family (funnel-style storefront: floating hero card, static
// badge/testimonial bands, split FAQ, inline COD order box)
import hero_card_float from "./hero_card_float";
import trust_badge_row from "./trust_badge_row";
import category_spotlight_pair from "./category_spotlight_pair";
import collection_trio from "./collection_trio";
import testimonial_cards from "./testimonial_cards";
import pillars_grid from "./pillars_grid";
import about_spotlight from "./about_spotlight";
import faq_contact_split from "./faq_contact_split";
import countdown_announcement from "./countdown_announcement";
import pdp_direct_order from "./pdp_direct_order";
import post_purchase_offer from "./post_purchase_offer";
import product_attributes from "./product_attributes";
import product_finder from "./product_finder";

export { getSection, listSections, registerSection } from "./_registry";
export type {
  SectionDefinition,
  SectionRenderContext,
  AnySectionDefinition,
} from "./_types";
export type {
  Tenant,
  SectionTenant,
  SectionTenantContact,
  Product,
  ProductVariant,
  Category,
} from "./types";
export { toSectionTenant } from "./helpers/section-tenant";
/** Lets a page emit structured data for the exact products a grid renders. */
export { selectProducts } from "./product_grid";

/** All built-in section definitions, in registration order. */
export const BUILTIN_SECTIONS = [
  hero_image,
  trust_strip,
  product_grid,
  faq_accordion,
  newsletter_inline,
  hero_split,
  hero_marquee,
  hero_video,
  about_block,
  brand_story,
  founder_note,
  press_quotes,
  testimonials_carousel,
  image_gallery,
  video_block,
  marquee_strip,
  announcement_bar,
  promo_banner,
  countdown_card,
  free_gift_strip,
  delivery_promise,
  cta_banner,
  pdp_gallery,
  pdp_buy_box,
  pdp_info_block,
  pdp_info_tabs,
  pdp_variants,
  pdp_add_to_cart,
  pdp_related_products,
  product_reviews,
  product_bundles,
  cart_line_items,
  cart_summary,
  checkout_form,
  checkout_order_summary,
  track_order_lookup,
  order_tracker,
  order_confirmation,
  category_grid,
  feature_grid,
  numbers_stat_strip,
  instagram_grid,
  accordion_richtext,
  html_embed,
  logo_strip,
  search_results_grid,
  policy_content,
  exit_intent_offer,
  sticky_cta_bar,
  site_header,
  site_footer,
  hero_card_float,
  trust_badge_row,
  category_spotlight_pair,
  collection_trio,
  testimonial_cards,
  pillars_grid,
  about_spotlight,
  faq_contact_split,
  countdown_announcement,
  pdp_direct_order,
  post_purchase_offer,
  product_attributes,
  product_finder,
];

export { RenderSection, RenderPage } from "./RenderSection";
