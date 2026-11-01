import { cn } from "@/lib/utils";
import { likelihoodTier } from "@/lib/duplicate-comparison";

export function LikelihoodMeter({
  score,
  title,
  tierLabel,
}: {
  score: number;
  title: string;
  tierLabel: string;
}) {
  const tier = likelihoodTier(score);
  const ringColor =
    tier === "high" ? "#FF6B8A" : tier === "medium" ? "#FFB347" : "#EFD000";
  const textColor =
    tier === "high"
      ? "text-rose-600 dark:text-[#FF6B8A]"
      : tier === "medium"
        ? "text-amber-600 dark:text-[#FFB347]"
        : "text-yellow-600 dark:text-[#C9B400]";

  const r = 15.5;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, score)) / 100);

  return (
    <div data-tier={tier} className="flex items-center gap-2">
      <div className="relative w-9 h-9">
        <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
          <circle cx="18" cy="18" r={r} fill="none" stroke="var(--card-border)" strokeWidth="3.5" />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
          />
        </svg>
        <span className={cn("absolute inset-0 flex items-center justify-center text-[11px] font-extrabold", textColor)}>
          {score}%
        </span>
      </div>
      {title && <span className="text-[11px] text-[var(--foreground-subtle)]">{title}</span>}
      <span className={cn("text-xs font-bold", textColor)}>{tierLabel}</span>
    </div>
  );
}
