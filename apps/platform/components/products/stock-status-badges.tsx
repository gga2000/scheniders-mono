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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { ProductScore } from "@/lib/utils/product-scoring";

interface StockStatusBadgesProps {
  flags: ProductScore["flags"];
  dailySalesRate: number;
  daysSinceLastSale: number;
  daysOfSupply: number;
  size?: "sm" | "md";
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
  size = "md",
}: StockStatusBadgesProps) {
  const { t } = useLanguage();

  const iconSize = "w-3 h-3";

  const badges: BadgeConfig[] = [
    {
      key: "deadStock",
      show: flags.isDeadStock,
      bg: "bg-rose-500/10 text-rose-700 border border-rose-500/20",
      icon: <Moon className={iconSize} />,
      label: `${t("products.status.deadStock")} · ${daysSinceLastSale}d`,
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
      label: `${t("products.status.overstock")} · ${daysOfSupply}d`,
    },
    {
      key: "understock",
      show: flags.isUnderstocked,
      bg: "bg-amber-500/10 text-amber-700 border border-amber-500/20",
      icon: <AlertTriangle className={iconSize} />,
      label: `${t("products.status.understock")} · ${daysOfSupply}d left`,
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
        const withActions = badge.key === "deadStock" || badge.key === "slowMover";
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
        return (
          <span
            key={badge.key}
            className={cn(
              "group relative inline-flex items-center gap-1 rounded-md font-medium cursor-help",
              sizeClasses[size],
              badge.bg
            )}
          >
            {badge.icon}
            {badge.label}
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-44 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] p-2 text-[11px] text-foreground shadow-lg group-hover:block"
            >
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
            </span>
          </span>
        );
      })}
    </div>
  );
});
