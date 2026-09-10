import { ProductGridSkeleton } from "@/components/skeletons";

/** Search keeps its own form in the layout above; only the results wait. */
export default function Loading() {
  return <ProductGridSkeleton count={6} />;
}
