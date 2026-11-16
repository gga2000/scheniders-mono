import { Loader2 } from "lucide-react";
import { NumberCell, NumberStrip } from "@/components/shared/number-strip";

export default function BillingLoading() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-44 rounded-lg bg-foreground/5 animate-pulse" />
        <div className="h-4 w-72 rounded bg-foreground/5 animate-pulse" />
      </div>
      <NumberStrip columns={4} label="Wallet numbers">
        {["In wallets, now", "Charged, all time", "Added, all time", "Wallets under their alert amount, now"].map((label) => (
          <NumberCell key={label} label={label} value="..." />
        ))}
      </NumberStrip>
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
