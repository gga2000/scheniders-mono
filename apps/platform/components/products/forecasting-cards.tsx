"use client";

import { useMemo } from "react";
import {
  DollarSign,
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ForecastingCardsProps {
  products: Product[];
  onDrillDown?: (target: "revenue") => void;
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
    let inventoryValueCost = 0;
    let inventoryValueRetail = 0;
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

      // Inventory value
      inventoryValueCost += stock * cost;
      inventoryValueRetail += stock * p.price;

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
      inventoryValueCost,
      inventoryValueRetail,
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
    <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [&>*]:min-w-[44%] [&>*]:shrink-0 [&>*]:snap-start md:mx-0 md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:px-0 md:pb-0 md:[&>*]:min-w-0 xl:grid-cols-4">
      {/* Card 2: Inventory Value */}
      <div className={cn("pastel-card border border-[var(--card-border)] p-4")}>
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-[var(--background)] flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-teal-600 dark:text-teal-400" />
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

      {/* Card 4: Revenue (30d) */}
      <button
        type="button"
        onClick={onDrillDown ? () => onDrillDown("revenue") : undefined}
        disabled={!onDrillDown}
        className={cn(
          // A button centres its content vertically; keep it top-aligned like the other cards.
          "pastel-card border border-[var(--card-border)] p-4 text-start flex flex-col justify-start",
          onDrillDown && "hover:shadow-md transition-shadow cursor-pointer"
        )}
      >
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-[var(--background)] flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
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
      <div className={cn("pastel-card border border-[var(--card-border)] p-4")}>
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-[var(--background)] flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-blue-600 dark:text-blue-400" />
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
      <div className={cn("pastel-card border border-[var(--card-border)] p-4")}>
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-[var(--background)] flex items-center justify-center">
            <Activity className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
        <p className="text-2xl font-bold mt-3 tabular-nums">
          {totalGraded > 0 ? Math.round(((stats.gradeCounts.A + stats.gradeCounts.B) / totalGraded) * 100) : 0}%
        </p>
        <p className="text-xs text-muted">
          {t("products.forecast.healthyShare")}
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
        <p className="mt-1.5 flex flex-wrap gap-x-2 text-xs text-muted tabular-nums">
          {(["A", "B", "C", "D", "F"] as const).map((g) => (
            <span key={g}>
              {g} {stats.gradeCounts[g]}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
