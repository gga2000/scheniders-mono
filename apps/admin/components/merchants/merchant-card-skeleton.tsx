"use client";

import { cn } from "@/lib/utils";

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded bg-foreground/[0.06] animate-pulse",
        className
      )}
    />
  );
}

export function MerchantCardSkeleton() {
  return (
    <div role="status" aria-label="Loading merchant card" className="pastel-card p-5 space-y-4">
      {/* Top utility row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Shimmer className="w-4 h-4 rounded" />
          <Shimmer className="w-3.5 h-3.5 rounded" />
          <Shimmer className="w-10 h-4 rounded-full" />
        </div>
        <Shimmer className="w-16 h-5 rounded-full" />
      </div>

      {/* Brand identity */}
      <div className="flex items-center gap-3.5">
        <Shimmer className="w-12 h-12 rounded-2xl" />
        <div className="flex-1 space-y-1.5">
          <Shimmer className="w-32 h-4" />
          <Shimmer className="w-20 h-3" />
        </div>
        <Shimmer className="w-16 h-5 rounded-full" />
      </div>

      {/* Hero stats: paired Balance + Revenue */}
      <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-foreground/[0.025] border border-foreground/[0.05]">
        <div className="space-y-1.5">
          <Shimmer className="w-12 h-2" />
          <Shimmer className="w-20 h-5" />
          <Shimmer className="w-14 h-2" />
        </div>
        <div className="space-y-1.5 border-l border-foreground/[0.08] pl-3">
          <Shimmer className="w-12 h-2" />
          <Shimmer className="w-20 h-5" />
          <Shimmer className="w-16 h-2" />
        </div>
      </div>

      {/* Footer: action toolbar */}
      <div className="pt-3 border-t border-[var(--card-border)] flex items-center gap-1">
        <Shimmer className="flex-1 h-8 rounded-xl" />
        <Shimmer className="w-8 h-8 rounded-xl" />
        <Shimmer className="w-8 h-8 rounded-xl" />
        <Shimmer className="w-8 h-8 rounded-xl" />
        <Shimmer className="w-8 h-8 rounded-xl" />
      </div>
    </div>
  );
}

export function MerchantCardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <MerchantCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function MerchantTableRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--card-border)]">
      <Shimmer className="w-4 h-4 rounded" />
      <Shimmer className="w-6 h-6 rounded-full" />
      <Shimmer className="w-32 h-4 flex-1" />
      <Shimmer className="w-14 h-5 rounded-full" />
      <Shimmer className="w-14 h-5 rounded-full" />
      <Shimmer className="w-20 h-4" />
      <Shimmer className="w-20 h-4" />
      <Shimmer className="w-16 h-4" />
      <Shimmer className="w-16 h-5" />
    </div>
  );
}

export function MerchantTableSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading merchant table" className="pastel-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--card-border)] bg-foreground/[0.02]">
        <Shimmer className="w-4 h-4 rounded" />
        {Array.from({ length: 8 }, (_, i) => (
          <Shimmer key={i} className="w-20 h-3 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: count }, (_, i) => (
        <MerchantTableRowSkeleton key={i} />
      ))}
    </div>
  );
}

export function MerchantDetailSkeleton() {
  return (
    <div role="status" aria-label="Loading merchant details" className="space-y-5 p-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shimmer className="w-12 h-12 rounded-xl" />
        <div className="space-y-1.5 flex-1">
          <Shimmer className="w-40 h-5" />
          <Shimmer className="w-24 h-3" />
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="pastel-card p-3 space-y-2">
            <Shimmer className="w-16 h-3" />
            <Shimmer className="w-20 h-5" />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-[var(--card-border)] pb-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Shimmer key={i} className="w-16 h-4" />
        ))}
      </div>

      {/* Content */}
      <div className="space-y-3">
        <Shimmer className="w-full h-24 rounded-xl" />
        <Shimmer className="w-full h-32 rounded-xl" />
      </div>
    </div>
  );
}
