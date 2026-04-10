"use client";

interface MiniTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  formatValue?: (value: number) => string;
}

const defaultFormat = (n: number) =>
  new Intl.NumberFormat("en-IQ").format(Math.round(n));

export function MiniTooltip({
  active,
  payload,
  label,
  formatValue = defaultFormat,
}: MiniTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl px-3 py-2 shadow-lg text-xs">
      {label && (
        <p className="font-semibold text-foreground mb-1">{label}</p>
      )}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-foreground/60">{entry.name}:</span>
          <span className="font-semibold text-foreground">
            {formatValue(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
