// =====================================================================
// product_reviews highlights — which review goes where (spec D10)
// =====================================================================
// Order: the merchant's pin (`rank`, 1 first; unpinned after) — then
// rating desc, then how many topics the review mentions desc, then body
// length desc, then id (so equal reviews never swap between renders: all
// six imports share one created_at).
//
// The visible set honours the low review instead of hiding it: with
// `visible_count` N ≥ 2 and a review under 4★ that would fall outside the
// first N, the list shows the first N − 1 plus that review (the lowest-
// rated; on a tie the later one), and «شوف كل» inserts the rest BEFORE it,
// so it is last in both states and the visible cards never move. N = 1
// shows only the first review: a single card is never the low one.
// =====================================================================

export interface OrderableReview {
  id: string;
  rating: number;
  body?: string | null;
}

export interface FeaturedOrder<T> {
  /** Cards drawn before «شوف كل». */
  visible: T[];
  /** Every card, in the expanded order. */
  all: T[];
}

export const DEFAULT_VISIBLE_COUNT = 3;

export function featuredOrder<T extends OrderableReview>(
  reviews: readonly T[],
  opts: {
    visibleCount?: number;
    rankOf: (id: string) => number | undefined;
    themeCountOf: (review: T) => number;
  },
): FeaturedOrder<T> {
  const n = opts.visibleCount ?? DEFAULT_VISIBLE_COUNT;
  const sorted = [...reviews].sort((a, b) => {
    const ra = opts.rankOf(a.id) ?? Number.POSITIVE_INFINITY;
    const rb = opts.rankOf(b.id) ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    if (a.rating !== b.rating) return b.rating - a.rating;
    const ta = opts.themeCountOf(a);
    const tb = opts.themeCountOf(b);
    if (ta !== tb) return tb - ta;
    const la = (a.body ?? "").length;
    const lb = (b.body ?? "").length;
    if (la !== lb) return lb - la;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  let low: T | null = null;
  for (const r of sorted) {
    if (r.rating < 4 && (low === null || r.rating <= low.rating)) low = r;
  }
  const lowAt = low === null ? -1 : sorted.indexOf(low);
  if (n < 2 || low === null || lowAt < n) {
    return { visible: sorted.slice(0, n), all: sorted };
  }
  const rest = sorted.filter((r) => r !== low);
  return {
    visible: [...rest.slice(0, n - 1), low],
    all: [...rest, low],
  };
}
