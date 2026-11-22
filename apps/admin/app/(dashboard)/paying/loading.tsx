import { NumberCell, NumberStrip } from "@/components/shared/number-strip";

export default function PayingShopsLoading() {
  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="space-y-2">
        <div className="h-8 w-44 rounded-lg bg-foreground/5 animate-pulse" />
        <div className="h-4 w-96 max-w-full rounded bg-foreground/5 animate-pulse" />
      </div>
      <NumberStrip columns={3} label="Paying numbers">
        {["Paying, now", "Goal for the end of Dec 2026", "Goal for the end of Jan 2027"].map((label) => (
          <NumberCell key={label} label={label} value="..." />
        ))}
      </NumberStrip>
      <div className="pastel-card h-48 animate-pulse" />
      <div className="pastel-card p-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
