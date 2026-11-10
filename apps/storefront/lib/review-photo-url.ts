/**
 * Same-origin link that serves photo `n` of a review once it is approved
 * (app/api/reviews/photo/[id]/[n]/route.ts). Relative, so it works on every
 * store host, and without a query string, so next/image optimizes it.
 */
export function reviewPhotoUrl(reviewId: string, n: number): string {
  return `/api/reviews/photo/${reviewId}/${n}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PHOTO_PATH = new RegExp(`^(${UUID})/${UUID}/${UUID}\\.(?:jpg|png|webp)$`);

/**
 * True only for the exact `<tenant>/<product>/<photo>.<ext>` shape the review
 * upload writes, inside `tenantId`'s folder. The service-role storage client
 * does not encode `..`, so anything looser could reach other Supabase APIs.
 * The DB enforces the same rule (product_reviews_photo_paths_safe).
 */
export function isReviewPhotoPath(tenantId: string, path: string): boolean {
  const match = PHOTO_PATH.exec(path);
  return match !== null && match[1] === tenantId;
}
