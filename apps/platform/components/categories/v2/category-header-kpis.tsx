"use client";

import { useMemo } from "react";
import {
  FolderTree,
  EyeOff,
  Layers,
  AlertCircle,
  Sparkles,
  CalendarClock,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { Category } from "@scheniders/shared";
import { MiniSparkline } from "@/components/ui/mini-sparkline";

interface CategoryHeaderKpisProps {
  categories: Category[];
  productCategoryCounts: Record<string, number>;
  uncategorizedCount?: number;
  totalProducts?: number;
  revenueSeries?: Record<string, number[]>;
}

export function CategoryHeaderKpis({
  categories,
  productCategoryCounts,
  uncategorizedCount = 0,
  totalProducts = 0,
}: CategoryHeaderKpisProps) {
  const { t } = useLanguage();

  const stats = useMemo(() => {
    const now = Date.now();
    let published = 0;
    let draft = 0;
    let archived = 0;
    let hiddenFromNav = 0;
    let scheduled = 0;
    let topLevel = 0;
    let emptyCats = 0;
    let websiteCats = 0;
    let storeCats = 0;

    for (const c of categories) {
      if (c.status === "published") published++;
      else if (c.status === "draft") draft++;
      else if (c.status === "archived") archived++;

      if (!c.show_in_main_nav && c.status !== "archived") hiddenFromNav++;

      const pubAt = c.published_at ? new Date(c.published_at).getTime() : null;
      const unpubAt = c.unpublish_at ? new Date(c.unpublish_at).getTime() : null;
      if ((pubAt && pubAt > now) || (unpubAt && unpubAt > now)) scheduled++;

      if (c.status !== "archived") {
        // "both" counts on each side: it genuinely serves both audiences, so
        // reporting it as neither would understate both numbers.
        if (c.scope !== "internal") websiteCats++;
        if (c.scope !== "website") storeCats++;
      }

      if (!c.parent_id) topLevel++;
      if ((productCategoryCounts[c.id] ?? 0) === 0 && c.status !== "archived")
        emptyCats++;
    }

    const coverage =
      totalProducts > 0
        ? Math.round(((totalProducts - uncategorizedCount) / totalProducts) * 100)
        : 100;

    return {
      published,
      draft,
      archived,
      hiddenFromNav,
      scheduled,
      topLevel,
      emptyCats,
      websiteCats,
      storeCats,
      coverage,
    };
  }, [categories, productCategoryCounts, uncategorizedCount, totalProducts]);

  const cards: Array<{
    key: string;
    tone: string;
    icon: React.ComponentType<{ className?: string }>;
    iconTone: string;
    value: React.ReactNode;
    label: string;
    sub: React.ReactNode;
    spark?: number[];
    sparkColor?: string;
  }> = [
    {
      key: "total",
      tone: "pastel-card pastel-card-yellow",
      icon: FolderTree,
      iconTone: "text-amber-600 dark:text-amber-300",
      value: categories.filter((c) => c.status !== "archived").length,
      label: t("categories.kpi.total") || "Categories",
      sub: `${stats.topLevel} ${t("categories.kpi.topLevel") || "top-level"} · ${stats.published} ${t("categories.kpi.published") || "published"}`,
    },
    {
      key: "scope",
      tone: "pastel-card pastel-card-blue",
      icon: Globe,
      iconTone: "text-sky-600 dark:text-sky-300",
      value: stats.websiteCats,
      label: t("categories.kpi.onWebsite") || "On the website",
      sub: `${stats.storeCats} ${t("categories.kpi.inStore") || "for the store"}`,
    },
    {
      key: "coverage",
      tone: "pastel-card pastel-card-green",
      icon: Layers,
      iconTone: "text-emerald-600 dark:text-emerald-300",
      value: `${stats.coverage}%`,
      label: t("categories.kpi.coverage") || "Coverage",
      sub: `${totalProducts - uncategorizedCount}/${totalProducts} ${t("categories.kpi.assigned") || "assigned"}`,
    },
    {
      key: "uncategorized",
      tone: "pastel-card pastel-card-pink",
      icon: AlertCircle,
      iconTone: "text-rose-600 dark:text-rose-300",
      value: uncategorizedCount,
      label: t("categories.kpi.uncategorized") || "Uncategorized",
      sub: t("categories.kpi.needsTriage") || "needs triage",
    },
    {
      key: "hidden",
      tone: "pastel-card pastel-card-blue",
      icon: EyeOff,
      iconTone: "text-blue-600 dark:text-blue-300",
      value: stats.hiddenFromNav,
      label: t("categories.kpi.hiddenFromNav") || "Hidden from nav",
      sub: `${stats.draft} ${t("categories.kpi.drafts") || "drafts"}`,
    },
    {
      key: "scheduled",
      tone: "pastel-card pastel-card-mint",
      icon: CalendarClock,
      iconTone: "text-teal-600 dark:text-teal-300",
      value: stats.scheduled,
      label: t("categories.kpi.scheduled") || "Scheduled",
      sub: t("categories.kpi.upcoming") || "upcoming",
    },
    {
      key: "empty",
      tone: "pastel-card pastel-card-purple",
      icon: Sparkles,
      iconTone: "text-violet-600 dark:text-violet-300",
      value: stats.emptyCats,
      label: t("categories.kpi.empty") || "Empty categories",
      sub: t("categories.kpi.noProducts") || "no products assigned",
    },
  ];

  // One row of seven compact tiles on desktop, so no tile sits alone on a
  // second row and the category list starts higher.
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {cards.map((c) => {
        const body = (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="w-8 h-8 shrink-0 rounded-lg bg-white/50 dark:bg-white/10 flex items-center justify-center">
                <c.icon className={cn("w-4 h-4", c.iconTone)} />
              </div>
              {c.spark && c.spark.length > 1 && (
                <MiniSparkline data={c.spark} color={c.sparkColor} />
              )}
            </div>
            <p className="text-xl font-bold mt-2 tabular-nums">{c.value}</p>
            <p className="text-xs text-muted truncate">{c.label}</p>
            <p className="text-[11px] text-muted mt-0.5 truncate">{c.sub}</p>
          </>
        );
        return (
          <div key={c.key} className={cn(c.tone, "p-3 text-start min-w-0")}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
