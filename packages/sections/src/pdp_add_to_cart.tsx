// =====================================================================
// Section — pdp_add_to_cart
// =====================================================================
// Primary CTA cluster for the PDP: add-to-cart button + optional
// WhatsApp button + quantity picker. Optionally pins itself to the
// bottom of the viewport on mobile.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { PdpAddToCartRender } from "./pdp_add_to_cart.client";

const schema = z.object({
  primary_label_i18n: i18nStringSchema,
  whatsapp_label_i18n: i18nStringOptional,
  show_quantity_picker: z.boolean(),
  sticky_on_mobile: z.boolean(),
  /** Per-section WhatsApp number override (empty = store-wide number). */
  whatsapp_override: z.string().optional(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  primary_label_i18n: { en: "Add to cart", ar: "أضف إلى السلة" },
  whatsapp_label_i18n: { en: "Order on WhatsApp", ar: "اطلب عبر واتساب" },
  show_quantity_picker: true,
  sticky_on_mobile: true,
};

const definition: SectionDefinition<Props> = {
  type: "pdp_add_to_cart",
  category: "page",
  name: { en: "Add to cart", ar: "إضافة إلى السلة" },
  description: {
    en: "Primary PDP CTA: add-to-cart + WhatsApp + quantity picker.",
    ar: "زر الشراء الرئيسي مع واتساب ومحدّد الكمية.",
  },
  thumbnail: "/sections/pdp_add_to_cart.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: PdpAddToCartRender,
};

registerSection(definition);
export default definition;
