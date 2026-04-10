import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-lg bg-foreground/5 animate-pulse" />
        <div className="h-4 w-64 rounded bg-foreground/5 animate-pulse" />
      </div>
      {/* Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="pastel-card p-6 space-y-3">
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-2xl bg-foreground/5 animate-pulse" />
              <div className="h-5 w-16 rounded-full bg-foreground/5 animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-foreground/5 animate-pulse" />
              <div className="h-10 w-20 rounded bg-foreground/5 animate-pulse" />
              <div className="h-3 w-32 rounded bg-foreground/5 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
      {/* Chart skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="pastel-card p-6 h-80 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-foreground/20" />
        </div>
        <div className="pastel-card p-6 h-80 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-foreground/20" />
        </div>
      </div>
    </div>
  );
}
