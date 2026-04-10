import { Loader2 } from "lucide-react";

export default function BillingLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-44 rounded-lg bg-foreground/5 animate-pulse" />
        <div className="h-4 w-72 rounded bg-foreground/5 animate-pulse" />
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="pastel-card p-4 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-foreground/5 animate-pulse" />
            <div className="h-3 w-20 rounded bg-foreground/5 animate-pulse" />
            <div className="h-8 w-28 rounded bg-foreground/5 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="pastel-card p-6 h-96 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-foreground/20" />
        </div>
        <div className="pastel-card p-6 h-96 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-foreground/20" />
        </div>
      </div>
    </div>
  );
}
