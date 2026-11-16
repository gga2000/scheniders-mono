import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const COLUMNS = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  6: "grid-cols-6",
} as const;

/**
 * A page's headline numbers in one white surface, split by thin lines
 * (board v6: one surface, no tinted or gradient tiles). The Today desk set
 * the pattern; every page with a row of numbers uses it. More cells than
 * columns wrap to a second row, still split by the same lines.
 */
export function NumberStrip({
  columns,
  label,
  children,
}: {
  columns: keyof typeof COLUMNS;
  /** Names the group for screen readers, e.g. "Wallet numbers". */
  label?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="pastel-card overflow-hidden">
      {/* The 1 px gaps show the line colour between the cells. */}
      <div className={cn("grid gap-px bg-[var(--card-border)]", COLUMNS[columns])}>{children}</div>
    </section>
  );
}

/**
 * One number with its label, which names the window ("Charged, all time").
 * Pass "..." as the value while it loads, never a zero. `alert` turns the
 * number red when it asks for action (a count above zero of wallets running
 * out, say); every other number stays in plain ink.
 */
export function NumberCell({
  label,
  value,
  note,
  alert = false,
  children,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  alert?: boolean;
  /** Extra content under the number, such as a sparkline. */
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 bg-[var(--card-bg)] px-5 py-4">
      <p className="text-xs text-foreground/70">{label}</p>
      <p
        className={cn(
          "mt-1 text-[22px] font-semibold tabular-nums",
          alert ? "text-[var(--ink-red)]" : "text-foreground",
        )}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-xs text-foreground/70">{note}</p>}
      {children}
    </div>
  );
}
