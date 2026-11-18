"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, X, Building2, Wallet, TrendingUp } from "lucide-react";
import {
  IRAQ_GOVERNORATE_PATHS,
  IRAQ_MAP_WIDTH,
  IRAQ_MAP_HEIGHT,
} from "@scheniders/shared/iraq-map-paths";
import { useAdminStore } from "@/store/use-admin-store";
import { cn } from "@/lib/utils";
import { SHOP_GOVERNORATES, governorateNamed } from "@/lib/shop-city";
import { useMerchantsStats } from "@/hooks/use-merchants-stats";

const HEAT_SCALE = [
  "#f1f5f9",
  "#ede9fe",
  "#ddd6fe",
  "#c4b5fd",
  "#a78bfa",
  "#8b5cf6",
  "#6d28d9",
] as const;

function heatColor(count: number, max: number): string {
  if (count === 0) return HEAT_SCALE[0];
  if (max <= 0) return HEAT_SCALE[1];
  const ratio = Math.log(count + 1) / Math.log(max + 1);
  const idx = Math.min(
    Math.ceil(ratio * (HEAT_SCALE.length - 2)),
    HEAT_SCALE.length - 2
  );
  return HEAT_SCALE[idx + 1];
}

function textColor(count: number, max: number): string {
  if (count === 0) return "#94a3b8";
  const ratio = Math.log(count + 1) / Math.log(max + 1);
  return ratio <= 0.45 ? "#1e293b" : "#ffffff";
}

interface GovCount {
  code: string;
  name: string;
  count: number;
}

/**
 * Shops per governorate, counted by the server over every shop that matches
 * the filters, not over the pages of the list loaded so far. Picking a
 * governorate filters the list to it, so the panel's numbers are the filtered
 * totals, the same ones the strip above shows.
 */
export function MerchantsMapView() {
  const { cityFilter, setCityFilter } = useAdminStore();
  const { data: stats, isError } = useMerchantsStats();
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    gov: GovCount;
  } | null>(null);

  const counts = useMemo(() => {
    const byCode = new Map<string, GovCount>();
    for (const governorate of SHOP_GOVERNORATES) {
      const count = stats?.governorates[governorate.code] ?? 0;
      if (count > 0) byCode.set(governorate.code, { code: governorate.code, name: governorate.name, count });
    }
    return byCode;
  }, [stats]);

  const maxCount = useMemo(() => {
    let max = 1;
    for (const g of counts.values()) if (g.count > max) max = g.count;
    return max;
  }, [counts]);

  // The governorate the list is filtered to, however it was picked: here or in the city filter.
  const selectedGovernorate = cityFilter ? governorateNamed(cityFilter) : undefined;
  const selected = selectedGovernorate?.code ?? null;

  const handlePathClick = useCallback(
    (code: string) => {
      const cityName = SHOP_GOVERNORATES.find((g) => g.code === code)?.name.toLowerCase();
      if (!cityName) return;
      // Toggle: clicking again clears
      setCityFilter(selected === code ? null : cityName);
    },
    [selected, setCityFilter]
  );

  const padding = 20;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* ── Map ───────────────────────────────────────────────────── */}
      <div className="lg:col-span-3 relative pastel-card p-5 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-bold text-foreground">
              Merchants by Governorate
            </h3>
          </div>
          <span className="text-xs text-foreground/70 tabular-nums">
            {isError ? "The counts did not load" : stats ? `${stats.total} total` : "—"}
            {stats && stats.unknown_city > 0 && (
              <span className="text-amber-600 dark:text-amber-400 ml-1.5">
                · {stats.unknown_city} unmapped
              </span>
            )}
          </span>
        </div>

        <svg
          viewBox={`${-padding} ${-padding} ${IRAQ_MAP_WIDTH + padding * 2} ${IRAQ_MAP_HEIGHT + padding * 2}`}
          className="w-full h-auto max-h-[60vh]"
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => {
            setHovered(null);
            setTooltip(null);
          }}
        >
          {IRAQ_GOVERNORATE_PATHS.map((path) => {
            const s = counts.get(path.code);
            const count = s?.count ?? 0;
            const isHovered = hovered === path.code;
            const isSelected = selected === path.code;

            return (
              <g key={path.code}>
                <path
                  d={path.d}
                  fill={heatColor(count, maxCount)}
                  stroke={
                    isSelected ? "#1e293b" : isHovered ? "#475569" : "#cbd5e1"
                  }
                  strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1}
                  className="cursor-pointer"
                  style={{
                    transition: "fill 0.4s ease, stroke 0.2s ease, stroke-width 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    setHovered(path.code);
                    if (s) {
                      const rect = (e.target as SVGElement)
                        .ownerSVGElement?.getBoundingClientRect();
                      if (rect) {
                        setTooltip({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top - 10,
                          gov: s,
                        });
                      }
                    }
                  }}
                  onMouseMove={(e) => {
                    if (s) {
                      const rect = (e.target as SVGElement)
                        .ownerSVGElement?.getBoundingClientRect();
                      if (rect) {
                        setTooltip({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top - 10,
                          gov: s,
                        });
                      }
                    }
                  }}
                  onMouseLeave={() => {
                    setHovered(null);
                    setTooltip(null);
                  }}
                  onClick={() => handlePathClick(path.code)}
                />
                {count > 0 && (
                  <text
                    x={path.labelX}
                    y={path.labelY}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={textColor(count, maxCount)}
                    fontSize={13}
                    fontWeight="bold"
                    className="pointer-events-none select-none"
                    style={{ textShadow: "0 1px 3px rgba(0,0,0,0.25)" }}
                  >
                    {count}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        <AnimatePresence>
          {tooltip && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute pointer-events-none z-10 bg-[var(--card-bg)] px-3 py-2 rounded-xl shadow-2xl border border-[var(--card-border)] text-xs"
              style={{
                left: tooltip.x,
                top: tooltip.y,
                transform: "translate(-50%, -100%)",
              }}
            >
              <p className="font-bold text-foreground">{tooltip.gov.name}</p>
              <p className="text-foreground/70 mt-0.5">
                {tooltip.gov.count}{" "}
                {tooltip.gov.count === 1 ? "merchant" : "merchants"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Legend */}
        <div className="flex items-center gap-1 mt-3 justify-center">
          <span className="text-xs text-foreground/70">Less</span>
          {HEAT_SCALE.map((c, i) => (
            <div
              key={i}
              className="w-4 h-2.5 rounded-sm"
              style={{ backgroundColor: c }}
            />
          ))}
          <span className="text-xs text-foreground/70">More</span>
        </div>
      </div>

      {/* ── Detail Panel ──────────────────────────────────────────── */}
      <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">
        <AnimatePresence mode="wait">
          {selectedGovernorate && stats ? (
            <motion.div
              key={selectedGovernorate.code}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-2xl bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 dark:from-violet-400/10 dark:via-fuchsia-400/10 dark:to-pink-400/10 border border-violet-200 dark:border-violet-400/30 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="font-black text-lg text-foreground tracking-tight">
                    {selectedGovernorate.name}
                  </h4>
                  <p className="text-xs text-foreground/70 font-medium mt-0.5">
                    {stats.total}{" "}
                    {stats.total === 1 ? "merchant" : "merchants"}
                  </p>
                </div>
                <button
                  onClick={() => setCityFilter(null)}
                  className="p-1 rounded-lg hover:bg-foreground/5 text-foreground/70 hover:text-foreground transition-colors"
                  aria-label="Close detail"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* mini stats */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-xl bg-white/70 dark:bg-white/5 p-2.5">
                  <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                    <Wallet className="w-3 h-3" />
                    <span className="text-xs font-black">
                      Wallet
                    </span>
                  </div>
                  <p className="text-sm font-black text-foreground tabular-nums mt-0.5">
                    {new Intl.NumberFormat("en-IQ").format(
                      stats.total_wallet_iqd
                    )}{" "}
                    <span className="text-xs font-bold text-foreground/70">
                      IQD
                    </span>
                  </p>
                </div>
                <div className="rounded-xl bg-white/70 dark:bg-white/5 p-2.5">
                  <div className="flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
                    <TrendingUp className="w-3 h-3" />
                    <span className="text-xs font-black">
                      Our fees, 30 days
                    </span>
                  </div>
                  <p className="text-sm font-black text-foreground tabular-nums mt-0.5">
                    {new Intl.NumberFormat("en-IQ").format(
                      stats.fees_30d_iqd
                    )}{" "}
                    <span className="text-xs font-bold text-foreground/70">
                      IQD
                    </span>
                  </p>
                </div>
              </div>

              {/* status breakdown */}
              <div className="space-y-1">
                {[
                  { label: "Active", count: stats.status.active, color: "bg-emerald-500" },
                  { label: "Trial", count: stats.status.trial, color: "bg-amber-500" },
                  { label: "Paused", count: stats.status.limited, color: "bg-yellow-500" },
                  { label: "Suspended", count: stats.status.suspended, color: "bg-rose-500" },
                  { label: "Cancelled", count: stats.status.cancelled, color: "bg-slate-400" },
                ]
                  .filter((b) => b.count > 0)
                  .map((b) => (
                    <div
                      key={b.label}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className={cn("w-1.5 h-1.5 rounded-full", b.color)} />
                        <span className="text-foreground/70">{b.label}</span>
                      </span>
                      <span className="font-bold text-foreground tabular-nums">
                        {b.count}
                      </span>
                    </div>
                  ))}
              </div>

              <p className="text-xs text-foreground/70 font-medium mt-3 pt-3 border-t border-foreground/10">
                List below filtered to {selectedGovernorate.name}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl bg-foreground/[0.02] border border-foreground/[0.06] p-6 text-center"
            >
              <Building2 className="w-7 h-7 text-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-foreground/70 font-medium">
                Click a governorate to see breakdown
              </p>
              <p className="text-xs text-foreground/70 mt-1">
                Selecting also filters the list view by city
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top governorates list */}
        <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-3 flex-1">
          <p className="text-xs font-black text-foreground/70 px-1 mb-2">
            Top Governorates
          </p>
          <div className="space-y-0.5">
            {Array.from(counts.values())
              .sort((a, b) => b.count - a.count)
              .slice(0, 8)
              .map((s) => {
                const isActive = selected === s.code;
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => handlePathClick(s.code)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-xl transition-colors text-left",
                      isActive
                        ? "bg-foreground/[0.06]"
                        : "hover:bg-foreground/[0.04]"
                    )}
                  >
                    <span
                      className="w-2 h-8 rounded-full shrink-0"
                      style={{ backgroundColor: heatColor(s.count, maxCount) }}
                    />
                    <span className="flex-1 text-xs font-bold text-foreground truncate">
                      {s.name}
                    </span>
                    <span className="text-xs font-black text-foreground tabular-nums">
                      {s.count}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
