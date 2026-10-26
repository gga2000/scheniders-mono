// =====================================================================
// Section — product_reviews
// =====================================================================
// PDP photo reviews: real rating summary (average + distribution), the list
// of APPROVED reviews with their photos, and a submit form. Submissions POST
// to /api/reviews (multipart) and land as `pending` until the merchant
// moderates them — so nothing user-supplied shows publicly unreviewed.
//
// Data flow (P1-13): the product page preloads approved reviews into
// `ctx.product.reviews`, so the list + true distribution are in the SSR
// HTML. The `/api/reviews` GET is only used (a) when that prop is absent
// (other templates / pages) and (b) as revalidation after a submit.
// =====================================================================

import { z } from "zod";
import { i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { ProductReviewsRender } from "./product_reviews.client";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  show_form: z.boolean(),
  /** Opt-in quieter PDP layout: one hairline summary card (big average,
   *  star bars, «N تقييم»), each review as a quiet card, and the form
   *  folded behind a modest «اكتب تقييمك» button. Absent means the
   *  historical layout, byte-identical. */
  layout: z.enum(["quiet"]).optional().catch(undefined),
});

export type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Customer reviews", ar: "آراء العملاء" },
  show_form: true,
};

const definition: SectionDefinition<Props> = {
  type: "product_reviews",
  category: "trust",
  name: { en: "Product reviews", ar: "تقييمات المنتج" },
  description: {
    en: "Real customer ratings, photos, and a review submission form.",
    ar: "تقييمات حقيقية للعملاء مع الصور ونموذج لإرسال تقييم.",
  },
  thumbnail: "/sections/product_reviews.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: ProductReviewsRender,
};

registerSection(definition);
export default definition;
