/**
 * Same-origin link that serves photo `n` of a review once it is approved
 * (app/api/reviews/photo/[id]/[n]/route.ts). Relative, so it works on every
 * store host, and without a query string, so next/image optimizes it.
 */
export function reviewPhotoUrl(reviewId: string, n: number): string {
  return `/api/reviews/photo/${reviewId}/${n}`;
}
