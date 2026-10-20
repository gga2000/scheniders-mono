// =====================================================================
// Loading skeletons for the storefront
// =====================================================================
// Every page here is server-rendered, and the storefront had no
// `loading.tsx` anywhere — so a navigation on a slow Iraqi connection
// showed nothing at all until the server answered. These fill that gap
// with the shape of the page that is coming, so the layout does not jump
// when it arrives.
//
// Two rules they follow:
//   • Brand-kit tokens only. A skeleton in someone else's grey would look
//     like a broken page rather than a loading one.
//   • `aria-hidden`, and no text. They are decorative placeholders; the
//     router already announces the navigation, and inventing a localized
//     "loading…" string in a component that cannot read the tenant's
//     locale is exactly the hardcoding this template removes.
//
// The shimmer needs no reduced-motion guard of its own: globals.css
// neutralises animations under `prefers-reduced-motion` AND under the
// brand kit's own `data-bk-motion="reduce"`.

const BLOCK =
  "bk-skeleton rounded-bk-input bg-bk-surface-alt";

/** One placeholder rectangle. `className` sets its size. */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`${BLOCK} ${className}`} />;
}

/** A product card: square image, two lines, a price. Mirrors product_grid. */
function CardSkeleton() {
  return (
    <div className="flex flex-col gap-bk-2xs">
      <SkeletonBlock className="aspect-square w-full" />
      <SkeletonBlock className="h-3.5 w-4/5" />
      <SkeletonBlock className="h-3 w-1/2" />
    </div>
  );
}

/** The grid the catalogue, search and category pages all render. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-bk-sm px-4 py-6 sm:gap-bk-md md:grid-cols-3 lg:grid-cols-4"
    >
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A page heading band — eyebrow, title, one line of blurb. */
export function PageHeadingSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col items-center gap-bk-2xs px-4 pt-8">
      <SkeletonBlock className="h-3 w-24" />
      <SkeletonBlock className="h-7 w-2/3 max-w-sm" />
      <SkeletonBlock className="h-3.5 w-1/2 max-w-xs" />
    </div>
  );
}

/**
 * The product page: gallery beside the order form on desktop, stacked on
 * mobile — the same one-column/two-column split pdp_direct_order uses.
 */
export function ProductPageSkeleton() {
  return (
    <div aria-hidden="true" className="px-4 py-6">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-start gap-bk-md lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-bk-xs">
          <SkeletonBlock className="aspect-square w-full" />
          <div className="flex gap-bk-2xs">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonBlock key={i} className="h-16 w-16 shrink-0" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-bk-sm">
          <SkeletonBlock className="h-7 w-4/5" />
          <SkeletonBlock className="h-5 w-1/3" />
          <SkeletonBlock className="h-px w-full" />
          {/* The order form's fields — name, phone, governorate, address. */}
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonBlock key={i} className="h-11 w-full" />
          ))}
          <SkeletonBlock className="h-14 w-full rounded-bk-pill" />
        </div>
      </div>
    </div>
  );
}
