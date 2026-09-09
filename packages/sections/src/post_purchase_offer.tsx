// =====================================================================
// Section — post_purchase_offer
// =====================================================================
// One more offer on the thank-you page, appended to the order that was
// just placed — no second checkout, no re-typing an address. Decline it and
// the next-best offer appears (the downsell); decline that and the section
// says thank you and gets out of the way.
//
// Offers come from the merchant's existing order bumps, so there is nothing
// new to configure. The section renders NOTHING unless this browser placed
// the order (proved via the session stash + the endpoint's phone check) and
// the endpoint has at least one eligible, in-stock offer.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { PostPurchaseOfferRender } from "./post_purchase_offer.client";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  /** `{discount}` is replaced with the percentage. */
  eyebrow_i18n: i18nStringSchema,
  accept_label_i18n: i18nStringSchema,
  decline_label_i18n: i18nStringSchema,
  /** Shown once an offer is accepted; `{total}` is the new order total. */
  accepted_i18n: i18nStringSchema,
  /** How many offers to walk through before giving up. */
  max_offers: z.number().int().min(1).max(3),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  eyebrow_i18n: { ar: "عرض لمرة وحدة — خصم {discount}٪", en: "One-time offer — {discount}% off" },
  heading_i18n: { ar: "تضيفها على نفس الطلب؟", en: "Add it to this order?" },
  accept_label_i18n: { ar: "نعم، ضيفها", en: "Yes, add it" },
  decline_label_i18n: { ar: "لا، شكراً", en: "No thanks" },
  accepted_i18n: {
    ar: "تمت الإضافة ✓ مجموع طلبك الجديد {total}",
    en: "Added ✓ Your new order total is {total}",
  },
  max_offers: 2,
};

const definition: SectionDefinition<Props> = {
  type: "post_purchase_offer",
  category: "conversion",
  name: { en: "Post-purchase offer", ar: "عرض بعد الطلب" },
  description: {
    en: "One more add-on after checkout, appended to the order just placed. Uses your order bumps.",
    ar: "عرض إضافي بعد إتمام الطلب، ينضاف على نفس الطلب. يعتمد على عروض الإضافة عندك.",
  },
  thumbnail: "/sections/post_purchase_offer.svg",
  valid_on: ["checkout_success"],
  schema,
  defaultProps,
  render: PostPurchaseOfferRender,
};

registerSection(definition);
export default definition;
