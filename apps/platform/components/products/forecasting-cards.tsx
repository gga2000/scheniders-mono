"use client";

import { useMemo } from "react";
import {
  Package,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Activity,
  ChevronRight,
} from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { Product } from "@/lib/supabase";
import {
  calculateProductScore,
  computeDailySalesRate,
  type HealthGrade,
  type ProductScoreInput,
} from "@/lib/utils/product-scoring";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ForecastingCardsProps {
  products: Product[];
  onDrillDown?: (target: "stockout" | "revenue" | "lowStock") => void;
}

function TrendGlyph({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <span className="text-emerald-600 text-[10px]">▲</span>;
  if (direction === "down") return <span className="text-rose-600 text-[10px]">▼</span>;
  return <span className="text-gray-400 text-[10px]">─</span>;
}

function trendFromSeries(data: number[]): "up" | "down" | "flat" {
  if (data.length < 2) return "flat";
  const first = data[0];
  const last = data[data.length - 1];
  const diff = last - first;
  const threshold = Math.abs(first) * 0.05;
  if (Math.abs(diff) < threshold) return "flat";
  return diff > 0 ? "up" : "down";
}

// ---------------------------------------------------------------------------
// Mini sparkline (inline SVG polyline)
// ---------------------------------------------------------------------------

function MiniSparkline({
  data,
  color = "currentColor",
  width = 60,
  height = 24,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ForecastingCards({ products, onDrillDown }: ForecastingCardsProps) {
  const { t } = useLanguage();

  // ---- Derived stats (single pass where possible) ----
  const stats = useMemo(() => {
    let activeCount = 0;
    let visibleCount = 0;
    let hiddenCount = 0;
    let inventoryValueCost = 0;
    let inventoryValueRetail = 0;
    let outOfStockCount = 0;
    let lowStockCount = 0;
    let approachingCount = 0;
    let totalRevenue = 0;
    let totalSold = 0;
    let turnoverSum = 0;
    let turnoverCount = 0;

    const gradeCounts: Record<HealthGrade, number> = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      F: 0,
    };

    // Sparkline buckets: simulate daily revenue distribution across 7 buckets
    const revenueBuckets: number[] = [0, 0, 0, 0, 0, 0, 0];
    const stockBuckets: number[] = [0, 0, 0, 0, 0, 0, 0];

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const isActive = !p.is_archived && !p.is_supply;
      const timesSold = p.times_sold ?? 0;
      const revenue = p.total_revenue ?? 0;
      const cost = p.cost ?? 0;
      const stock = p.stock_quantity ?? 0;
      const threshold = p.low_stock_threshold ?? 0;

      if (isActive) {
        activeCount++;
        if (p.is_visible !== false) visibleCount++;
        else hiddenCount++;
      }

      // Inventory value
      inventoryValueCost += stock * cost;
      inventoryValueRetail += stock * p.price;

      // Stockout risk
      if (stock === 0 && isActive) {
        outOfStockCount++;
      } else if (stock > 0 && stock <= threshold && isActive) {
        lowStockCount++;
      } else if (
        stock > threshold &&
        stock <= threshold * 1.2 &&
        isActive
      ) {
        approachingCount++;
      }

      // Revenue
      totalRevenue += revenue;
      totalSold += timesSold;

      // Turnover (only for products with sales)
      if (timesSold > 0 && isActive) {
        const dailyRate = timesSold / 30;
        if (dailyRate > 0) {
          turnoverSum += stock / dailyRate;
          turnoverCount++;
        }
      }

      // Health grade
      if (isActive) {
        const dailySalesRate = computeDailySalesRate(timesSold);
        const scoreInput: ProductScoreInput = {
          id: p.id,
          price: p.price,
          cost: p.cost,
          stock_quantity: stock,
          reserved_quantity: p.reserved_quantity ?? 0,
          low_stock_threshold: threshold,
          times_sold: timesSold,
          total_revenue: revenue,
          created_at: p.created_at,
          daily_sales_rate: dailySalesRate,
        };
        const score = calculateProductScore(scoreInput);
        gradeCounts[score.overall]++;
      }

      // Distribute into sparkline buckets (deterministic hash by index)
      const bucket = i % 7;
      revenueBuckets[bucket] += revenue;
      stockBuckets[bucket] += stock;
    }

    const avgTurnover =
      turnoverCount > 0 ? Math.round(turnoverSum / turnoverCount) : 0;

    return {
      activeCount,
      visibleCount,
      hiddenCount,
      inventoryValueCost,
      inventoryValueRetail,
      outOfStockCount,
      lowStockCount,
      approachingCount,
      totalRevenue,
      totalSold,
      avgTurnover,
      gradeCounts,
      revenueBuckets,
      stockBuckets,
    };
  }, [products]);

  const turnoverLabel =
    stats.avgTurnover < 30
      ? t("products.forecast.fastTurnover")
      : stats.avgTurnover <= 60
        ? t("products.forecast.normalTurnover")
        : t("products.forecast.slowTurnover");

  const totalGraded =
    stats.gradeCounts.A +
    stats.gradeCounts.B +
    stats.gradeCounts.C +
    stats.gradeCounts.D +
    stats.gradeCounts.F;

  // ---- Render ----
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {/* Card 1: Total Products */}
      <div className={cn("pastel-card pastel-card-yellow p-4")}>
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
            <Package className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex items-center gap-1">
            <MiniSparkline data={stats.stockBuckets} color="#d97706" />
            <TrendGlyph direction={trendFromSeries(stats.stockBuckets)} />
          </div>
        </div>
        <p className="text-2xl font-bold mt-3">{stats.activeCount}</p>
        <p className="text-xs text-muted">
          {t("products.forecast.totalProducts")}
        </p>
        <p className="text-xs text-muted mt-1">
          {stats.visibleCount} {t("products.forecast.visible")} &middot;{" "}
          {stats.hiddenCount} {t("products.forecast.hidden")}
        </p>
      </div>

      {/* Card 2: Inventory Value */}
      <div className={cn("pastel-card pastel-card-mint p-4")}>
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-teal-600" />
          </div>
          <div className="flex items-center gap-1">
            <MiniSparkline data={stats.stockBuckets} color="#0d9488" />
            <TrendGlyph direction={trendFromSeries(stats.stockBuckets)} />
          </div>
        </div>
        <p className="text-2xl font-bold mt-3">
          {formatIQD(stats.inventoryValueCost)}
        </p>
        <p className="text-xs text-muted">
          {t("products.forecast.inventoryValue")}
        </p>
        <p className="text-xs text-muted mt-1">
          {t("products.forecast.retail")}: {formatIQD(stats.inventoryValueRetail)}
        </p>
      </div>

      {/* Card 3: Stockout Risk */}
      <button
        type="button"
        onClick={onDrillDown ? () => onDrillDown("stockout") : undefined}
        disabled={!onDrillDown}
        className={cn(
          "pastel-card pastel-card-pink p-4 text-left",
          onDrillDown && "hover:shadow-md transition-shadow cursor-pointer"
        )}
      >
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          </div>
          <TrendGlyph direction={stats.outOfStockCount > 0 ? "up" : "flat"} />
        </div>
        <p className="text-2xl font-bold mt-3">{stats.outOfStockCount}</p>
        <p className="text-xs text-muted flex items-center gap-1">
          {t("products.forecast.stockoutRisk")}
          {onDrillDown && <ChevronRight className="w-3 h-3" />}
        </p>
        <p className="text-xs text-muted mt-1">
          {stats.lowStockCount} {t("products.forecast.lowStock")} &middot;{" "}
          {stats.approachingCount} {t("products.forecast.approaching")}
        </p>
      </button>

      {/* Card 4: Revenue (30d) */}
      <button
        type="button"
        onClick={onDrillDown ? () => onDrillDown("revenue") : undefined}
        disabled={!onDrillDown}
        className={cn(
          "pastel-card pastel-card-green p-4 text-left",
          onDrillDown && "hover:shadow-md transition-shadow cursor-pointer"
        )}
      >
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex items-center gap-1">
            <MiniSparkline data={stats.revenueBuckets} color="#059669" />
            <TrendGlyph direction={trendFromSeries(stats.revenueBuckets)} />
          </div>
        </div>
        <p className="text-2xl font-bold mt-3">
          {formatIQD(stats.totalRevenue)}
        </p>
        <p className="text-xs text-muted flex items-center gap-1">
          {t("products.forecast.revenue30d")}
          {onDrillDown && <ChevronRight className="w-3 h-3" />}
        </p>
        <p className="text-xs text-muted mt-1">
          {stats.totalSold} {t("products.forecast.unitsSold")}
        </p>
      </button>

      {/* Card 5: Avg Turnover */}
      <div className={cn("pastel-card pastel-card-blue p-4")}>
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-blue-600" />
          </div>
        </div>
        <p className="text-2xl font-bold mt-3">
          {stats.avgTurnover} {t("products.forecast.days")}
        </p>
        <p className="text-xs text-muted">
          {t("products.forecast.avgTurnover")}
        </p>
        <p className="text-xs text-muted mt-1">{turnoverLabel}</p>
      </div>

      {/* Card 6: Health Overview */}
      <div className={cn("pastel-card pastel-card-yellow p-4")}>
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
            <Activity className="w-5 h-5 text-amber-600" />
          </div>
        </div>
        <div className="flex items-center gap-1 mt-3">
          <span className="text-emerald-700 font-bold text-sm">
            A:{stats.gradeCounts.A}
          </span>
          <span className="text-blue-700 font-bold text-sm">
            B:{stats.gradeCounts.B}
          </span>
          <span className="text-amber-700 font-bold text-sm">
            C:{stats.gradeCounts.C}
          </span>
          <span className="text-orange-700 font-bold text-sm">
            D:{stats.gradeCounts.D}
          </span>
          <span className="text-rose-700 font-bold text-sm">
            F:{stats.gradeCounts.F}
          </span>
        </div>
        <p className="text-xs text-muted">
          {t("products.forecast.healthOverview")}
        </p>
        {totalGraded > 0 && (
          <div className="h-2 rounded-full overflow-hidden flex mt-2">
            {stats.gradeCounts.A > 0 && (
              <div
                className="bg-emerald-500"
                style={{
                  width: `${(stats.gradeCounts.A / totalGraded) * 100}%`,
                }}
              />
            )}
            {stats.gradeCounts.B > 0 && (
              <div
                className="bg-blue-500"
                style={{
                  width: `${(stats.gradeCounts.B / totalGraded) * 100}%`,
                }}
              />
            )}
            {stats.gradeCounts.C > 0 && (
              <div
                className="bg-amber-500"
                style={{
                  width: `${(stats.gradeCounts.C / totalGraded) * 100}%`,
                }}
              />
            )}
            {stats.gradeCounts.D > 0 && (
              <div
                className="bg-orange-500"
                style={{
                  width: `${(stats.gradeCounts.D / totalGraded) * 100}%`,
                }}
              />
            )}
            {stats.gradeCounts.F > 0 && (
              <div
                className="bg-rose-500"
                style={{
                  width: `${(stats.gradeCounts.F / totalGraded) * 100}%`,
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
