// =====================================================================
// Section — checkout_order_summary
// =====================================================================
// Right-rail order summary for the checkout page. Lists line items
// (compact), shows subtotal / delivery / total, and sticks to the
// viewport on desktop. Reads the cart from `useCart()`.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { CheckoutOrderSummaryRender } from "./checkout_order_summary.client";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  cod_note_i18n: i18nStringOptional,
  sticky: z.boolean(),
  show_thumbnails: z.boolean(),
  /** "chunky" (default): today's outlined recap. "soft" (slice 1h): the
   *  express receipt — hairline card, names on up to two lines, ink
   *  figures and an ink COD note (D4: no yellow total, no green icon). */
  style: z.enum(["chunky", "soft"]).optional().catch(undefined),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Order summary", ar: "ملخّص الطلب" },
  cod_note_i18n: {
    en: "Cash on delivery — pay only after inspection.",
    ar: "الدفع عند الاستلام — لا تدفع إلا بعد فحص الطلب.",
  },
  sticky: true,
  show_thumbnails: true,
};

const definition: SectionDefinition<Props> = {
  type: "checkout_order_summary",
  category: "page",
  name: { en: "Checkout order summary", ar: "ملخّص طلب الدفع" },
  description: {
    en: "Sticky right-rail order summary for checkout (items, totals, COD note).",
    ar: "ملخّص الطلب لصفحة الدفع (العناصر، المجاميع، ملاحظة الدفع عند الاستلام).",
  },
  thumbnail: "/sections/checkout_order_summary.svg",
  valid_on: ["checkout"],
  schema,
  defaultProps,
  render: CheckoutOrderSummaryRender,
};

registerSection(definition);
export default definition;
