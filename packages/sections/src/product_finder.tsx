// =====================================================================
// Section — product_finder
// =====================================================================
// A short quiz that ends in a shortlist. The merchant writes the
// questions; each one narrows on ONE of their own attributes, and each
// answer carries a value for it. A perfume house asks about family and
// longevity, a coffee roaster about roast and body — the section knows
// neither, only how to compare an answer to an attribute.
//
// Scoring RANKS rather than filters (see @scheniders/shared product-finder):
// a shopper who answers every question still gets a best match even when
// nothing satisfies all of them.
// =====================================================================

import { z } from "zod";
import { i18nStringSchema, i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { ProductFinderRender } from "./product_finder.client";

const answerSchema = z.object({
  label_i18n: i18nStringSchema,
  /**
   * Compared against the product's value for `attribute_key`: an option
   * value for a choice, a number for a scale, a note for a grouped list.
   */
  value: z.string(),
  /** Relative importance of the question this answer belongs to. */
  weight: z.number().positive().max(10).optional(),
});

const questionSchema = z.object({
  prompt_i18n: i18nStringSchema,
  help_i18n: i18nStringOptional,
  /** Which of the merchant's attributes this question narrows on. */
  attribute_key: z.string(),
  answers: z.array(answerSchema),
});

const schema = z.object({
  heading_i18n: i18nStringSchema,
  intro_i18n: i18nStringOptional,
  questions: z.array(questionSchema),
  start_label_i18n: i18nStringSchema,
  result_heading_i18n: i18nStringSchema,
  restart_label_i18n: i18nStringSchema,
  skip_label_i18n: i18nStringSchema,
  result_limit: z.number().int().positive().max(24),
});

export type Props = z.infer<typeof schema>;

// Seeded for the flagship's own taxonomy. Every value here is a key or an
// option the merchant owns — swap the taxonomy and the same section asks
// about roast and origin instead.
const defaultProps: Props = {
  heading_i18n: { en: "Find your scent", ar: "لكَّي عطرك" },
  intro_i18n: {
    en: "Three questions, and we'll narrow it down for you.",
    ar: "ثلاث أسئلة وننطيك الأنسب إلك.",
  },
  start_label_i18n: { en: "Start", ar: "ابدأ" },
  result_heading_i18n: { en: "Your matches", ar: "الأنسب إلك" },
  restart_label_i18n: { en: "Start over", ar: "من الأول" },
  skip_label_i18n: { en: "No preference", ar: "ما يفرق" },
  result_limit: 4,
  questions: [
    {
      prompt_i18n: { en: "What kind of scent do you like?", ar: "شنو نوع العطر اللي يعجبك؟" },
      attribute_key: "scent_family",
      answers: [
        { label_i18n: { en: "Warm and oriental", ar: "دافئ وشرقي" }, value: "oriental", weight: 2 },
        { label_i18n: { en: "Woody", ar: "خشبي" }, value: "woody", weight: 2 },
        { label_i18n: { en: "Fresh", ar: "منعش" }, value: "fresh", weight: 2 },
        { label_i18n: { en: "Sweet", ar: "حلو" }, value: "sweet", weight: 2 },
      ],
    },
    {
      prompt_i18n: { en: "How long should it last?", ar: "شكد تريده يثبت؟" },
      attribute_key: "longevity",
      answers: [
        { label_i18n: { en: "All day", ar: "طول اليوم" }, value: "5" },
        { label_i18n: { en: "A few hours is fine", ar: "كم ساعة تكفي" }, value: "3" },
      ],
    },
    {
      prompt_i18n: { en: "When will you wear it?", ar: "وين راح تستخدمه؟" },
      attribute_key: "season",
      answers: [
        { label_i18n: { en: "Summer", ar: "بالصيف" }, value: "summer" },
        { label_i18n: { en: "Winter", ar: "بالشتاء" }, value: "winter" },
        { label_i18n: { en: "All year", ar: "طول السنة" }, value: "all_year" },
      ],
    },
  ],
};

const definition: SectionDefinition<Props> = {
  type: "product_finder",
  category: "conversion",
  name: { en: "Product finder", ar: "دليل الاختيار" },
  description: {
    en: "A short quiz that ends in a shortlist, driven by your product attributes.",
    ar: "أسئلة قصيرة تنتهي بقائمة مقترحات، معتمدة على خصائص منتجاتك.",
  },
  thumbnail: "/sections/product_finder.svg",
  valid_on: ["home", "category", "search", "about"],
  schema,
  defaultProps,
  render: ProductFinderRender,
  // Every question is answered from `ctx.products[].attributes`.
  needsProductAttributes: true,
};

registerSection(definition);
export default definition;
