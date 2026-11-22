import { NumberCell, NumberStrip } from "@/components/shared/number-strip";

export default function DeliveredRateLoading() {
  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="space-y-2">
        <div className="h-8 w-44 rounded-lg bg-foreground/5 animate-pulse" />
        <div className="h-4 w-[32rem] max-w-full rounded bg-foreground/5 animate-pulse" />
      </div>
      <NumberStrip columns={3} label="Delivered rate numbers">
        {["Median delivered rate", "Shops flagged", "Shops with 20+ shipped"].map((label) => (
          <NumberCell key={label} label={label} value="..." />
        ))}
      </NumberStrip>
      <div className="pastel-card p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 border-b border-[var(--card-border)] last:border-0">
            <div className="h-4 w-40 rounded bg-foreground/5 animate-pulse" />
            <div className="h-4 w-20 rounded bg-foreground/5 animate-pulse" />
            <div className="h-4 w-24 rounded bg-foreground/5 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
