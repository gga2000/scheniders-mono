"use client";

import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface OrderCardSkeletonProps {
    count?: number;
    className?: string;
}

export function OrderCardSkeleton({ count = 1, className }: OrderCardSkeletonProps) {
    const isMobile = useIsMobile();

    return (
        <>
            {Array.from({ length: count }).map((_, index) => (
                <div
                    key={index}
                    className={cn(
                        "bg-[var(--card-bg)] rounded-[20px] border border-[var(--card-border)] p-4 space-y-4",
                        className
                    )}
                >
                    {/* Header Row - Name, Order ID, Status */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {/* Name */}
                            <div className="skeleton skeleton-text w-24 h-5" />
                            {/* Order ID */}
                            <div className="skeleton skeleton-text w-16 h-4" />
                        </div>
                        {/* Status Badge */}
                        <div className="skeleton w-20 h-6 rounded-full" />
                    </div>

                    {/* Product Row */}
                    <div className="flex items-center gap-3">
                        {/* Product Image */}
                        <div className="skeleton w-12 h-12 rounded-xl" />
                        {/* Product Info */}
                        <div className="flex-1 space-y-2">
                            <div className="skeleton skeleton-text w-32 h-4" />
                            <div className="skeleton skeleton-text-sm w-20 h-3" />
                        </div>
                        {/* Price */}
                        <div className="skeleton w-24 h-6 rounded-lg" />
                    </div>

                    {/* Info Row - Phone, Address */}
                    {!isMobile && (
                        <div className="flex items-center gap-4 pt-2 border-t border-[var(--card-border)]">
                            <div className="skeleton skeleton-text w-28 h-4" />
                            <div className="skeleton skeleton-text w-40 h-4" />
                        </div>
                    )}

                    {/* Mobile: Compact info */}
                    {isMobile && (
                        <div className="flex items-center justify-between pt-2 border-t border-[var(--card-border)]">
                            <div className="skeleton skeleton-text w-20 h-4" />
                            <div className="flex items-center gap-2">
                                <div className="skeleton w-8 h-8 skeleton-circle" />
                                <div className="skeleton w-8 h-8 skeleton-circle" />
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </>
    );
}

// Compact version for list views
export function OrderCardSkeletonCompact({ count = 1, className }: OrderCardSkeletonProps) {
    return (
        <>
            {Array.from({ length: count }).map((_, index) => (
                <div
                    key={index}
                    className={cn(
                        "bg-[var(--card-bg)] rounded-xl border border-[var(--card-border)] p-3 flex items-center gap-3",
                        className
                    )}
                >
                    {/* Avatar/Icon */}
                    <div className="skeleton w-10 h-10 skeleton-circle flex-shrink-0" />

                    {/* Content */}
                    <div className="flex-1 space-y-1.5">
                        <div className="skeleton skeleton-text w-28 h-4" />
                        <div className="skeleton skeleton-text-sm w-20 h-3" />
                    </div>

                    {/* Right side */}
                    <div className="skeleton w-16 h-5 rounded-full" />
                </div>
            ))}
        </>
    );
}
