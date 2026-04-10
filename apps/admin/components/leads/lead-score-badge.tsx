"use client";

import { cn } from "@/lib/utils";

interface LeadScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function LeadScoreBadge({ score, size = "md", showLabel = false }: LeadScoreBadgeProps) {
  const getColor = () => {
    if (score >= 80) return "#34D399";
    if (score >= 60) return "#60A5FA";
    if (score >= 40) return "#FBBF24";
    if (score >= 20) return "#F97316";
    return "#EF4444";
  };

  const dimensions = {
    sm: { size: 32, stroke: 3, fontSize: "text-[10px]" },
    md: { size: 44, stroke: 3.5, fontSize: "text-xs" },
    lg: { size: 64, stroke: 4, fontSize: "text-base" },
  };

  const d = dimensions[size];
  const radius = (d.size - d.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getColor();

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: d.size, height: d.size }}>
        <svg width={d.size} height={d.size} className="-rotate-90">
          <circle
            cx={d.size / 2}
            cy={d.size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={d.stroke}
            className="text-zinc-200 dark:text-zinc-700"
          />
          <circle
            cx={d.size / 2}
            cy={d.size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={d.stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center font-bold",
            d.fontSize
          )}
          style={{ color }}
        >
          {score}
        </span>
      </div>
      {showLabel && (
        <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-medium">Score</span>
      )}
    </div>
  );
}
