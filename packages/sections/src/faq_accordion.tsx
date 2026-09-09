// =====================================================================
// Section — faq_accordion
// =====================================================================
// Localised Q&A accordion. Wraps the existing `FaqAccordion` primitive
// after resolving the per-locale strings.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { FaqAccordionRender } from "./faq_accordion.client";

const schema = z.object({
  heading_i18n: i18nStringSchema,
  items: z.array(
    z.object({
      q_i18n: i18nStringSchema,
      a_i18n: i18nStringSchema,
    }),
  ),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Frequently asked", ar: "الأسئلة الشائعة" },
  items: [
    {
      q_i18n: {
        en: "How long does delivery take?",
        ar: "كم تستغرق مدة التوصيل؟",
      },
      a_i18n: {
        en: "Same-day inside Baghdad, 1–3 days for other governorates.",
        ar: "نفس اليوم داخل بغداد، 1-3 أيام للمحافظات الأخرى.",
      },
    },
    {
      q_i18n: { en: "Can I pay on delivery?", ar: "هل يمكن الدفع عند الاستلام؟" },
      a_i18n: {
        en: "Yes — cash on delivery is supported across Iraq.",
        ar: "نعم — الدفع عند الاستلام متاح في جميع المحافظات.",
      },
    },
    {
      q_i18n: { en: "What is the return policy?", ar: "ما هي سياسة الإرجاع؟" },
      a_i18n: {
        en: "14-day free returns on unopened items.",
        ar: "إرجاع مجاني خلال 14 يوماً للمنتجات غير المفتوحة.",
      },
    },
  ],
};

const def: SectionDefinition<Props> = {
  type: "faq_accordion",
  category: "content",
  name: { en: "FAQ accordion", ar: "أسئلة شائعة" },
  description: {
    en: "Localised Q&A accordion with chunky bento cards.",
    ar: "أكوردين أسئلة وأجوبة بتصميم بنتو.",
  },
  thumbnail: "/sections/faq_accordion.svg",
  valid_on: ["faq", "home", "product"],
  schema,
  defaultProps,
  render: FaqAccordionRender,
};

registerSection(def);
export default def;
