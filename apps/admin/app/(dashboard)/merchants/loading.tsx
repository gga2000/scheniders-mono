export default function MerchantsLoading() {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-36 rounded-lg bg-foreground/5 animate-pulse" />
          <div className="h-4 w-24 rounded bg-foreground/5 animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-20 rounded-xl bg-foreground/5 animate-pulse" />
          <div className="h-8 w-16 rounded-xl bg-foreground/5 animate-pulse" />
        </div>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-28 rounded-xl bg-foreground/5 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="pastel-card p-5 space-y-3">
            <div className="flex justify-between">
              <div className="w-4 h-4 rounded bg-foreground/5 animate-pulse" />
              <div className="h-5 w-16 rounded-full bg-foreground/5 animate-pulse" />
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-foreground/5 animate-pulse" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-28 rounded bg-foreground/5 animate-pulse" />
                <div className="h-3 w-20 rounded bg-foreground/5 animate-pulse" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="h-4 w-20 rounded bg-foreground/5 animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
