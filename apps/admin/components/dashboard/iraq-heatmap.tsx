"use client";

import { useState, useMemo } from "react";
import { MapPin } from "lucide-react";
import {
  IRAQ_GOVERNORATE_PATHS,
  IRAQ_MAP_WIDTH,
  IRAQ_MAP_HEIGHT,
} from "@scheniders/shared/iraq-map-paths";
import type { GeoStats } from "@/types/dashboard";

interface IraqHeatmapProps {
  geoStats: GeoStats[] | undefined;
}

type ViewMode = "orders" | "revenue";

const ORDER_SCALE = [
  "#f1f5f9",
  "#dbeafe",
  "#bfdbfe",
  "#93c5fd",
  "#60a5fa",
  "#3b82f6",
  "#2563eb",
];
const REVENUE_SCALE = [
  "#f1f5f9",
  "#d1fae5",
  "#a7f3d0",
  "#6ee7b7",
  "#34d399",
  "#10b981",
  "#059669",
];

function getHeatColor(count: number, max: number, scale: string[]): string {
  if (count === 0) return scale[0];
  if (max <= 0) return scale[1];
  const logRatio = Math.log(count + 1) / Math.log(max + 1);
  const idx = Math.min(
    Math.ceil(logRatio * (scale.length - 2)),
    scale.length - 2,
  );
  return scale[idx + 1];
}

function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(amount) + " IQD";
}

function Skeleton() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-48 h-56 rounded-xl bg-gray-200/30 animate-pulse" />
    </div>
  );
}

export function IraqHeatmap({ geoStats }: IraqHeatmapProps) {
  const [view, setView] = useState<ViewMode>("orders");
  const [tooltip, setTooltip] = useState<{
    name: string;
    orders: number;
    revenue: number;
    x: number;
    y: number;
  } | null>(null);

  // Build lookup from governorate code to stats
  const statsMap = useMemo(() => {
    const map = new Map<string, GeoStats>();
    if (geoStats) {
      for (const s of geoStats) {
        map.set(s.governorateCode, s);
      }
    }
    return map;
  }, [geoStats]);

  // Compute max for color scaling
  const maxOrders = useMemo(
    () =>
      geoStats
        ? Math.max(...geoStats.map((g) => g.orderCount), 0)
        : 0,
    [geoStats],
  );
  const maxRevenue = useMemo(
    () =>
      geoStats
        ? Math.max(...geoStats.map((g) => g.revenue), 0)
        : 0,
    [geoStats],
  );

  const scale = view === "orders" ? ORDER_SCALE : REVENUE_SCALE;
  const maxVal = view === "orders" ? maxOrders : maxRevenue;

  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)]/40 flex items-center justify-center">
            <MapPin className="w-4 h-4 text-blue-700" />
          </div>
          <h3 className="font-bold text-foreground text-sm">
            Geographic Distribution
          </h3>
        </div>
        {/* View toggle */}
        <div className="flex items-center gap-1 bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]">
          {(["orders", "revenue"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all capitalize ${
                view === v
                  ? "bg-[var(--card-bg)] text-foreground shadow-sm"
                  : "text-foreground/50 hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {!geoStats ? (
        <Skeleton />
      ) : (
        <>
          {/* SVG Map */}
          <div className="relative flex justify-center">
            <svg
              viewBox={`0 0 ${IRAQ_MAP_WIDTH} ${IRAQ_MAP_HEIGHT}`}
              className="w-full max-w-[360px] h-auto"
              style={{ maxHeight: 340 }}
            >
              {IRAQ_GOVERNORATE_PATHS.map((gov) => {
                const stats = statsMap.get(gov.code);
                const val =
                  view === "orders"
                    ? (stats?.orderCount ?? 0)
                    : (stats?.revenue ?? 0);
                const fill = getHeatColor(val, maxVal, scale);

                return (
                  <g key={gov.code}>
                    <path
                      d={gov.d}
                      fill={fill}
                      stroke="#94a3b8"
                      strokeWidth={0.8}
                      className="transition-colors duration-200 cursor-pointer hover:opacity-80"
                      onMouseEnter={(e) => {
                        const rect = (
                          e.currentTarget as SVGPathElement
                        ).getBoundingClientRect();
                        setTooltip({
                          name: gov.code,
                          orders: stats?.orderCount ?? 0,
                          revenue: stats?.revenue ?? 0,
                          x: rect.left + rect.width / 2,
                          y: rect.top,
                        });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                    <text
                      x={gov.labelX}
                      y={gov.labelY}
                      textAnchor="middle"
                      className="pointer-events-none select-none"
                      style={{
                        fontSize: 7,
                        fill: "#334155",
                        fontWeight: 600,
                      }}
                    >
                      {gov.code}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            {tooltip && (
              <div
                className="fixed z-50 pointer-events-none bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg shadow-lg px-3 py-2 text-xs"
                style={{
                  left: tooltip.x,
                  top: tooltip.y - 48,
                  transform: "translateX(-50%)",
                }}
              >
                <p className="font-bold text-foreground mb-0.5">
                  {tooltip.name}
                </p>
                <p className="text-foreground/70">
                  Orders:{" "}
                  <span className="font-semibold text-foreground">
                    {tooltip.orders.toLocaleString()}
                  </span>
                </p>
                <p className="text-foreground/70">
                  Revenue:{" "}
                  <span className="font-semibold text-foreground">
                    {formatIQD(tooltip.revenue)}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-1 mt-3">
            <span className="text-[10px] text-foreground/50">Less</span>
            {scale.map((color, i) => (
              <div
                key={i}
                className="w-5 h-3 rounded-sm"
                style={{ backgroundColor: color }}
              />
            ))}
            <span className="text-[10px] text-foreground/50">More</span>
          </div>
        </>
      )}
    </div>
  );
}
