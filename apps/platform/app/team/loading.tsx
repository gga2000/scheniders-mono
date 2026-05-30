import { Skeleton } from "@scheniders/ui/skeletons";

export default function Loading() {
    return (
        <div className="min-h-screen p-6 max-w-7xl mx-auto space-y-8 pb-24">
            {/* Header skeleton */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Skeleton className="w-14 h-14 rounded-2xl" />
                    <div className="space-y-2">
                        <Skeleton className="h-7 w-40 rounded-lg" />
                        <Skeleton className="h-4 w-56 rounded-lg" />
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Skeleton className="h-12 w-12 rounded-2xl" />
                    <Skeleton className="h-12 w-64 rounded-2xl" />
                </div>
            </div>

            {/* Tabs skeleton */}
            <div className="flex justify-center">
                <Skeleton className="h-12 w-[520px] max-w-full rounded-2xl" />
            </div>

            {/* Hero stats row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div
                        key={i}
                        className="bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-5 space-y-3"
                    >
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-9 w-9 rounded-xl" />
                            <Skeleton className="h-4 w-10 rounded" />
                        </div>
                        <Skeleton className="h-8 w-20 rounded" />
                        <Skeleton className="h-3 w-24 rounded" />
                    </div>
                ))}
            </div>

            {/* Podium skeleton */}
            <div className="bg-[var(--card-bg)] rounded-3xl border border-[var(--card-border)] p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Skeleton className="w-10 h-10 rounded-xl" />
                    <Skeleton className="h-6 w-48 rounded" />
                </div>
                <div className="flex items-stretch justify-center gap-4 py-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="flex-1 max-w-[200px] h-44 rounded-3xl" />
                    ))}
                </div>
            </div>

            {/* Main grid skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-6 w-48 rounded" />
                        <Skeleton className="h-9 w-32 rounded-xl" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-48 rounded-2xl" />
                        ))}
                    </div>
                </div>
                <div className="lg:col-span-1">
                    <Skeleton className="h-[640px] rounded-2xl" />
                </div>
            </div>
        </div>
    );
}
