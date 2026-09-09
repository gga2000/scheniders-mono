// =====================================================================
// Section — sticky_cta_bar
// =====================================================================
// Sticky bottom CTA bar (mobile only). Renders a primary action button
// plus an optional secondary kind (WhatsApp, call, or none). When
// `show_total` is enabled and the bar is on the cart/checkout page,
// the live cart subtotal is read from `useCart()`. With
// `show_product_price` on a product page, the product's own price sits
// beside the primary button and the bar steps aside while the in-page
// order form's submit button is on screen (no duplicate CTA).
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { StickyCtaBarRender } from "./sticky_cta_bar.client";

const schema = z.object({
  primary_label_i18n: i18nStringSchema,
  primary_href: z.string(),
  secondary_label_i18n: i18nStringOptional,
  secondary_kind: z.enum(["whatsapp", "call", "none"]).optional(),
  show_total: z.boolean(),
  /** Point this bar's WhatsApp/call button at a different number than the
   *  store-wide one (store_config.contact.whatsapp_number). Empty = inherit. */
  whatsapp_override: z.string().optional(),
  /** "link" (default) navigates to `primary_href`. "scroll_to_form" scrolls
   *  to the in-page order form instead — the right choice on a funnel PDP
   *  whose only purchase path is the inline COD form (a link to /checkout
   *  there is a dead end into an empty cart). */
  primary_kind: z.enum(["link", "scroll_to_form"]).optional(),
  /** Element id targeted by `scroll_to_form`. Omitted = "direct-order"
   *  (the id pdp_direct_order gives its form). */
  scroll_target_id: z.string().optional(),
  /** Product page only: show the product's live price (compare-at struck
   *  through when on sale) beside the primary button, and hide the bar
   *  while the in-page form's own submit button is visible. Default off. */
  show_product_price: z.boolean().optional(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  primary_label_i18n: { en: "Continue", ar: "متابعة" },
  primary_href: "/checkout",
  secondary_label_i18n: { en: "Chat", ar: "تواصل" },
  secondary_kind: "whatsapp",
  show_total: false,
  show_product_price: false,
};

const definition: SectionDefinition<Props> = {
  type: "sticky_cta_bar",
  overlay: true,
  category: "conversion",
  name: { en: "Sticky CTA bar", ar: "شريط زر سفلي" },
  description: {
    en: "Sticky bottom-of-screen mobile CTA with optional WhatsApp/call.",
    ar: "شريط زر سفلي ثابت للجوال مع واتساب أو اتصال اختياري.",
  },
  thumbnail: "/sections/sticky_cta_bar.svg",
  valid_on: ["product", "cart", "checkout"],
  schema,
  defaultProps,
  render: StickyCtaBarRender,
};

registerSection(definition);
export default definition;
