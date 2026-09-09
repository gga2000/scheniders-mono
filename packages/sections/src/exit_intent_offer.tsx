// =====================================================================
// Section — exit_intent_offer
// =====================================================================
// Modal triggered when the mouse leaves the viewport (or after a fallback
// delay on mobile, where mouseleave isn't reliable). Shows a single
// offer card with heading + body + CTA + optional discount code. The
// shopper can copy the code with one tap. Suppressed via `sessionStorage`
// once dismissed so it doesn't reappear on every page in the same
// session.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { ExitIntentOfferRender } from "./exit_intent_offer.client";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  body_i18n: i18nStringSchema,
  cta_label_i18n: i18nStringSchema,
  cta_href: z.string(),
  discount_code: z.string().optional(),
  triggered_after_seconds: z.number().int().nonnegative(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Wait! Take 10% off", ar: "انتظر! خصم 10٪ لك" },
  body_i18n: {
    en: "Use this code at checkout — valid for the next 24 hours.",
    ar: "استخدم هذا الكود عند الدفع — صالح لمدة 24 ساعة.",
  },
  cta_label_i18n: { en: "Claim my discount", ar: "اطلب الخصم" },
  cta_href: "/products",
  discount_code: "SAVE10",
  triggered_after_seconds: 30,
};

const definition: SectionDefinition<Props> = {
  type: "exit_intent_offer",
  overlay: true,
  category: "conversion",
  name: { en: "Exit-intent offer", ar: "عرض عند المغادرة" },
  description: {
    en: "Modal triggered on exit intent with offer card and copy-code button.",
    ar: "نافذة تظهر عند نية المغادرة مع عرض وزر نسخ الكود.",
  },
  thumbnail: "/sections/exit_intent_offer.svg",
  valid_on: ["home", "product", "category"],
  schema,
  defaultProps,
  render: ExitIntentOfferRender,
};

registerSection(definition);
export default definition;
