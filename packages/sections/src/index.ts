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

// Conversion family
import promo_banner from "./promo_banner";
import countdown_card from "./countdown_card";
import free_gift_strip from "./free_gift_strip";
import delivery_promise from "./delivery_promise";
import cta_banner from "./cta_banner";

// PDP-specific page sections
import pdp_gallery from "./pdp_gallery";
import pdp_buy_box from "./pdp_buy_box";
import pdp_info_tabs from "./pdp_info_tabs";
import pdp_related_products from "./pdp_related_products";

// Cart / checkout / track page sections
import cart_line_items from "./cart_line_items";
import cart_summary from "./cart_summary";
import checkout_form from "./checkout_form";
import checkout_order_summary from "./checkout_order_summary";
import track_order_lookup from "./track_order_lookup";

// Content variety
import category_grid from "./category_grid";
import feature_grid from "./feature_grid";
import numbers_stat_strip from "./numbers_stat_strip";
import instagram_grid from "./instagram_grid";
import accordion_richtext from "./accordion_richtext";
import html_embed from "./html_embed";

export { getSection, listSections, registerSection } from "./_registry";
export type {
  SectionDefinition,
  SectionRenderContext,
  AnySectionDefinition,
} from "./_types";
export type { Tenant, Product, ProductVariant, Category } from "./types";

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
  promo_banner,
  countdown_card,
  free_gift_strip,
  delivery_promise,
  cta_banner,
  pdp_gallery,
  pdp_buy_box,
  pdp_info_tabs,
  pdp_related_products,
  cart_line_items,
  cart_summary,
  checkout_form,
  checkout_order_summary,
  track_order_lookup,
  category_grid,
  feature_grid,
  numbers_stat_strip,
  instagram_grid,
  accordion_richtext,
  html_embed,
];

export { RenderSection, RenderPage } from "./RenderSection";
