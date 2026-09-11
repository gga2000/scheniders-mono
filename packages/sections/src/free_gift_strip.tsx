// =====================================================================
// Section — free_gift_strip
// =====================================================================
// Progress strip used on the cart page: "Spend X more to unlock a free
// gift." Reads the live cart subtotal from the shared `useCart()` store
// (the same source every other cart section uses) so the bar updates as
// the customer adds items.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { FreeGiftStrip } from "./free_gift_strip.client";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  threshold_iqd: z.number().int().positive(),
  gift_image_url: z.string().describe("image").optional(),
  unlocked_label_i18n: i18nStringOptional,
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: {
    en: "Spend {remaining} more to unlock a free gift",
    ar: "أضف بقيمة {remaining} لتفتح هدية مجانية",
  },
  threshold_iqd: 75_000,
  gift_image_url: undefined,
  unlocked_label_i18n: {
    en: "Free gift unlocked — added at checkout",
    ar: "تم فتح الهدية المجانية — ستُضاف عند الدفع",
  },
};

const definition: SectionDefinition<Props> = {
  type: "free_gift_strip",
  category: "conversion",
  name: { en: "Free gift strip", ar: "شريط الهدية المجانية" },
  description: {
    en: "Cart progress bar toward a free-gift spending threshold.",
    ar: "شريط تقدّم في السلة نحو حدّ إنفاق يفتح هدية مجانية.",
  },
  thumbnail: "/sections/free_gift_strip.svg",
  valid_on: ["cart", "checkout"],
  schema,
  defaultProps,
  render: FreeGiftStrip,
};

registerSection(definition);
export default definition;
