import { ProductGridSkeleton } from "@/components/skeletons";

/** Search results: the shape of the grid while the matches load. */
export default function Loading() {
  return <ProductGridSkeleton count={6} />;
}
