import { NumberCell, NumberStrip } from "@/components/shared/number-strip";

export default function WeeklyNumbersLoading() {
  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-lg bg-foreground/5 animate-pulse" />
        <div className="h-4 w-96 max-w-full rounded bg-foreground/5 animate-pulse" />
      </div>
      <NumberStrip columns={4} label="This week's numbers">
        {["Trials started", "First order in 72 hours", "Became paying", "Paying shops", "New shops", "Stopped paying", "Trial WhatsApp cost", "Week"].map(
          (label) => (
            <NumberCell key={label} label={label} value="..." />
          ),
        )}
      </NumberStrip>
      <div className="pastel-card p-6 space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2 border-b border-[var(--card-border)] last:border-0">
            <div className="h-4 w-24 rounded bg-foreground/5 animate-pulse" />
            <div className="h-4 flex-1 rounded bg-foreground/5 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
