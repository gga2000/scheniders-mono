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
