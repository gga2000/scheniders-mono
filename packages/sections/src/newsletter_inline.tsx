// =====================================================================
// Section — newsletter_inline
// =====================================================================
// Inline newsletter signup (not a modal). Posts to `/api/newsletter`
// with the tenant id, visitor's locale + email. The endpoint is owned
// by the storefront app; this section only renders the form.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { NewsletterInlineRender } from "./newsletter_inline.client";

const tint = z.enum(["white", "mint", "butter", "lilac", "sky", "pink"]);

const schema = z.object({
  heading_i18n: i18nStringSchema,
  body_i18n: i18nStringOptional,
  placeholder_i18n: i18nStringSchema,
  cta_label_i18n: i18nStringSchema,
  bg: tint.optional(),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Get the drops first", ar: "كن أول من يعرف" },
  body_i18n: {
    en: "Subscribe for restocks and first-look launches.",
    ar: "اشترك ليصلك كل جديد وإعادة التوفير.",
  },
  placeholder_i18n: { en: "you@email.com", ar: "بريدك الإلكتروني" },
  cta_label_i18n: { en: "Sign me up", ar: "اشترك" },
  bg: "butter",
};

const def: SectionDefinition<Props> = {
  type: "newsletter_inline",
  category: "conversion",
  name: { en: "Newsletter signup", ar: "اشتراك النشرة" },
  description: {
    en: "Inline newsletter email capture with chunky-card styling.",
    ar: "بطاقة اشتراك بريد إلكتروني داخل الصفحة.",
  },
  thumbnail: "/sections/newsletter_inline.svg",
  valid_on: ["home", "about", "category"],
  schema,
  defaultProps,
  render: NewsletterInlineRender,
};

registerSection(def);
export default def;
