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
import { i18nStringOptional, i18nStringSchema } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition } from "./_types";
import { ProductReviewsRender } from "./product_reviews.client";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  show_form: z.boolean(),
  /** Opt-in quieter PDP layout: one hairline summary card (big average,
   *  star bars, «N تقييم»), each review as a quiet card, and the form
   *  folded behind a modest «اكتب تقييمك» button. "highlights" (opt-in,
   *  spec §1.6): a light summary card (`#reviews-summary`), word buttons
   *  that highlight and never filter, a featured review, compact cards
   *  with a key phrase marked, «رد {store}» replies, and the rest behind
   *  «شوف كل التقييمات (N)». Absent means the historical layout,
   *  byte-identical. */
  layout: z.enum(["quiet", "highlights"]).optional().catch(undefined),
  /** Highlights: the topics buyers mention. A review counts once per
   *  topic when its body contains one of `match_terms` (folded substring
   *  match) or its curation `tags` hold the key. A topic with no hits is
   *  not drawn. */
  theme_words: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
        label_i18n: i18nStringSchema,
        // Optional so a topic can be tag-only, e.g. «طلبوا مرة ثانية».
        match_terms: z.array(z.string().min(2)).min(1).max(8).optional(),
      }),
    )
    .max(6)
    .optional()
    .catch(undefined),
  /** Highlights: cards shown before «شوف كل التقييمات». Default 3. */
  visible_count: z.number().int().min(1).max(6).optional().catch(undefined),
  /** "hash_only": the write-review entry and form render only for a
   *  visitor who arrives on #reviews (the order tracker's link). */
  form_entry: z.enum(["always", "hash_only"]).optional().catch(undefined),
  heading_style: z.enum(["section", "chapter"]).optional().catch(undefined),
  /** Highlights: merchant curation per approved review, until Phase 2
   *  stores it on product_reviews (pinned_rank, tags, highlight_quote,
   *  reply_body). `rank` pins the order (1 first); `highlight` is the
   *  key phrase, used only when it is a verbatim part of the body;
   *  `reply_i18n` is the store's public reply («رد {store}»), drawn only
   *  when it has text. A bad field drops only that field. */
  review_curation: z
    .array(
      z.object({
        review_id: z.string().uuid(),
        rank: z.number().int().min(1).max(20).optional().catch(undefined),
        tags: z
          .array(z.string().regex(/^[a-z][a-z0-9_]{0,30}$/))
          .max(6)
          .optional()
          .catch(undefined),
        highlight: z.string().min(3).max(200).optional().catch(undefined),
        reply_i18n: i18nStringOptional.catch(undefined),
      }),
    )
    .max(40)
    .optional()
    .catch(undefined),
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
