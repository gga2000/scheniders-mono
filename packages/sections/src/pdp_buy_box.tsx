// =====================================================================
// Section — pdp_buy_box
// =====================================================================
// The PDP conversion hub, in the Candy Bento lockup:
//   • white info card — On-Sale/New badge, title, optional rating, price +
//     compare-at + "-X% WOW!" sticker
//   • butter CodCard — glorified cash-on-delivery (24h + pay-cash + inspect)
//   • dashed options card — SIZE pills (size-like variants), OPTION pills
//     (the rest), QTY stepper, "Size Guide" link
//   • inline add-to-cart + WhatsApp
//   • a full-bleed mint sticky slab (TOTAL + WhatsApp + ADD TO CART) that
//     floats up whenever the inline CTA is off-screen.
// Reads runtime.product (+ its variants). Rating is opt-in via real config —
// no fabricated review counts.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { PdpBuyBoxRender } from "./pdp_buy_box.client";

const schema = z.object({
  add_to_cart_label_i18n: i18nStringSchema,
  cod_badge_label_i18n: i18nStringOptional,
  show_compare_price: z.boolean(),
  show_variant_picker: z.boolean(),
  show_qty_stepper: z.boolean(),
  /** Show the glorified butter COD card. */
  show_cod_card: z.boolean().optional(),
  /** Show a "Size Guide" link beside the SIZE picker. */
  show_size_guide: z.boolean().optional(),
  /** Optional REAL aggregate rating (0–5) + count. Stars render only when both
   *  are present — never fabricate review counts. */
  rating_value: z.number().min(0).max(5).optional(),
  rating_count: z.number().int().nonnegative().optional(),
  /** Point this section's WhatsApp button at a different number than the
   *  store-wide one (store_config.contact.whatsapp_number). Empty = inherit. */
  whatsapp_override: z.string().optional(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  add_to_cart_label_i18n: { en: "Add to cart", ar: "أضف إلى السلة" },
  cod_badge_label_i18n: {
    en: "Cash on delivery",
    ar: "الدفع عند الاستلام",
  },
  show_compare_price: true,
  show_variant_picker: true,
  show_qty_stepper: true,
  show_cod_card: true,
  show_size_guide: true,
};

const definition: SectionDefinition<Props> = {
  type: "pdp_buy_box",
  category: "page",
  name: { en: "Buy box", ar: "صندوق الشراء" },
  description: {
    en: "PDP buy box: badge, title, price, COD card, size/option/qty, add-to-cart, sticky slab.",
    ar: "صندوق شراء المنتج: الشارة، العنوان، السعر، بطاقة الدفع عند الاستلام، المقاس/الخيار/الكمية، الإضافة للسلة، الشريط السفلي.",
  },
  thumbnail: "/sections/pdp_buy_box.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: PdpBuyBoxRender,
};

registerSection(definition);
export default definition;
