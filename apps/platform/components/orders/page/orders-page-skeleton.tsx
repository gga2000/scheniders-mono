import { OrderRowsSkeleton, SKELETON_BLOCK } from "./order-rows-skeleton";

/**
 * The orders page's shape while the first load runs (board O3): the summary
 * chips, the toolbar, the search and status card, then card outlines, in the
 * places the real page puts them. It used to be an empty canvas for seconds.
 */
export function OrdersPageSkeleton() {
    const block = SKELETON_BLOCK;
    return (
        <div className="min-h-screen p-4 md:p-6 lg:p-8" aria-busy="true">
            <div className="space-y-4 md:space-y-6">
                <div className="flex flex-wrap gap-3">
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className={`${block} h-12 w-36 rounded-full`} />
                    ))}
                </div>
                <div className={`${block} h-[84px] rounded-3xl`} />
                <div className={`${block} h-[200px] rounded-3xl`} />
                <OrderRowsSkeleton variant="cards" />
            </div>
        </div>
    );
}
