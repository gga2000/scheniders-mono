import { OrderCardSkeleton } from "@/components/dashboard/order-card-skeleton";

/**
 * Loading UI for the Orders page - displays immediately while data loads
 * This is a Next.js 13+ feature that shows a skeleton during navigation
 */
export default function OrdersLoading() {
    return (
        <div className="min-h-screen p-4 md:p-6 lg:p-8">
            <div className="space-y-4">
                {/* Skeleton header */}
                <div className="flex items-center justify-between">
                    <div className="space-y-2">
                        <div className="skeleton w-48 h-8 rounded-xl" />
                        <div className="skeleton w-24 h-4 rounded-lg" />
                    </div>
                    <div className="skeleton w-32 h-12 rounded-2xl" />
                </div>

                {/* Skeleton filter bar */}
                <div className="flex gap-2 overflow-hidden">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="skeleton w-24 h-12 rounded-full flex-shrink-0" />
                    ))}
                </div>

                {/* Skeleton order cards */}
                <div className="space-y-3">
                    <OrderCardSkeleton count={8} />
                </div>
            </div>
        </div>
    );
}
