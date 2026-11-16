import { cn } from "@/lib/utils";

/**
 * The change against the period before, as "+12.5%" or "-96.0%". Renders
 * nothing when there is no earlier number to compare with. Readable in both
 * themes: the light-mode ink is dark, the dark-mode ink is light.
 */
export function DeltaChip({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return null;
  const up = deltaPct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        up
          ? "bg-emerald-600/10 text-[var(--ink-green)] dark:bg-emerald-400/15"
          : "bg-rose-600/10 text-[var(--ink-red)] dark:bg-rose-400/15",
      )}
    >
      {up ? "+" : ""}
      {deltaPct.toFixed(1)}%
    </span>
  );
}
