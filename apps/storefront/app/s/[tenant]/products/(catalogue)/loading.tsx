import { PageHeadingSkeleton, ProductGridSkeleton } from "@/components/skeletons";

// The (catalogue) group keeps this boundary off /products/[slug]: a loading.tsx
// at products/ would wrap the product route's layout too, and that layout must
// set its 404 / 308 before anything streams (see lib/route-guards.ts).
export default function Loading() {
  return (
    <>
      <PageHeadingSkeleton />
      {/* The catalogue lifts the grid's limit, so it shows more of them. */}
      <ProductGridSkeleton count={12} />
    </>
  );
}
