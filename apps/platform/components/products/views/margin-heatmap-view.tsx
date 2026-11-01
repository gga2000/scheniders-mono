"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Product } from "@/lib/supabase";
import { cn, formatIQD, maskIQD } from "@/lib/utils";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { useLanguage } from "@/hooks/use-language";
import { ChevronDown, AlertTriangle, TrendingDown } from "lucide-react";

interface MarginHeatmapViewProps {
  products: Product[];
  onViewDetails: (product: Product) => void;
}

type SortOption = "margin" | "revenue" | "name";

function getMargin(product: Product): number | null {
  if (product.cost == null || product.cost === 0 || product.price <= 0) return null;
  return ((product.price - product.cost) / product.price) * 100;
}

function getMarginColor(margin: number | null): string {
  if (margin === null) return "bg-gray-400";
  if (margin < 0) return "bg-red-800";
  if (margin < 10) return "bg-red-500";
  if (margin < 20) return "bg-orange-500";
  if (margin < 30) return "bg-amber-400";
  if (margin < 40) return "bg-green-400";
  if (margin < 50) return "bg-emerald-500";
  return "bg-emerald-600";
}

function getMarginTextColor(margin: number | null): string {
  if (margin === null) return "text-white";
  if (margin < 0) return "text-white";
  if (margin < 10) return "text-white";
  if (margin < 20) return "text-white";
  if (margin < 30) return "text-gray-900";
  if (margin < 40) return "text-gray-900";
  if (margin < 50) return "text-white";
  return "text-white";
}

const LEGEND_ITEMS = [
  { label: "< 0%", color: "bg-red-800" },
  { label: "0-10%", color: "bg-red-500" },
  { label: "10-20%", color: "bg-orange-500" },
  { label: "20-30%", color: "bg-amber-400" },
  { label: "30-40%", color: "bg-green-400" },
  { label: "40-50%", color: "bg-emerald-500" },
  { label: "> 50%", color: "bg-emerald-600" },
];

export function MarginHeatmapView({
  products,
  onViewDetails,
}: MarginHeatmapViewProps) {
  const { t } = useLanguage();
  const { revealed: showFinancials } = useFinancialVisibility();
  const [sortBy, setSortBy] = useState<SortOption>("margin");
  const [showLowMarginOnly, setShowLowMarginOnly] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const productsWithMargin = useMemo(
    () =>
      products.map((p) => ({
        product: p,
        margin: getMargin(p),
      })),
    [products]
  );

  const stats = useMemo(() => {
    const withMargin = productsWithMargin.filter((p) => p.margin !== null);
    const avg =
      withMargin.length > 0
        ? withMargin.reduce((sum, p) => sum + p.margin!, 0) / withMargin.length
        : 0;
    const belowThreshold = withMargin.filter(
      (p) => p.margin! < 10
    ).length;
    const negative = withMargin.filter((p) => p.margin! < 0).length;
    return { avg, belowThreshold, negative };
  }, [productsWithMargin]);

  const revenueThresholds = useMemo(() => {
    const revenues = products
      .map((p) => p.total_revenue ?? 0)
      .sort((a, b) => b - a);
    const top10Index = Math.max(1, Math.floor(revenues.length * 0.1));
    const top30Index = Math.max(
      top10Index + 1,
      Math.floor(revenues.length * 0.3)
    );
    return {
      top10: revenues[top10Index - 1] ?? 0,
      top30: revenues[top30Index - 1] ?? 0,
    };
  }, [products]);

  const filteredAndSorted = useMemo(() => {
    let items = [...productsWithMargin];

    if (showLowMarginOnly) {
      items = items.filter(
        (p) => p.margin !== null && p.margin < 15
      );
    }

    items.sort((a, b) => {
      switch (sortBy) {
        case "margin":
          return (b.margin ?? -Infinity) - (a.margin ?? -Infinity);
        case "revenue":
          return (
            (b.product.total_revenue ?? 0) -
            (a.product.total_revenue ?? 0)
          );
        case "name":
          return a.product.name.localeCompare(b.product.name);
        default:
          return 0;
      }
    });

    return items;
  }, [productsWithMargin, sortBy, showLowMarginOnly]);

  function getTileSize(product: Product): string {
    const revenue = product.total_revenue ?? 0;
    if (revenue >= revenueThresholds.top10) return "col-span-2 row-span-2";
    if (revenue >= revenueThresholds.top30) return "col-span-2 row-span-1";
    return "col-span-1 row-span-1";
  }

  const sortLabels: Record<SortOption, string> = {
    margin: t("products.views.heatmap.sortByMargin"),
    revenue: t("products.views.heatmap.sortByRevenue"),
    name: t("products.views.heatmap.sortByName"),
  };

  return (
    <div className="space-y-4">
      {/* Header: Stats + Controls */}
      <div
        className="rounded-xl border p-4"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--card-border)",
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Summary stats */}
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
            style={{ color: "var(--ink)" }}
          >
            <span>
              {t("products.views.heatmap.avgMargin")}:{" "}
              <strong>{stats.avg.toFixed(1)}%</strong>
            </span>
            <span className="opacity-40">·</span>
            <span className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
              {stats.belowThreshold}{" "}
              {t("products.views.heatmap.belowThreshold")}
            </span>
            <span className="opacity-40">·</span>
            <span className="flex items-center gap-1">
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              {stats.negative} {t("products.views.heatmap.negative")}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            {/* Low margin filter */}
            <label
              className="flex cursor-pointer items-center gap-2 text-sm"
              style={{ color: "var(--ink)" }}
            >
              <input
                type="checkbox"
                checked={showLowMarginOnly}
                onChange={(e) => setShowLowMarginOnly(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-red-500"
              />
              {t("products.views.heatmap.showLowMargin")}
            </label>

            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setSortOpen(!sortOpen)}
                className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:opacity-80"
                style={{
                  background: "var(--background)",
                  borderColor: "var(--card-border)",
                  color: "var(--ink)",
                }}
              >
                {sortLabels[sortBy]}
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    sortOpen && "rotate-180"
                  )}
                />
              </button>
              {sortOpen && (
                <div
                  className="absolute end-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border py-1 shadow-lg"
                  style={{
                    background: "var(--card-bg)",
                    borderColor: "var(--card-border)",
                  }}
                >
                  {(["margin", "revenue", "name"] as SortOption[]).map(
                    (option) => (
                      <button
                        key={option}
                        onClick={() => {
                          setSortBy(option);
                          setSortOpen(false);
                        }}
                        className={cn(
                          "w-full px-3 py-1.5 text-start text-sm transition-colors hover:opacity-70",
                          sortBy === option && "font-semibold"
                        )}
                        style={{ color: "var(--ink)" }}
                      >
                        {sortLabels[option]}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {LEGEND_ITEMS.map((item) => (
            <div key={item.label} className="flex items-center gap-1">
              <div className={cn("h-3 w-5 rounded-sm", item.color)} />
              <span
                className="text-xs"
                style={{ color: "var(--ink)", opacity: 0.7 }}
              >
                {item.label}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <div className="h-3 w-5 rounded-sm bg-gray-400" />
            <span
              className="text-xs"
              style={{ color: "var(--ink)", opacity: 0.7 }}
            >
              {t("products.views.heatmap.noCost")}
            </span>
          </div>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="grid auto-rows-[80px] grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {filteredAndSorted.map(({ product, margin }, index) => {
          const colorClass = getMarginColor(margin);
          const textColor = getMarginTextColor(margin);
          const tileSize = getTileSize(product);

          return (
            <motion.button
              key={product.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(index * 0.01, 0.5), duration: 0.2 }}
              whileHover={{ scale: 1.05, zIndex: 10 }}
              onClick={() => onViewDetails(product)}
              className={cn(
                "group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-lg p-2 text-start transition-shadow hover:shadow-lg",
                colorClass,
                textColor,
                tileSize
              )}
            >
              {/* Default content */}
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold leading-tight">
                  {product.name}
                </p>
              </div>
              <div className="flex items-end justify-between gap-1">
                <span className="text-[10px] font-medium opacity-90">
                  {margin !== null
                    ? `${margin.toFixed(1)}%`
                    : t("products.views.heatmap.noCost")}
                </span>
                <span className="truncate text-[10px] opacity-80">
                  {formatIQD(product.price)}
                </span>
              </div>

              {/* Hover overlay with extra details */}
              <div
                className={cn(
                  "absolute inset-0 flex flex-col justify-between rounded-lg p-2 opacity-0 transition-opacity group-hover:opacity-100",
                  colorClass,
                  textColor
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold leading-tight">
                    {product.name}
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold">
                    {t("products.views.heatmap.margin")}:{" "}
                    {margin !== null
                      ? `${margin.toFixed(1)}%`
                      : t("products.views.heatmap.noCost")}
                  </p>
                </div>
                <div className="space-y-0.5 text-[10px] opacity-90">
                  <p>
                    {t("products.views.heatmap.revenue")}:{" "}
                    {maskIQD(product.total_revenue ?? 0, showFinancials)}
                  </p>
                  <p>
                    {t("products.views.heatmap.cost")}:{" "}
                    {product.cost != null
                      ? maskIQD(product.cost, showFinancials)
                      : "—"}
                  </p>
                  <p>
                    {t("products.views.heatmap.sold")}:{" "}
                    {product.times_sold ?? 0}
                  </p>
                  {product.cost != null && product.price != null && (
                    <p>
                      {t("products.views.heatmap.profitPerUnit")}:{" "}
                      {maskIQD(product.price - product.cost, showFinancials)}
                    </p>
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {filteredAndSorted.length === 0 && (
        <div
          className="rounded-xl border py-12 text-center text-sm"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--card-border)",
            color: "var(--ink)",
          }}
        >
          {t("products.views.heatmap.title")}
        </div>
      )}
    </div>
  );
}
