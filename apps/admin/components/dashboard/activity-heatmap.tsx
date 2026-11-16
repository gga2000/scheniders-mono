"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { ActivityDay } from "@/types/dashboard";

interface ActivityHeatmapProps {
  days: ActivityDay[] | undefined;
}

interface TooltipState {
  x: number;
  y: number;
  date: string;
  count: number;
}

const CELL_SIZE = 12;
const MIN_WIDTH = 640;
const GAP = 2;
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function getColorLevel(count: number, max: number): string {
  if (count === 0) return "var(--card-border, #e5e7eb)";
  const ratio = count / max;
  if (ratio <= 0.25) return "#bbf7d0"; // pastel-green-light
  if (ratio <= 0.5) return "var(--pastel-green, #86efac)";
  if (ratio <= 0.75) return "#4ade80";
  return "#16a34a";
}

function SkeletonContent() {
  return (
    <div className="animate-pulse">
      <div className="h-[100px] w-full rounded-xl bg-foreground/[0.06]" />
    </div>
  );
}

export function ActivityHeatmap({ days }: ActivityHeatmapProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const { grid, weeks, maxCount, monthLabels } = useMemo(() => {
    if (!days || days.length === 0) {
      return { grid: [], weeks: 0, maxCount: 0, monthLabels: [] as { label: string; col: number }[] };
    }

    // Build a map of date -> count
    const countMap = new Map<string, number>();
    for (const d of days) {
      countMap.set(d.date, d.count);
    }

    // Sort dates and figure out range. Every date is a calendar day, so all
    // the math runs in UTC: read at local midnight, toISOString() gave the
    // day before in Baghdad, so each cell showed yesterday's count and
    // today's was never drawn.
    const sortedDates = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const startDate = new Date(sortedDates[0].date + "T00:00:00Z");
    const endDate = new Date(sortedDates[sortedDates.length - 1].date + "T00:00:00Z");

    // Align start to Sunday
    const alignedStart = new Date(startDate);
    alignedStart.setUTCDate(alignedStart.getUTCDate() - alignedStart.getUTCDay());

    // Build grid cells
    const cells: Array<{
      date: string;
      count: number;
      col: number;
      row: number;
    }> = [];

    let mMax = 0;
    const current = new Date(alignedStart);
    const mLabels: { label: string; col: number }[] = [];
    let lastMonth = -1;

    while (current <= endDate) {
      const dateStr = current.toISOString().slice(0, 10);
      const dayOfWeek = current.getUTCDay(); // row
      const diffDays = Math.floor(
        (current.getTime() - alignedStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      const col = Math.floor(diffDays / 7);

      const count = countMap.get(dateStr) ?? 0;
      if (count > mMax) mMax = count;

      // Track month boundaries
      const month = current.getUTCMonth();
      if (month !== lastMonth) {
        mLabels.push({ label: MONTH_NAMES[month], col });
        lastMonth = month;
      }

      cells.push({ date: dateStr, count, col, row: dayOfWeek });
      current.setUTCDate(current.getUTCDate() + 1);
    }

    const totalWeeks = cells.length > 0 ? cells[cells.length - 1].col + 1 : 0;

    return {
      grid: cells,
      weeks: totalWeeks,
      maxCount: mMax,
      monthLabels: mLabels,
    };
  }, [days]);

  // The year scales to the tile's width; below MIN_WIDTH it scrolls, and it
  // opens on the newest week rather than hiding it off the right edge.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  const labelWidth = 34;
  const headerHeight = 20;
  const svgWidth = labelWidth + weeks * (CELL_SIZE + GAP);
  const svgHeight = headerHeight + 7 * (CELL_SIZE + GAP);

  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--pastel-green)]/40 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-[var(--ink-green)]" />
          </div>
          <h3 className="font-bold text-foreground text-sm">Platform Activity, last 12 months</h3>
        </div>
        {/* Color scale legend */}
        <div className="flex items-center gap-1 text-xs text-foreground/70">
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <span
              key={ratio}
              className="inline-block rounded-sm"
              style={{
                width: 10,
                height: 10,
                backgroundColor: getColorLevel(
                  ratio * (maxCount || 1),
                  maxCount || 1
                ),
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      {!days ? (
        <SkeletonContent />
      ) : days.length === 0 ? (
        <p className="text-sm text-foreground/70 py-6 text-center">
          No activity data yet.
        </p>
      ) : (
        <div ref={scrollRef} className="overflow-x-auto -mx-2 px-2 relative">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            width="100%"
            className="block"
            style={{ minWidth: MIN_WIDTH }}
          >
            {/* Month labels */}
            {monthLabels.map((m, i) => (
              <text
                key={i}
                x={labelWidth + m.col * (CELL_SIZE + GAP)}
                y={14}
                className="fill-[var(--foreground)]"
                style={{ fontSize: 13, opacity: 0.5 }}
              >
                {m.label}
              </text>
            ))}

            {/* Day labels */}
            {DAY_LABELS.map((label, i) =>
              label ? (
                <text
                  key={i}
                  x={0}
                  y={headerHeight + i * (CELL_SIZE + GAP) + CELL_SIZE - 2}
                  className="fill-[var(--foreground)]"
                  style={{ fontSize: 13, opacity: 0.4 }}
                >
                  {label}
                </text>
              ) : null
            )}

            {/* Cells */}
            {grid.map((cell) => (
              <rect
                key={cell.date}
                x={labelWidth + cell.col * (CELL_SIZE + GAP)}
                y={headerHeight + cell.row * (CELL_SIZE + GAP)}
                width={CELL_SIZE}
                height={CELL_SIZE}
                rx={2}
                fill={getColorLevel(cell.count, maxCount)}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onMouseEnter={(e) => {
                  const rect = (e.target as SVGRectElement).getBoundingClientRect();
                  setTooltip({
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    date: cell.date,
                    count: cell.count,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="fixed z-50 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-xl px-2.5 py-1.5 text-xs pointer-events-none"
              style={{
                left: tooltip.x,
                top: tooltip.y - 36,
                transform: "translateX(-50%)",
              }}
            >
              <span className="font-semibold text-foreground">
                {tooltip.count} {tooltip.count === 1 ? "action" : "actions"}
              </span>
              <span className="text-foreground/70 ml-1.5">{tooltip.date}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
