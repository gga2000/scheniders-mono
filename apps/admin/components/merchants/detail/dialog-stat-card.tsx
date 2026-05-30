"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogStatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  tone: "green" | "amber" | "blue" | "purple" | "rose";
  spark?: number[];
  delta?: { value: number; suffix?: string } | null;
  onClick?: () => void;
  title?: string;
}

const tonePalette = {
  green: {
    bg: "bg-green-50/50 dark:bg-green-400/5 hover:bg-green-50 dark:hover:bg-green-400/10",
    text: "text-green-700 dark:text-green-400",
    stroke: "stroke-green-500/80 dark:stroke-green-400/80",
    fill: "fill-green-500/10",
  },
  amber: {
    bg: "bg-amber-50/50 dark:bg-amber-400/5 hover:bg-amber-50 dark:hover:bg-amber-400/10",
    text: "text-amber-700 dark:text-amber-400",
    stroke: "stroke-amber-500/80 dark:stroke-amber-400/80",
    fill: "fill-amber-500/10",
  },
  blue: {
    bg: "bg-blue-50/50 dark:bg-blue-400/5 hover:bg-blue-50 dark:hover:bg-blue-400/10",
    text: "text-blue-700 dark:text-blue-400",
    stroke: "stroke-blue-500/80 dark:stroke-blue-400/80",
    fill: "fill-blue-500/10",
  },
  purple: {
    bg: "bg-purple-50/50 dark:bg-purple-400/5 hover:bg-purple-50 dark:hover:bg-purple-400/10",
    text: "text-purple-700 dark:text-purple-400",
    stroke: "stroke-purple-500/80 dark:stroke-purple-400/80",
    fill: "fill-purple-500/10",
  },
  rose: {
    bg: "bg-rose-50/50 dark:bg-rose-400/5 hover:bg-rose-50 dark:hover:bg-rose-400/10",
    text: "text-rose-700 dark:text-rose-400",
    stroke: "stroke-rose-500/80 dark:stroke-rose-400/80",
    fill: "fill-rose-500/10",
  },
} as const;

function buildSparklinePath(values: number[], width: number, height: number): {
  line: string;
  area: string;
} | null {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${width.toFixed(2)},${height} L0,${height} Z`;
  return { line, area };
}

export function DialogStatCard({
  icon: Icon,
  label,
  value,
  unit,
  tone,
  spark,
  delta,
  onClick,
  title,
}: DialogStatCardProps) {
  const palette = tonePalette[tone];
  const sparkValues = spark && spark.length > 1 ? spark : null;
  const path = sparkValues ? buildSparklinePath(sparkValues, 60, 18) : null;
  const interactive = !!onClick;

  const deltaPositive = delta && delta.value > 0;
  const deltaNegative = delta && delta.value < 0;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      title={title}
      className={cn(
        "pastel-card group relative overflow-hidden p-3 text-left transition-all duration-200",
        palette.bg,
        interactive
          ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-[var(--card-shadow-hover)]"
          : "cursor-default"
      )}
    >
      <div className={cn("flex items-center gap-1.5 mb-0.5", palette.text)}>
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground tabular-nums truncate">
            {value}
            {unit && (
              <span className="text-[10px] font-normal text-foreground/50 ml-1">{unit}</span>
            )}
          </p>
          {delta && (
            <p
              className={cn(
                "text-[10px] font-semibold mt-0.5 tabular-nums",
                deltaPositive && "text-emerald-600 dark:text-emerald-400",
                deltaNegative && "text-rose-600 dark:text-rose-400",
                !deltaPositive && !deltaNegative && "text-foreground/40"
              )}
            >
              {deltaPositive ? "▲" : deltaNegative ? "▼" : "·"} {Math.abs(delta.value).toFixed(0)}
              {delta.suffix ?? "%"}
            </p>
          )}
        </div>
        {path && (
          <svg
            viewBox="0 0 60 18"
            preserveAspectRatio="none"
            aria-hidden
            className="w-[60px] h-[18px] shrink-0"
          >
            <path d={path.area} className={palette.fill} stroke="none" />
            <path
              d={path.line}
              fill="none"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={palette.stroke}
            />
          </svg>
        )}
      </div>
    </button>
  );
}
