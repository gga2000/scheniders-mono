"use client";

import { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Expand, ArrowUpDown, X, AlertTriangle, TrendingUp } from "lucide-react";
import { Order } from "@/types/order";
import { IRAQ_GOVERNORATE_PATHS, IRAQ_MAP_WIDTH, IRAQ_MAP_HEIGHT } from "@scheniders/shared/iraq-map-paths";
import { calculateGovernorateMetrics, GovernorateStats } from "@/lib/analytics/governorate-metrics";
import { useLanguage } from "@/hooks/use-language";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@scheniders/ui/dialog";
import { cn } from "@/lib/utils";

// Statuses to show in expanded breakdown
const DISPLAY_STATUSES: { key: keyof GovernorateStats; i18nKey: string; color: string }[] = [
  { key: "confirmed", i18nKey: "orders.status.confirmed", color: "bg-green-500" },
  { key: "delivered", i18nKey: "orders.status.delivered", color: "bg-emerald-500" },
  { key: "completed", i18nKey: "orders.status.completed", color: "bg-teal-500" },
  { key: "in_transit", i18nKey: "orders.status.inTransit", color: "bg-indigo-500" },
  { key: "new", i18nKey: "orders.status.new", color: "bg-yellow-500" },
  { key: "contacted", i18nKey: "orders.status.contacted", color: "bg-blue-500" },
  { key: "rejected", i18nKey: "orders.status.rejected", color: "bg-red-500" },
  { key: "cancelled", i18nKey: "orders.status.cancelled", color: "bg-gray-400" },
  { key: "no_response", i18nKey: "orders.status.noResponse", color: "bg-orange-500" },
  { key: "return_pending", i18nKey: "orders.status.returnPending", color: "bg-pink-500" },
  { key: "suspended", i18nKey: "orders.status.suspended", color: "bg-orange-400" },
];

type SortKey = "total" | keyof Pick<GovernorateStats,
  "confirmed" | "delivered" | "completed" | "in_transit" | "new" |
  "contacted" | "rejected" | "cancelled" | "no_response" | "return_pending" | "suspended"
>;

// #3 — Color themes per status filter
type ColorScale = readonly [string, string, string, string, string, string, string];
const COLOR_SCALES: Record<string, ColorScale> = {
  total:          ["#f1f5f9", "#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#f43f5e", "#dc2626"],
  confirmed:      ["#f1f5f9", "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a"],
  delivered:      ["#f1f5f9", "#d1fae5", "#a7f3d0", "#6ee7b7", "#34d399", "#10b981", "#059669"],
  completed:      ["#f1f5f9", "#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488"],
  in_transit:     ["#f1f5f9", "#e0e7ff", "#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#4f46e5"],
  new:            ["#f1f5f9", "#fef9c3", "#fef08a", "#fde047", "#facc15", "#eab308", "#ca8a04"],
  contacted:      ["#f1f5f9", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb"],
  rejected:       ["#f1f5f9", "#fee2e2", "#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626"],
  cancelled:      ["#f1f5f9", "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af", "#6b7280", "#4b5563"],
  no_response:    ["#f1f5f9", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c"],
  return_pending: ["#f1f5f9", "#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777"],
  suspended:      ["#f1f5f9", "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c"],
};

function getHeatColor(count: number, max: number, scale: ColorScale): string {
  if (count === 0) return scale[0];
  if (max <= 0) return scale[1];
  const logRatio = Math.log(count + 1) / Math.log(max + 1);
  const idx = Math.min(Math.ceil(logRatio * (scale.length - 2)), scale.length - 2);
  return scale[idx + 1];
}

function getTextColor(count: number, max: number): string {
  if (count === 0) return "#94a3b8";
  const logRatio = Math.log(count + 1) / Math.log(max + 1);
  if (logRatio <= 0.45) return "#1e293b";
  return "#ffffff";
}

// #7 — Delivery success rate
function deliverySuccessRate(stats: GovernorateStats): number | null {
  const attempted = stats.delivered + stats.completed + stats.rejected;
  if (attempted === 0) return null;
  return ((stats.delivered + stats.completed) / attempted) * 100;
}

interface IraqMapProps {
  orders: Order[];
  className?: string;
}

export function IraqMap({ orders, className }: IraqMapProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedGov, setSelectedGov] = useState<string | null>(null);
  const [hoveredGov, setHoveredGov] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortAsc, setSortAsc] = useState(false);
  const [colorByStatus, setColorByStatus] = useState<SortKey>("total");
  const { t, language } = useLanguage();
  const isRTL = language === "ar";

  const { governorates: metrics, unknownCount } = useMemo(
    () => calculateGovernorateMetrics(orders), [orders]
  );

  const metricsMap = useMemo(() => {
    const map = new Map<string, GovernorateStats>();
    for (const m of metrics) map.set(m.code, m);
    return map;
  }, [metrics]);

  const maxCount = useMemo(() => {
    return Math.max(...metrics.map(m => m[colorByStatus] as number), 1);
  }, [metrics, colorByStatus]);

  // #3 — Active color scale based on selected status filter
  const activeScale = useMemo((): ColorScale => {
    return (COLOR_SCALES[colorByStatus] || COLOR_SCALES.total) as ColorScale;
  }, [colorByStatus]);

  const sortedMetrics = useMemo(() => {
    return [...metrics].sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortAsc ? av - bv : bv - av;
    });
  }, [metrics, sortKey, sortAsc]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortAsc(prev => !prev);
    else { setSortKey(key); setSortAsc(false); }
  }, [sortKey]);

  const govName = useCallback((stats: GovernorateStats) => {
    return isRTL ? stats.nameAr : stats.nameEn;
  }, [isRTL]);

  const totalOrders = useMemo(() => metrics.reduce((s, m) => s + m.total, 0), [metrics]);

  // #8 — Compact card insight
  const cardInsight = useMemo(() => {
    const sorted = [...metrics].sort((a, b) => b.total - a.total);
    const top = sorted[0];
    if (!top || top.total === 0) return null;
    const pct = totalOrders > 0 ? Math.round((top.total / totalOrders) * 100) : 0;
    const zeroCount = metrics.filter(m => m.total === 0).length;
    return { topName: isRTL ? top.nameAr : top.nameEn, topPct: pct, zeroCount };
  }, [metrics, totalOrders, isRTL]);

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ x: number; y: number; stats: GovernorateStats } | null>(null);

  const renderMap = useCallback((large: boolean) => {
    const padding = 20;
    const vbWidth = IRAQ_MAP_WIDTH + padding * 2;
    const vbHeight = IRAQ_MAP_HEIGHT + padding * 2;

    return (
      <svg
        viewBox={`${-padding} ${-padding} ${vbWidth} ${vbHeight}`}
        className={cn("w-full h-full", large ? "max-h-[70vh]" : "max-h-[350px]")}
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setTooltip(null)}
      >
        {IRAQ_GOVERNORATE_PATHS.map(path => {
          const stats = metricsMap.get(path.code);
          const count = stats ? (stats[colorByStatus] as number) : 0;
          const isHovered = hoveredGov === path.code;
          const isSelected = selectedGov === path.code;

          return (
            <g key={path.code}>
              {/* #9 — transition on fill for smooth color changes */}
              <path
                d={path.d}
                fill={getHeatColor(count, maxCount, activeScale)}
                stroke={isSelected ? "#1e293b" : isHovered ? "#475569" : "#cbd5e1"}
                strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1}
                className="cursor-pointer"
                style={{ transition: "fill 0.4s ease, stroke 0.2s ease, stroke-width 0.2s ease" }}
                onMouseEnter={(e) => {
                  setHoveredGov(path.code);
                  if (stats) {
                    const svgRect = (e.target as SVGElement).ownerSVGElement?.getBoundingClientRect();
                    if (svgRect) {
                      setTooltip({
                        x: e.clientX - svgRect.left,
                        y: e.clientY - svgRect.top - 10,
                        stats,
                      });
                    }
                  }
                }}
                onMouseMove={(e) => {
                  if (stats) {
                    const svgRect = (e.target as SVGElement).ownerSVGElement?.getBoundingClientRect();
                    if (svgRect) {
                      setTooltip({
                        x: e.clientX - svgRect.left,
                        y: e.clientY - svgRect.top - 10,
                        stats,
                      });
                    }
                  }
                }}
                onMouseLeave={() => {
                  setHoveredGov(null);
                  setTooltip(null);
                }}
                onClick={() => {
                  if (large) setSelectedGov(path.code === selectedGov ? null : path.code);
                  else setIsExpanded(true);
                }}
              />
              {/* #1 — Labels: number + governorate name in expanded view */}
              {count > 0 && (
                <>
                  <text
                    x={path.labelX}
                    y={large ? path.labelY - 6 : path.labelY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={getTextColor(count, maxCount)}
                    fontSize={large ? 14 : 12}
                    fontWeight="bold"
                    className="pointer-events-none select-none"
                    style={{ textShadow: "0 1px 3px rgba(0,0,0,0.25)" }}
                  >
                    {count}
                  </text>
                  {large && (
                    <text
                      x={path.labelX}
                      y={path.labelY + 10}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={getTextColor(count, maxCount)}
                      fontSize={8}
                      fontWeight="500"
                      className="pointer-events-none select-none"
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.2)", opacity: 0.9 }}
                    >
                      {stats ? (isRTL ? stats.nameAr : stats.nameEn) : ""}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
    );
  }, [metricsMap, maxCount, hoveredGov, selectedGov, colorByStatus, activeScale, isRTL]);

  const selectedStats = selectedGov ? metricsMap.get(selectedGov) : null;

  // Max total for #5 — proportional bars
  const maxTotal = useMemo(() => Math.max(...metrics.map(m => m.total), 1), [metrics]);

  return (
    <>
      {/* Compact Card View */}
      <div
        className={cn(
          "pastel-card p-5 h-full flex flex-col cursor-pointer group relative overflow-hidden",
          className
        )}
        onClick={() => setIsExpanded(true)}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-semibold text-foreground">
              {t("map.title")}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{totalOrders} {t("map.orders")}</span>
            <Expand className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        <div className="flex-1 relative min-h-0">
          {renderMap(false)}
          {/* Tooltip overlay */}
          <AnimatePresence>
            {tooltip && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute pointer-events-none z-10 bg-white dark:bg-slate-800 px-3 py-2 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 text-xs"
                style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
              >
                <p className="font-bold text-foreground">{govName(tooltip.stats)}</p>
                <p className="text-muted">{tooltip.stats.total} {t("map.orders")}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* #8 — Compact card insight + mini legend */}
        <div className="mt-2 space-y-1">
          {cardInsight && (
            <p className="text-[10px] text-muted text-center">
              {t("map.topGov")}: <span className="font-semibold text-foreground">{cardInsight.topName} ({cardInsight.topPct}%)</span>
              {cardInsight.zeroCount > 0 && (
                <span className="text-orange-500"> · {cardInsight.zeroCount} {t("map.emptyGovs")}</span>
              )}
            </p>
          )}
          <div className="flex items-center gap-1 justify-center">
            <span className="text-[10px] text-muted">{t("map.less")}</span>
            {activeScale.map((c, i) => (
              <div key={i} className="w-3 h-2 rounded-sm" style={{ backgroundColor: c, transition: "background-color 0.4s ease" }} />
            ))}
            <span className="text-[10px] text-muted">{t("map.more")}</span>
          </div>
        </div>
      </div>

      {/* Expanded Dialog View */}
      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent className="md:max-w-6xl md:max-h-[92vh]" aria-describedby="map-dialog-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-rose-500" />
              {t("map.title")}
            </DialogTitle>
            <DialogDescription id="map-dialog-desc">
              {t("map.description")}
            </DialogDescription>
          </DialogHeader>

          {/* Status Filter Chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setColorByStatus("total")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                colorByStatus === "total"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              )}
            >
              {t("map.filter.total")}
            </button>
            {DISPLAY_STATUSES.map(s => (
              <button
                key={s.key}
                onClick={() => setColorByStatus(s.key as SortKey)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
                  colorByStatus === s.key
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                )}
              >
                <span className={cn("w-2 h-2 rounded-full", s.color)} />
                {t(s.i18nKey)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Map */}
            <div className="lg:col-span-3 relative">
              {renderMap(true)}
              {/* Tooltip */}
              <AnimatePresence>
                {tooltip && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute pointer-events-none z-10 bg-white dark:bg-slate-800 px-3 py-2 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 text-xs"
                    style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
                  >
                    <p className="font-bold text-foreground">{govName(tooltip.stats)}</p>
                    <p className="text-muted">{tooltip.stats.total} {t("map.orders")}</p>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Legend */}
              <div className="flex items-center gap-1 mt-3 justify-center">
                <span className="text-[10px] text-muted">{t("map.less")}</span>
                {activeScale.map((c, i) => (
                  <div key={i} className="w-4 h-3 rounded-sm" style={{ backgroundColor: c, transition: "background-color 0.4s ease" }} />
                ))}
                <span className="text-[10px] text-muted">{t("map.more")}</span>
              </div>
            </div>

            {/* Detail Panel */}
            <div className="lg:col-span-2 flex flex-col min-h-0">
              {/* Selected governorate detail */}
              <AnimatePresence mode="wait">
                {selectedStats && (
                  <motion.div
                    key={selectedStats.code}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="mb-4 p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-bold text-lg text-foreground">{govName(selectedStats)}</h4>
                        {/* #2 — Percentage badge */}
                        {totalOrders > 0 && (
                          <span className="text-[10px] text-muted">
                            {((selectedStats.total / totalOrders) * 100).toFixed(1)}% {t("map.ofTotal")}
                          </span>
                        )}
                      </div>
                      <button onClick={() => setSelectedGov(null)} className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
                        <X className="w-4 h-4 text-muted" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center p-2 rounded-xl bg-white dark:bg-slate-800">
                        <p className="text-lg font-bold text-foreground">{selectedStats.total}</p>
                        <p className="text-[10px] text-muted">{t("map.filter.total")}</p>
                      </div>
                      <div className="text-center p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                        <p className="text-lg font-bold text-emerald-600">{selectedStats.delivered + selectedStats.completed}</p>
                        <p className="text-[10px] text-muted">{t("orders.status.delivered")}</p>
                      </div>
                      <div className="text-center p-2 rounded-xl bg-red-50 dark:bg-red-900/20">
                        <p className="text-lg font-bold text-red-600">{selectedStats.rejected}</p>
                        <p className="text-[10px] text-muted">{t("orders.status.rejected")}</p>
                      </div>
                    </div>

                    {/* #7 — Delivery success rate */}
                    {(() => {
                      const rate = deliverySuccessRate(selectedStats);
                      if (rate === null) return null;
                      return (
                        <div className="mt-3 flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-800">
                          <TrendingUp className={cn("w-4 h-4", rate >= 80 ? "text-emerald-500" : rate >= 50 ? "text-orange-500" : "text-red-500")} />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-muted">{t("map.deliveryRate")}</span>
                              <span className={cn("text-sm font-bold", rate >= 80 ? "text-emerald-600" : rate >= 50 ? "text-orange-600" : "text-red-600")}>
                                {rate.toFixed(1)}%
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full transition-all", rate >= 80 ? "bg-emerald-500" : rate >= 50 ? "bg-orange-500" : "bg-red-500")}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Full status breakdown */}
                    <div className="mt-3 space-y-1.5">
                      {DISPLAY_STATUSES.filter(s => (selectedStats[s.key] as number) > 0).map(s => {
                        const val = selectedStats[s.key] as number;
                        // #2 — percentage per status
                        const pct = selectedStats.total > 0 ? ((val / selectedStats.total) * 100).toFixed(0) : "0";
                        return (
                          <div key={s.key} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className={cn("w-2 h-2 rounded-full", s.color)} />
                              <span className="text-muted">{t(s.i18nKey)}</span>
                            </div>
                            <span className="font-semibold text-foreground">{val} <span className="text-muted font-normal">({pct}%)</span></span>
                          </div>
                        );
                      })}
                    </div>
                    {selectedStats.revenue > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted">{t("map.revenue")}</span>
                          <span className="font-bold text-green-600">
                            {new Intl.NumberFormat("en-IQ").format(selectedStats.revenue)} IQD
                          </span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Sortable governorate table */}
              <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10">
                    <tr>
                      <th className="text-start p-2 font-semibold text-muted">
                        {t("map.governorate")}
                      </th>
                      {[
                        { key: "total" as SortKey, label: t("map.filter.total") },
                        { key: "delivered" as SortKey, label: "Del." },
                        { key: "rejected" as SortKey, label: "Rej." },
                        { key: "confirmed" as SortKey, label: "Conf." },
                      ].map(col => (
                        <th
                          key={col.key}
                          className="p-2 font-semibold text-muted cursor-pointer hover:text-foreground transition-colors text-center"
                          onClick={() => handleSort(col.key)}
                        >
                          <div className="flex items-center justify-center gap-0.5">
                            {col.label}
                            {sortKey === col.key && (
                              <ArrowUpDown className="w-3 h-3" />
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMetrics.filter(m => m.total > 0).map(m => {
                      // #4 — cross-highlight: highlight row when governorate is hovered on map
                      const isRowHighlighted = hoveredGov === m.code;
                      const isRowSelected = selectedGov === m.code;

                      return (
                        <tr
                          key={m.code}
                          className={cn(
                            "border-t border-slate-100 dark:border-slate-800 cursor-pointer",
                            isRowSelected
                              ? "bg-slate-100 dark:bg-slate-800"
                              : isRowHighlighted
                                ? "bg-blue-50 dark:bg-blue-900/20"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                            "transition-colors duration-150"
                          )}
                          onClick={() => setSelectedGov(m.code === selectedGov ? null : m.code)}
                          onMouseEnter={() => setHoveredGov(m.code)}
                          onMouseLeave={() => setHoveredGov(null)}
                        >
                          <td className="p-2 font-medium text-foreground">{govName(m)}</td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="font-bold text-foreground">{m.total}</span>
                              {/* #5 — Mini proportional bar */}
                              <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-slate-400"
                                  style={{ width: `${(m.total / maxTotal) * 100}%`, transition: "width 0.3s ease" }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="p-2 text-center text-emerald-600">{m.delivered + m.completed || "-"}</td>
                          <td className="p-2 text-center text-red-600">{m.rejected || "-"}</td>
                          <td className="p-2 text-center text-green-600">{m.confirmed || "-"}</td>
                        </tr>
                      );
                    })}

                    {/* #6 — Unknown/Unassigned row */}
                    {unknownCount > 0 && (
                      <tr className="border-t-2 border-dashed border-orange-200 dark:border-orange-900/30 bg-orange-50/50 dark:bg-orange-900/10">
                        <td className="p-2 font-medium text-orange-600 flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3" />
                          {t("map.unknown")}
                        </td>
                        <td className="p-2 text-center font-bold text-orange-600">{unknownCount}</td>
                        <td className="p-2 text-center text-muted">-</td>
                        <td className="p-2 text-center text-muted">-</td>
                        <td className="p-2 text-center text-muted">-</td>
                      </tr>
                    )}

                    {sortedMetrics.every(m => m.total === 0) && unknownCount === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted">
                          {t("map.noData")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
