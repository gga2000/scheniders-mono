"use client";

/**
 * View-specific skeleton loaders for the QC Quarantine workspace.
 * Each skeleton mirrors the layout of its real counterpart (KPI header,
 * table, card grid, kanban) so the swap-in when data arrives is seamless.
 */

function Shimmer({ className = "" }: { className?: string }) {
    return (
        <div
            className={`bg-[var(--background)]/60 rounded animate-pulse ${className}`}
        />
    );
}

export function QCKpiSkeleton() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
                <div
                    key={i}
                    className="relative bg-[var(--card-bg)] border border-[var(--card-border)] shadow-[var(--card-shadow)] rounded-2xl p-4 overflow-hidden"
                >
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <Shimmer className="w-9 h-9 rounded-xl" />
                        <Shimmer className="w-20 h-6 rounded" />
                    </div>
                    <Shimmer className="h-3 w-24 rounded mt-2" />
                    <Shimmer className="h-7 w-20 rounded mt-2" />
                    <Shimmer className="h-3 w-28 rounded mt-2" />
                </div>
            ))}
        </div>
    );
}

export function QCTableSkeleton({ rows = 8 }: { rows?: number }) {
    return (
        <div className="bg-[var(--card-bg)] shadow-[var(--card-shadow)] rounded-2xl overflow-hidden border border-[var(--card-border)]">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-[var(--card-border)] bg-[var(--background)]/60">
                            <th className="p-3 w-10">
                                <Shimmer className="w-4 h-4 rounded" />
                            </th>
                            {Array.from({ length: 9 }).map((_, i) => (
                                <th key={i} className="p-3">
                                    <Shimmer className="h-3 w-16 rounded" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--card-border)]">
                        {Array.from({ length: rows }).map((_, i) => (
                            <tr key={i}>
                                <td className="p-3">
                                    <Shimmer className="w-4 h-4 rounded" />
                                </td>
                                <td className="p-3">
                                    <div className="flex items-center gap-3">
                                        <Shimmer className="w-10 h-10 rounded-lg" />
                                        <div className="space-y-1.5">
                                            <Shimmer className="h-3 w-36 rounded" />
                                            <Shimmer className="h-2.5 w-20 rounded" />
                                        </div>
                                    </div>
                                </td>
                                <td className="p-3">
                                    <div className="space-y-1.5">
                                        <Shimmer className="h-4 w-24 rounded-md" />
                                        <Shimmer className="h-2.5 w-32 rounded" />
                                    </div>
                                </td>
                                <td className="p-3">
                                    <Shimmer className="h-3 w-8 rounded" />
                                </td>
                                <td className="p-3">
                                    <Shimmer className="h-3 w-16 rounded" />
                                </td>
                                <td className="p-3">
                                    <Shimmer className="h-5 w-16 rounded-md" />
                                </td>
                                <td className="p-3">
                                    <Shimmer className="h-5 w-20 rounded-md" />
                                </td>
                                <td className="p-3">
                                    <Shimmer className="h-3 w-14 rounded" />
                                </td>
                                <td className="p-3">
                                    <Shimmer className="h-3 w-20 rounded" />
                                </td>
                                <td className="p-3">
                                    <div className="flex justify-end gap-1">
                                        <Shimmer className="w-7 h-7 rounded-lg" />
                                        <Shimmer className="w-7 h-7 rounded-lg" />
                                        <Shimmer className="w-7 h-7 rounded-lg" />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function QCCardGridSkeleton({ count = 8 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: count }).map((_, i) => (
                <div
                    key={i}
                    className="relative bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-[var(--card-shadow)]"
                >
                    <div className="aspect-[4/3] bg-[var(--background)]/60 animate-pulse" />
                    <div className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <Shimmer className="h-3.5 w-3/4 rounded" />
                                <Shimmer className="h-2.5 w-1/3 rounded" />
                            </div>
                            <Shimmer className="h-5 w-16 rounded-md" />
                        </div>
                        <div className="flex items-center justify-between">
                            <Shimmer className="h-4 w-20 rounded" />
                            <Shimmer className="h-3 w-24 rounded" />
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-[var(--card-border)]">
                            <div className="space-y-1">
                                <Shimmer className="h-2 w-16 rounded" />
                                <Shimmer className="h-4 w-20 rounded" />
                            </div>
                            <Shimmer className="w-4 h-4 rounded" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function QCKanbanSkeleton() {
    const columnCardCounts = [3, 2, 3, 2, 2];
    return (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2 snap-x">
            {columnCardCounts.map((cards, colIdx) => (
                <div key={colIdx} className="flex-1 min-w-[260px] snap-start">
                    <div className="rounded-2xl p-3 h-full bg-[var(--background)]/50 border border-[var(--card-border)]">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Shimmer className="w-2 h-2 rounded-full" />
                                <Shimmer className="h-3.5 w-20 rounded" />
                                <Shimmer className="h-5 w-6 rounded-md" />
                            </div>
                        </div>
                        <Shimmer className="h-3 w-32 rounded mb-3" />
                        <div className="space-y-2 min-h-[100px]">
                            {Array.from({ length: cards }).map((_, i) => (
                                <div
                                    key={i}
                                    className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-2.5 shadow-sm"
                                >
                                    <div className="flex items-start gap-2">
                                        <Shimmer className="w-10 h-10 rounded-lg" />
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <Shimmer className="h-3 w-full rounded" />
                                            <div className="flex items-center gap-1">
                                                <Shimmer className="h-4 w-16 rounded" />
                                                <Shimmer className="h-4 w-12 rounded" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--card-border)]">
                                        <Shimmer className="h-3 w-16 rounded" />
                                        <Shimmer className="h-3 w-8 rounded" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
