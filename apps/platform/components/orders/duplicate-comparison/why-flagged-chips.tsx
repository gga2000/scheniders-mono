import { cn } from "@/lib/utils";
import type { DuplicateSignal, SignalKey } from "@/lib/duplicate-comparison";

export function WhyFlaggedChips({
  signals,
  label,
  chipLabel,
}: {
  signals: DuplicateSignal[];
  label: string;
  chipLabel: (key: SignalKey) => string;
}) {
  if (signals.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-[var(--foreground-subtle)]">{label}:</span>
      {signals.map((s) => (
        <span
          key={s.key}
          className={cn(
            "text-[11px] font-bold px-2 py-0.5 rounded-lg border",
            s.danger
              ? "bg-rose-50 border-rose-200 text-rose-600 dark:bg-[rgba(255,107,138,0.08)] dark:border-[rgba(255,107,138,0.3)] dark:text-[#FF8899]"
              : "bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--foreground-muted)] dark:bg-[#2A2A2A] dark:border-[#3F3F3F]",
          )}
        >
          {chipLabel(s.key)}
        </span>
      ))}
    </div>
  );
}
