"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import type { HeatmapCell } from "@/types/dashboard";

interface PeakHoursProps {
  cells: HeatmapCell[] | undefined;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Map from 0=Sun to Mon-first order
const DAY_REORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon=1,Tue=2,...,Sun=0
const DAY_FULL_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const HOUR_LABELS = [0, 3, 6, 9, 12, 15, 18, 21];

function getCellColor(intensity: number): string {
  if (intensity <= 0) return "var(--card-bg, #ffffff)";
  if (intensity < 0.25) return "var(--pastel-yellow-light, #FEF3C7)";
  if (intensity < 0.55) return "var(--pastel-yellow, #FBE38E)";
  return "#d97706"; // amber-600
}

function Skeleton() {
  return (
    <div className="mt-4 space-y-1">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex gap-1">
          <div className="w-8 h-5 rounded bg-gray-200/30 animate-pulse" />
          {Array.from({ length: 12 }).map((_, j) => (
            <div
              key={j}
              className="w-5 h-5 rounded-sm bg-gray-200/40 animate-pulse"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PeakHours({ cells }: PeakHoursProps) {
  const [tooltip, setTooltip] = useState<{
    day: number;
    hour: number;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  // Build lookup: [dayOfWeek][hour] → cell
  const lookup = new Map<string, HeatmapCell>();
  if (cells) {
    for (const cell of cells) {
      lookup.set(`${cell.dayOfWeek}-${cell.hour}`, cell);
    }
  }

  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)]/40 flex items-center justify-center">
          <Clock className="w-4 h-4 text-amber-700" />
        </div>
        <h3 className="font-bold text-foreground text-sm">Peak Hours</h3>
      </div>

      {!cells ? (
        <Skeleton />
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <div className="min-w-[480px] relative">
            {/* Hour labels */}
            <div className="flex ml-9 mb-1">
              {Array.from({ length: 24 }).map((_, h) => (
                <div
                  key={h}
                  className="flex-1 text-center text-[9px] text-foreground/40 font-medium"
                >
                  {HOUR_LABELS.includes(h) ? h : ""}
                </div>
              ))}
            </div>

            {/* Grid rows */}
            {DAY_REORDER.map((dow, rowIdx) => (
              <div key={dow} className="flex items-center gap-1 mb-[2px]">
                <span className="w-8 text-[10px] text-foreground/60 font-medium text-right pr-1 flex-shrink-0">
                  {DAY_LABELS[rowIdx]}
                </span>
                {Array.from({ length: 24 }).map((_, h) => {
                  const cell = lookup.get(`${dow}-${h}`);
                  const intensity = cell?.intensity ?? 0;
                  const count = cell?.count ?? 0;
                  return (
                    <div
                      key={h}
                      className="flex-1 aspect-square rounded-[3px] cursor-pointer transition-transform hover:scale-125 hover:z-10 relative"
                      style={{ backgroundColor: getCellColor(intensity) }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({
                          day: dow,
                          hour: h,
                          count,
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
            ))}

            {/* Tooltip */}
            {tooltip && (
              <div
                className="fixed z-50 pointer-events-none bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg px-3 py-1.5 text-xs font-medium text-foreground"
                style={{
                  left: tooltip.x,
                  top: tooltip.y - 36,
                  transform: "translateX(-50%)",
                }}
              >
                {DAY_FULL_NAMES[tooltip.day]} {tooltip.hour}:00 &mdash;{" "}
                {tooltip.count} orders
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
