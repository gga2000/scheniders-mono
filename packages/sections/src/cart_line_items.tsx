// =====================================================================
// Section — cart_line_items
// =====================================================================
// Cart line-item list. Reads cart items from `useCart()` and lets the
// shopper change quantities or remove items inline. Renders an empty
// state when the cart is empty. Owns the cart page's h1.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { CartLineItemsRender } from "./cart_line_items.client";

const schema = z.object({
  show_thumbnails: z.boolean(),
  empty_state_message_i18n: i18nStringSchema,
  /** "chunky" (default): today's outlined Candy Bento cards. "soft" (slice
   *  1h): the redesigned PDP's voice — one hairline list, ink prices (D4),
   *  names on up to two lines instead of an ellipsis, the chapter heading,
   *  rows read from the right in Arabic. A bad stored value falls back. */
  style: z.enum(["chunky", "soft"]).optional().catch(undefined),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  show_thumbnails: true,
  empty_state_message_i18n: {
    en: "Your cart is empty — keep shopping.",
    ar: "سلتك فارغة — تابع التسوّق.",
  },
};

const definition: SectionDefinition<Props> = {
  type: "cart_line_items",
  category: "page",
  name: { en: "Cart line items", ar: "عناصر السلة" },
  description: {
    en: "Cart line item list with quantity steppers and remove buttons.",
    ar: "قائمة عناصر السلة مع زرّ كمية وإزالة.",
  },
  thumbnail: "/sections/cart_line_items.svg",
  valid_on: ["cart"],
  schema,
  defaultProps,
  render: CartLineItemsRender,
};

registerSection(definition);
export default definition;
