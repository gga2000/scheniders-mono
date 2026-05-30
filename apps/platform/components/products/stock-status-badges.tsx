"use client";

import React from "react";
import {
  Moon,
  TrendingDown,
  Package,
  AlertTriangle,
  Tag,
  Layers,
  Archive,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { Tooltip } from "@/components/ui/tooltip";
import type { ProductScore } from "@/lib/utils/product-scoring";

interface StockStatusBadgesProps {
  flags: ProductScore["flags"];
  dailySalesRate: number;
  daysSinceLastSale: number;
  daysOfSupply: number;
  availableStock?: number;
  size?: "sm" | "md";
  showActions?: boolean;
}

interface BadgeConfig {
  key: string;
  show: boolean;
  bg: string;
  icon: React.ReactNode;
  label: string;
}

const sizeClasses = {
  sm: "text-[10px] px-1.5 py-0.5",
  md: "text-xs px-2 py-0.5",
} as const;

export const StockStatusBadges = React.memo(function StockStatusBadges({
  flags,
  dailySalesRate,
  daysSinceLastSale,
  daysOfSupply,
  availableStock,
  size = "md",
  showActions = true,
}: StockStatusBadgesProps) {
  const { t } = useLanguage();

  const iconSize = "w-3 h-3";
  const isOutOfStock = availableStock !== undefined && availableStock <= 0;
  const neverSold = !Number.isFinite(daysSinceLastSale);
  const deadSuffix = neverSold
    ? t("products.status.neverSold")
    : `${daysSinceLastSale}d`;
  const supplySuffix = Number.isFinite(daysOfSupply) ? `${daysOfSupply}d` : "—";

  const badges: BadgeConfig[] = [
    {
      key: "outOfStock",
      show: isOutOfStock,
      bg: "bg-rose-500/15 text-rose-700 border border-rose-500/30",
      icon: <XCircle className={iconSize} />,
      label: t("products.status.outOfStock"),
    },
    {
      key: "deadStock",
      show: flags.isDeadStock,
      bg: "bg-rose-500/10 text-rose-700 border border-rose-500/20",
      icon: <Moon className={iconSize} />,
      label: `${t("products.status.deadStock")} · ${deadSuffix}`,
    },
    {
      key: "slowMover",
      show: flags.isSlowMover && !flags.isDeadStock,
      bg: "bg-orange-500/10 text-orange-700 border border-orange-500/20",
      icon: <TrendingDown className={iconSize} />,
      label: `${t("products.status.slowMover")} · ${(dailySalesRate * 7).toFixed(1)}/wk`,
    },
    {
      key: "overstock",
      show: flags.isOverstocked,
      bg: "bg-blue-500/10 text-blue-700 border border-blue-500/20",
      icon: <Package className={iconSize} />,
      label: `${t("products.status.overstock")} · ${supplySuffix}`,
    },
    {
      key: "understock",
      show: flags.isUnderstocked,
      bg: "bg-amber-500/10 text-amber-700 border border-amber-500/20",
      icon: <AlertTriangle className={iconSize} />,
      label: `${t("products.status.understock")} · ${supplySuffix} ${t("products.status.leftSuffix")}`,
    },
    {
      key: "negativeMargin",
      show: flags.isNegativeMargin,
      bg: "bg-rose-500/10 text-rose-700 border border-rose-500/20",
      icon: <TrendingDown className={iconSize} />,
      label: t("products.status.negativeMargin"),
    },
  ];

  const activeBadges = badges.filter((b) => b.show);

  if (activeBadges.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {activeBadges.map((badge) => {
        const withActions = showActions && (badge.key === "deadStock" || badge.key === "slowMover");
        if (!withActions) {
          return (
            <span
              key={badge.key}
              className={cn(
                "inline-flex items-center gap-1 rounded-md font-medium",
                sizeClasses[size],
                badge.bg
              )}
            >
              {badge.icon}
              {badge.label}
            </span>
          );
        }
        const actions = badge.key === "deadStock"
          ? [
              { icon: <Tag className="w-3 h-3" />, label: t("products.status.actions.discount") },
              { icon: <Layers className="w-3 h-3" />, label: t("products.status.actions.bundle") },
              { icon: <Archive className="w-3 h-3" />, label: t("products.status.actions.archive") },
            ]
          : [
              { icon: <Tag className="w-3 h-3" />, label: t("products.status.actions.promote") },
              { icon: <Tag className="w-3 h-3" />, label: t("products.status.actions.discount") },
              { icon: <Tag className="w-3 h-3" />, label: t("products.status.actions.reviewPricing") },
            ];
        const tooltipContent = (
          <div className="w-44">
            <div className="mb-1 font-semibold opacity-70">
              {t("products.status.actions.heading")}
            </div>
            <ul className="space-y-1">
              {actions.map((a, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  {a.icon}
                  <span>{a.label}</span>
                </li>
              ))}
            </ul>
          </div>
        );
        return (
          <Tooltip
            key={badge.key}
            content={tooltipContent}
            side="bottom"
            align="start"
            contentClassName="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-2 text-[11px] text-foreground shadow-lg"
          >
            <span
              tabIndex={0}
              className={cn(
                "inline-flex items-center gap-1 rounded-md font-medium cursor-help",
                sizeClasses[size],
                badge.bg
              )}
            >
              {badge.icon}
              {badge.label}
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
});
