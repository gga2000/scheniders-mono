// =====================================================================
// Product reviews — types + rating aggregate
// =====================================================================
// Customer ratings/photos per product (stored in product_reviews, moderated).
// computeRatingSummary turns a list of approved reviews into the star average,
// count, and per-star distribution the PDP shows.
// =====================================================================

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface ProductReview {
  id: string;
  product_id: string;
  /** 1–5. */
  rating: number;
  title?: string | null;
  body?: string | null;
  author_name?: string | null;
  photo_urls: string[];
  status?: ReviewStatus;
  created_at: string;
}

export interface RatingSummary {
  /** Mean rating, rounded to 1 decimal (0 when no reviews). */
  average: number;
  count: number;
  /** Count per star (1–5). */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export function computeRatingSummary(
  reviews: ReadonlyArray<{ rating: number }>,
): RatingSummary {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  let sum = 0;
  let count = 0;
  for (const r of reviews) {
    const star = Math.round(r.rating);
    if (star >= 1 && star <= 5) {
      distribution[star as 1 | 2 | 3 | 4 | 5] += 1;
      sum += star;
      count += 1;
    }
  }
  const average = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
  return { average, count, distribution };
}
