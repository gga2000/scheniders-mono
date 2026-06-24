import { cn } from "@/lib/utils";
import { formatIQD } from "@/lib/utils";
import type { CustomerStats } from "@/lib/duplicate-comparison";

interface IntelLabels {
  repeat: string;
  totalOrders: string;
  totalSpent: string;
  cancelRate: string;
  lastOrder: string;
}

export function CustomerIntelStrip({
  stats,
  isRepeat,
  lastOrderRelative,
  labels,
}: {
  stats: CustomerStats;
  isRepeat: boolean;
  lastOrderRelative: string;
  labels: IntelLabels;
}) {
  if (stats.totalOrders === 0) return null;
  const pct = Math.round(stats.cancelRate * 100);

  return (
    <div
      className={cn(
        "flex gap-2 flex-wrap items-center px-5 py-2.5 border-b",
        "bg-[var(--background-soft)] border-[var(--card-border)]",
        "dark:bg-[#1E1E1E] dark:border-[#3F3F3F]",
      )}
    >
      {isRepeat && (
        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 dark:bg-[rgba(0,255,100,0.06)] dark:border-[rgba(0,255,100,0.2)] dark:text-[#66FFAA]">
          <span aria-hidden="true">★ </span>
          <span>{labels.repeat}</span>
        </span>
      )}
      <Stat label={labels.totalOrders} value={String(stats.totalOrders)} />
      <Stat label={labels.totalSpent} value={formatIQD(stats.totalSpent)} />
      <Stat label={labels.cancelRate} value={`${pct}%`} />
      {lastOrderRelative && <Stat label={labels.lastOrder} value={lastOrderRelative} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[11.5px] px-2.5 py-1 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground-muted)] dark:bg-[#2A2A2A] dark:border-[#3F3F3F]">
      {label}: <b className="text-[var(--foreground)]">{value}</b>
    </span>
  );
}
