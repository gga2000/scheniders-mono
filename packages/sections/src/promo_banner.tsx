// =====================================================================
// Section — promo_banner
// =====================================================================
// Full-width promo announcement. Headline + optional body + optional CTA
// + optional live countdown to an ISO target. Built as a client
// component because the countdown ticks in the browser.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { PromoBanner } from "./promo_banner.client";

const bannerBg = z.enum([
  "white",
  "mint",
  "butter",
  "lilac",
  "sky",
  "pink",
  "cream",
]);

const schema = z.object({
  heading_i18n: i18nStringSchema,
  body_i18n: i18nStringOptional,
  cta_label_i18n: i18nStringOptional,
  cta_href: z.string().optional(),
  countdown_to_iso: z.string().optional(),
  bg: bannerBg,
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Mid-season sale — 30% off", ar: "تخفيض منتصف الموسم — 30٪" },
  body_i18n: {
    en: "Site-wide. No code needed. Cash on delivery as always.",
    ar: "خصم على كل الموقع. لا حاجة لكود. الدفع عند الاستلام كالعادة.",
  },
  cta_label_i18n: { en: "Shop the sale", ar: "تسوّق التخفيض" },
  cta_href: "/products?sort=sale",
  countdown_to_iso: undefined,
  bg: "pink",
};

const definition: SectionDefinition<Props> = {
  type: "promo_banner",
  category: "conversion",
  name: { en: "Promo banner", ar: "بانر عرض" },
  description: {
    en: "Full-width promo announcement with optional CTA and live countdown.",
    ar: "بانر عرض كبير مع زر اختياري وعدّاد تنازلي مباشر.",
  },
  thumbnail: "/sections/promo_banner.svg",
  valid_on: ["home", "category", "product"],
  schema,
  defaultProps,
  render: PromoBanner,
};

registerSection(definition);
export default definition;
