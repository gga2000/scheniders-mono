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
import { cn, maskIQD } from "@/lib/utils";
import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { useLanguage } from "@/hooks/use-language";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import type { Product } from "@/lib/supabase";
import {
  calculateProductScore,
  computeDailySalesRate,
  type HealthGrade,
  type ProductScoreInput,
} from "@/lib/utils/product-scoring";
import { TrendGlyph } from "@/components/ui/mini-sparkline";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ForecastingCardsProps {
  products: Product[];
  onDrillDown?: (target: "stockout" | "revenue" | "lowStock") => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ForecastingCards({ products, onDrillDown }: ForecastingCardsProps) {
  const { t } = useLanguage();
  const { revealed } = useFinancialVisibility();
  // Stock value at cost stays masked for anyone without products.manage.
  const { can } = usePermission();
  const costRevealed = revealed && can(PERMISSIONS.MANAGE_PRODUCTS);

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

    for (const p of products) {
      const isActive = !p.is_archived && !p.is_supply;
      // Revenue, turnover and sales rate all read the last 30 days of
      // delivered sales, so the card label and the rates are true.
      const timesSold = p.times_sold_30d ?? 0;
      const revenue = p.revenue_30d ?? 0;
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
          times_sold: p.times_sold ?? 0,
          total_revenue: p.total_revenue ?? 0,
          created_at: p.created_at,
          daily_sales_rate: dailySalesRate,
        };
        const score = calculateProductScore(scoreInput);
        gradeCounts[score.overall]++;
      }
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
    // Phones: one swipeable row instead of three rows of cards above the list.
    <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [&>*]:min-w-[44%] [&>*]:shrink-0 [&>*]:snap-start md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0 md:[&>*]:min-w-0 xl:grid-cols-6">
      {/* Card 1: Total Products */}
      <div className={cn("pastel-card pastel-card-yellow p-4")}>
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-white/50 flex items-center justify-center">
            <Package className="w-5 h-5 text-amber-600" />
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
        </div>
        <p className="text-2xl font-bold mt-3">
          {maskIQD(stats.inventoryValueCost, costRevealed)}
        </p>
        <p className="text-xs text-muted">
          {t("products.forecast.inventoryValue")}
        </p>
        <p className="text-xs text-muted mt-1">
          {t("products.forecast.retail")}: {maskIQD(stats.inventoryValueRetail, revealed)}
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
        </div>
        <p className="text-2xl font-bold mt-3">
          {maskIQD(stats.totalRevenue, revealed)}
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
