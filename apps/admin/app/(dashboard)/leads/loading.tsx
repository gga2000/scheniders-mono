export default function LeadsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-56 bg-[var(--card-bg)] rounded-xl" />
          <div className="h-4 w-32 bg-[var(--card-bg)] rounded-lg mt-2" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-24 bg-[var(--card-bg)] rounded-xl" />
          <div className="h-10 w-32 bg-[var(--card-bg)] rounded-xl" />
        </div>
      </div>

      {/* Filter bar skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 w-24 bg-[var(--card-bg)] rounded-full" />
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-6 py-4 border-b border-[var(--card-border)] last:border-0"
          >
            <div className="h-4 w-4 bg-zinc-200 dark:bg-zinc-700 rounded" />
            <div className="h-10 w-10 bg-zinc-200 dark:bg-zinc-700 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 bg-zinc-200 dark:bg-zinc-700 rounded" />
              <div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
            </div>
            <div className="h-6 w-16 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
            <div className="h-6 w-12 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
            <div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-700 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
