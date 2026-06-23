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

  return (
    <div
      data-tier={tier}
      className={cn(
        "flex items-center gap-2.5 rounded-full px-3 py-1.5",
        "bg-[var(--card-bg)] border border-[var(--card-border)]",
        "dark:bg-[#2A2A2A] dark:border-[#3F3F3F]",
      )}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center"
        style={{ background: `conic-gradient(${ringColor} ${score}%, #e5e5e5 0)` }}
      >
        <span
          className={cn(
            "w-6 h-6 rounded-full bg-[var(--card-bg)] dark:bg-[#2A2A2A] flex items-center justify-center text-[10px] font-extrabold",
            textColor,
          )}
        >
          {score}%
        </span>
      </div>
      <div className="leading-tight">
        <div className="text-[10px] text-[var(--foreground-subtle)]">{title}</div>
        <div className={cn("text-xs font-bold", textColor)}>{tierLabel}</div>
      </div>
    </div>
  );
}
