// =====================================================================
// Section — track_order_lookup
// =====================================================================
// Simple phone + order-number lookup form. Posts the lookup to the
// runtime `onTrack` handler when provided; otherwise navigates to the
// /track page with the values as query params. Unlike `order_tracker`,
// this section never renders a status timeline — it is just the form.
// Both fields are required because the lookup API needs both.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { TrackOrderLookupRender } from "./track_order_lookup.client";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  subheading_i18n: i18nStringOptional,
  submit_label_i18n: i18nStringSchema,
  redirect_path: z.string(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Track your order", ar: "تتبّع طلبك" },
  subheading_i18n: {
    en: "Enter your phone and order number to see the latest status.",
    ar: "أدخل رقم هاتفك ورقم الطلب لمعرفة آخر حالة.",
  },
  submit_label_i18n: { en: "Track", ar: "تتبّع" },
  redirect_path: "/track",
};

const definition: SectionDefinition<Props> = {
  type: "track_order_lookup",
  category: "page",
  name: { en: "Track order lookup", ar: "نموذج تتبّع الطلب" },
  description: {
    en: "Phone + order number lookup form for tracking orders.",
    ar: "نموذج بحث برقم الهاتف ورقم الطلب لتتبّع الطلبات.",
  },
  thumbnail: "/sections/track_order_lookup.svg",
  valid_on: ["track", "checkout_success", "home"],
  schema,
  defaultProps,
  render: TrackOrderLookupRender,
};

registerSection(definition);
export default definition;
