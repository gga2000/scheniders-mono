// =====================================================================
// Section — cart_summary
// =====================================================================
// Subtotal + delivery + total panel for the cart page, plus the
// checkout CTA and optional promo-code input. Reads the cart from
// `useCart()`. When the cart is empty we still render the heading so
// the page has structure — the checkout CTA becomes a disabled button
// (never a link that goes nowhere).
// =====================================================================

import { z } from "zod";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { CartSummaryRender } from "./cart_summary.client";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  checkout_label_i18n: i18nStringSchema,
  show_promo_input: z.boolean(),
  /** "chunky" (default): today's outlined card and pill button. "soft"
   *  (slice 1h): the express receipt and its order button — hairline card,
   *  ink figures (D4), the token-radius yellow action, WhatsApp as the soft
   *  green row, no fine print (the page's trust strip states the terms). */
  style: z.enum(["chunky", "soft"]).optional().catch(undefined),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Order summary", ar: "ملخّص الطلب" },
  checkout_label_i18n: { en: "Continue to checkout", ar: "متابعة الدفع" },
  show_promo_input: false,
};

const definition: SectionDefinition<Props> = {
  type: "cart_summary",
  category: "page",
  name: { en: "Cart summary", ar: "ملخّص السلة" },
  description: {
    en: "Subtotal, delivery, total, and checkout CTA with optional promo input.",
    ar: "ملخّص السلة (المجموع، التوصيل، الكلّي) مع زر الدفع وكود الخصم.",
  },
  thumbnail: "/sections/cart_summary.svg",
  valid_on: ["cart"],
  schema,
  defaultProps,
  render: CartSummaryRender,
};

registerSection(definition);
export default definition;
