import { ProductPageSkeleton } from "@/components/skeletons";

/** The product page is the slowest and the most valuable — it waits on the
 *  product, its images, variants, reviews and related products. */
export default function Loading() {
  return <ProductPageSkeleton />;
}
