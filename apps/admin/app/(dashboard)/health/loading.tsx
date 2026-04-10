import { Loader2 } from "lucide-react";

export default function HealthLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-40 rounded-lg bg-foreground/5 animate-pulse" />
      </div>
      <div className="h-12 rounded-xl bg-foreground/5 animate-pulse" />
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="pastel-card p-4 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-foreground/5 animate-pulse" />
            <div className="h-3 w-20 rounded bg-foreground/5 animate-pulse" />
            <div className="h-8 w-16 rounded bg-foreground/5 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="pastel-card p-6 h-64 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-foreground/20" />
      </div>
    </div>
  );
}
