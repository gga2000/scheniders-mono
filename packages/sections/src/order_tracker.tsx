// =====================================================================
// Section — order_tracker
// =====================================================================
// Order lookup + status timeline. Lookups go to
// `/api/orders/lookup?phone=…&order_number=…` and the response feeds a
// 5-step timeline.
//
// Honest contract (P1-24): the lookup API requires BOTH the phone and the
// order number — a phone alone is not a safe key (one number can hold
// many orders, and phone-only lookup would let anyone enumerate a
// customer's history). `lookup_method` is kept in the schema so stored
// configs parse, but every value renders both fields as required; the
// copy never promises "just your phone number".
// =====================================================================

import { z } from "zod";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { OrderTrackerRender } from "./order_tracker.client";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  lookup_method: z.enum(["phone", "order_number", "both"]),
  show_timeline: z.boolean(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Track your order", ar: "تتبّع طلبك" },
  lookup_method: "both",
  show_timeline: true,
};

const definition: SectionDefinition<Props> = {
  type: "order_tracker",
  category: "page",
  name: { en: "Order tracker", ar: "تتبّع الطلب" },
  description: {
    en: "Phone + order-number lookup with an optional 5-step status timeline.",
    ar: "بحث برقم الهاتف ورقم الطلب مع خط زمني بخمس خطوات.",
  },
  thumbnail: "/sections/order_tracker.svg",
  valid_on: ["track", "checkout_success"],
  schema,
  defaultProps,
  render: OrderTrackerRender,
};

registerSection(definition);
export default definition;
