// =====================================================================
// Section — checkout_form
// =====================================================================
// Cash-on-delivery checkout:
//   • Cart › Details › Confirm step indicator
//   • "we'll call to confirm" reassurance callout (copy is a prop — no
//     hardcoded minutes the merchant can't keep)
//   • delivery-details form (name, +964 phone, governorate, area, address,
//     notes) with autocomplete + Iraqi-mobile validation
//   • COD payment block — the only method a COD store has; no "coming
//     soon" placeholders
//   • trust pills (returns window read from the tenant's commerce config)
//   • totaled primary CTA + cash-on-delivery fine print
//   • "Place order via WhatsApp instead" alternative
// Submits to `/api/checkout/orders`. Every fill/border/radius/shadow is a
// `--bk-*` token so any brand kit renders it as its own.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { CheckoutFormRender } from "./checkout_form.client";

// "card" / "fastpay" stay in the enum so stored configs parse; the form
// never renders them — a COD store has one payment method, and a disabled
// "coming soon" option is dead UI that promises what the merchant can't do.
export const paymentMethod = z.enum(["cod", "card", "fastpay"]);

const schema = z.object({
  require_email: z.boolean(),
  require_notes: z.boolean(),
  payment_methods: z.array(paymentMethod),
  reassurance_text_i18n: i18nStringOptional,
  /** Headline of the callout above the form. Neutral by default — no
   *  "within 30 minutes" the merchant hasn't committed to. */
  call_promise_i18n: i18nStringOptional,
  /** Second line of the callout. */
  call_promise_note_i18n: i18nStringOptional,
  /** Trust pills under the payment block (icon = Material Symbols name). The
   *  returns pill is added automatically from `commerce.returns_policy`. */
  trust_pills: z
    .array(
      z.object({ label_i18n: i18nStringSchema, icon: z.string().optional() }),
    )
    .optional(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  require_email: false,
  require_notes: false,
  payment_methods: ["cod"],
  reassurance_text_i18n: {
    en: "Free inspection on delivery — pay only if you're happy.",
    ar: "فحص مجاني عند الاستلام — لا تدفع إلا إذا أعجبتك القطعة.",
  },
  call_promise_i18n: {
    en: "We'll call to confirm your order",
    ar: "سنتصل بك لتأكيد الطلب",
  },
  call_promise_note_i18n: {
    en: "No upfront payment needed.",
    ar: "لا حاجة لأي دفع مسبق.",
  },
  trust_pills: [
    {
      label_i18n: { en: "Secure order", ar: "طلب آمن" },
      icon: "verified_user",
    },
    {
      label_i18n: { en: "Verified seller", ar: "بائع موثّق" },
      icon: "storefront",
    },
  ],
};

const definition: SectionDefinition<Props> = {
  type: "checkout_form",
  category: "page",
  name: { en: "Checkout form", ar: "نموذج الدفع" },
  description: {
    en: "Cash-on-delivery checkout: details form, COD block, trust pills, totaled CTA.",
    ar: "نموذج الدفع عند الاستلام: تفاصيل التوصيل، الدفع عند الاستلام، شارات الثقة، زر التأكيد بالمجموع.",
  },
  thumbnail: "/sections/checkout_form.svg",
  valid_on: ["checkout"],
  schema,
  defaultProps,
  render: CheckoutFormRender,
};

registerSection(definition);
export default definition;
