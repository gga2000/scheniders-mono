import { PageHeadingSkeleton, ProductGridSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <>
      <PageHeadingSkeleton />
      {/* The catalogue lifts the grid's limit, so it shows more of them. */}
      <ProductGridSkeleton count={12} />
    </>
  );
}
