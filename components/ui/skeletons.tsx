"use client";

import { cn } from "@/lib/utils";
import { CSSProperties } from "react";

interface SkeletonProps {
    className?: string;
    style?: CSSProperties;
}

// Generic skeleton base
export function Skeleton({ className, style }: SkeletonProps) {
    return (
        <div
            className={cn(
                "animate-pulse rounded-md bg-[var(--card-border)]",
                className
            )}
            style={style}
        />
    );
}

// Stat cards skeleton (for dashboard/analytics)
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-6 space-y-3"
                >
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-8 w-8 rounded-lg" />
                    </div>
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-3 w-24" />
                </div>
            ))}
        </div>
    );
}

// Chart skeleton
export function ChartSkeleton({ height = "h-64" }: { height?: string }) {
    return (
        <div className={cn("bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-6", height)}>
            <div className="flex items-center justify-between mb-4">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
            <div className="flex items-end justify-between gap-2 h-[calc(100%-60px)]">
                {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton
                        key={i}
                        className="flex-1"
                        style={{
                            // Deterministic "random" height based on index to prevent hydration mismatch
                            height: `${((Math.sin(i) + 1) * 30) + 20}%`
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

// Table skeleton
export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
    return (
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-4 p-4 border-b border-[var(--card-border)] bg-[var(--background)]">
                {Array.from({ length: cols }).map((_, i) => (
                    <Skeleton key={i} className="h-4 flex-1" />
                ))}
            </div>
            {/* Rows */}
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <div
                    key={rowIndex}
                    className="flex items-center gap-4 p-4 border-b border-[var(--card-border)] last:border-0"
                >
                    {Array.from({ length: cols }).map((_, colIndex) => (
                        <Skeleton
                            key={colIndex}
                            className={cn(
                                "h-4 flex-1",
                                colIndex === 0 && "w-8 flex-none rounded-full"
                            )}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

// Customer card skeleton
export function CustomerCardSkeleton({ count = 3 }: { count?: number }) {
    return (
        <div className="space-y-3">
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-4 flex items-center gap-4"
                >
                    <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-24" />
                    </div>
                    <div className="text-right space-y-2">
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-4 w-16" />
                    </div>
                </div>
            ))}
        </div>
    );
}

// Modal skeleton
export function ModalSkeleton() {
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] w-full max-w-lg mx-4 p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                </div>
                <div className="space-y-3">
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                    <Skeleton className="h-10 w-24 rounded-xl" />
                    <Skeleton className="h-10 w-24 rounded-xl" />
                </div>
            </div>
        </div>
    );
}

// Navigation skeleton (sidebar items)
export function NavSkeleton({ count = 6 }: { count?: number }) {
    return (
        <div className="space-y-2 p-4">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
                    <Skeleton className="w-5 h-5 rounded" />
                    <Skeleton className="h-4 flex-1" />
                </div>
            ))}
        </div>
    );
}

// Page loading skeleton
export function PageSkeleton() {
    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex gap-3">
                    <Skeleton className="h-10 w-28 rounded-xl" />
                    <Skeleton className="h-10 w-28 rounded-xl" />
                </div>
            </div>

            {/* Stats */}
            <StatCardsSkeleton />

            {/* Content */}
            <div className="grid lg:grid-cols-2 gap-6">
                <ChartSkeleton />
                <ChartSkeleton />
            </div>
        </div>
    );
}

// Inline loading dots
export function LoadingDots() {
    return (
        <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </span>
    );
}
