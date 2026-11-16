import { Loader2 } from "lucide-react";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";

export default function HealthLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-40 rounded-lg bg-foreground/5 animate-pulse" />
      </div>
      <div className="h-12 rounded-xl bg-foreground/5 animate-pulse" />
      <NumberStrip columns={4} label="Shop health numbers">
        {["Active shops, now", "Orders, last 24 hours", "Shops at risk, now", "New shops, this month"].map((label) => (
          <NumberCell key={label} label={label} value="..." />
        ))}
      </NumberStrip>
      <div className="pastel-card p-6 h-64 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-foreground/20" />
      </div>
    </div>
  );
}
