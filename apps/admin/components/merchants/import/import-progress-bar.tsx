/** A thin bar for how much of a run is done. */
export function ImportProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const share = total > 0 ? Math.min(100, (100 * done) / total) : 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className="h-2 w-full overflow-hidden rounded-full bg-foreground/[0.08]"
    >
      <div className="h-full rounded-full bg-[var(--ink-blue)] transition-[width]" style={{ width: `${share}%` }} />
    </div>
  );
}
