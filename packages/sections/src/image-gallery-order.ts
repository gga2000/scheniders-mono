// Opt-in ordering for image_gallery on a product page: pictures tagged
// for THIS product first, then untagged ones, then pictures tagged only
// for other products. Order inside each group is the merchant's. Not
// opted in, or off a product page, the list comes back untouched (same
// array), so the historical render cannot change.

export type GalleryOrder = "product_first";

export function orderGalleryImages<T extends { product_ids?: string[] }>(
  images: T[],
  order: GalleryOrder | undefined,
  productId: string | undefined,
): T[] {
  if (order !== "product_first" || !productId) return images;
  const mine: T[] = [];
  const untagged: T[] = [];
  const others: T[] = [];
  for (const img of images) {
    const ids = img.product_ids ?? [];
    if (ids.includes(productId)) mine.push(img);
    else if (ids.length === 0) untagged.push(img);
    else others.push(img);
  }
  return [...mine, ...untagged, ...others];
}
