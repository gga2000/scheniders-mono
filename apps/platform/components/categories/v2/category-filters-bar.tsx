"use client";

import { Search, X, Grid3X3, ListTree, LayoutGrid, Keyboard, Store, Globe, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { ViewSwitcher } from "@/components/ui/view-switcher";
import {
  useCategoryStore,
  type CategoryViewMode,
} from "@/store/use-category-store";
import type { CategoryStatus } from "@scheniders/shared";

interface CategoryFiltersBarProps {
  onNewCategory: () => void;
  onOpenShortcuts?: () => void;
}

// Who the category is for. Each chip carries an icon as well as a colour, so
// the distinction never rests on colour alone.
const SCOPE_CHIPS: {
  value: "internal" | "website" | "both";
  icon: typeof Store;
  labelKey: string;
  fallback: string;
  tone: string;
}[] = [
  { value: "website", icon: Globe, labelKey: "categories.scope.website", fallback: "Website", tone: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "internal", icon: Store, labelKey: "categories.scope.internal", fallback: "Store", tone: "bg-violet-50 text-violet-700 border-violet-200" },
  { value: "both", icon: Layers, labelKey: "categories.scope.both", fallback: "Both", tone: "bg-slate-100 text-slate-700 border-slate-300" },
];

const STATUS_CHIPS: { value: CategoryStatus; label: string; tone: string }[] = [
  { value: "published", label: "Published", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "draft", label: "Draft", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "archived", label: "Archived", tone: "bg-gray-100 text-gray-600 border-gray-300" },
];

export function CategoryFiltersBar({
  onNewCategory,
  onOpenShortcuts,
}: CategoryFiltersBarProps) {
  const { t } = useLanguage();
  const viewMode = useCategoryStore((s) => s.viewMode);
  const setViewMode = useCategoryStore((s) => s.setViewMode);
  const filters = useCategoryStore((s) => s.filters);
  const setFilter = useCategoryStore((s) => s.setFilter);
  const resetFilters = useCategoryStore((s) => s.resetFilters);

  const toggleStatus = (status: CategoryStatus) => {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    setFilter("statuses", next.length > 0 ? next : ["published", "draft"]);
  };

  const hasActiveFilters =
    filters.searchQuery.length > 0 ||
    filters.navOnly ||
    filters.hasRules !== "all" ||
    filters.parent !== "all" ||
    filters.scope !== "all" ||
    filters.statuses.length !== 2 ||
    !filters.statuses.includes("published") ||
    !filters.statuses.includes("draft");

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[240px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <input
          type="text"
          data-shortcut-target="category-search"
          value={filters.searchQuery}
          onChange={(e) => setFilter("searchQuery", e.target.value)}
          placeholder={
            t("categories.search.placeholder") ||
            "Search categories, slugs, SKUs…"
          }
          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[var(--background)] border border-[var(--card-border)] focus:outline-none focus:border-[var(--ink)] transition-colors text-sm"
        />
        {filters.searchQuery.length > 0 && (
          <button
            type="button"
            onClick={() => setFilter("searchQuery", "")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Status chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUS_CHIPS.map((chip) => {
          const active = filters.statuses.includes(chip.value);
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => toggleStatus(chip.value)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                active
                  ? chip.tone
                  : "bg-transparent text-muted border-[var(--card-border)] hover:text-foreground",
              )}
            >
              {t(`categories.status.${chip.value}`) || chip.label}
            </button>
          );
        })}

        {/* Audience — who the category is for. A second click clears it, so the
            set is a filter rather than a mode you can get stuck in. */}
        <span className="w-px h-5 bg-[var(--card-border)] mx-1" aria-hidden="true" />
        {SCOPE_CHIPS.map((chip) => {
          const active = filters.scope === chip.value;
          const Icon = chip.icon;
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter("scope", active ? "all" : chip.value)}
              title={t(`${chip.labelKey}Hint`) || undefined}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                active
                  ? chip.tone
                  : "bg-transparent text-muted border-[var(--card-border)] hover:text-foreground",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(chip.labelKey) || chip.fallback}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setFilter("navOnly", !filters.navOnly)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
            filters.navOnly
              ? "bg-blue-50 text-blue-700 border-blue-200"
              : "bg-transparent text-muted border-[var(--card-border)] hover:text-foreground",
          )}
        >
          {t("categories.filter.navOnly") || "In main nav"}
        </button>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="px-2 py-1.5 rounded-full text-xs text-muted hover:text-foreground transition-colors"
          >
            {t("common.reset") || "Reset"}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 ms-auto">
        {onOpenShortcuts && (
          <button
            type="button"
            onClick={onOpenShortcuts}
            title={t("common.shortcuts") || "Keyboard shortcuts"}
            className="p-2 rounded-xl border border-[var(--card-border)] text-muted hover:text-foreground transition-colors"
          >
            <Keyboard className="w-4 h-4" />
          </button>
        )}

        <ViewSwitcher<CategoryViewMode>
          options={[
            { mode: "tree", icon: ListTree, label: t("categories.view.tree") || "Tree" },
            { mode: "grid", icon: Grid3X3, label: t("categories.view.grid") || "Grid" },
            { mode: "megamenu", icon: LayoutGrid, label: t("categories.view.megamenu") || "Mega-menu preview" },
          ]}
          value={viewMode}
          onChange={setViewMode}
        />

        <button
          type="button"
          onClick={onNewCategory}
          className="px-4 py-2.5 rounded-xl bg-[var(--ink)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + {t("categories.new") || "New category"}
        </button>
      </div>
    </div>
  );
}
