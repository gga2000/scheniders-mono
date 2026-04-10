export default function TrialsLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-44 rounded-lg bg-foreground/5 animate-pulse" />
        <div className="h-4 w-32 rounded bg-foreground/5 animate-pulse" />
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="pastel-card p-4 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-foreground/5 animate-pulse" />
            <div className="h-3 w-20 rounded bg-foreground/5 animate-pulse" />
            <div className="h-8 w-16 rounded bg-foreground/5 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="pastel-card p-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 border-b border-[var(--card-border)] last:border-0">
            <div className="space-y-1.5 flex-1">
              <div className="h-4 w-32 rounded bg-foreground/5 animate-pulse" />
              <div className="h-3 w-20 rounded bg-foreground/5 animate-pulse" />
            </div>
            <div className="h-3 w-48 rounded-full bg-foreground/5 animate-pulse" />
            <div className="h-8 w-20 rounded-xl bg-foreground/5 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
