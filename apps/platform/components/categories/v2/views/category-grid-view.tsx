"use client";

import Image from "next/image";
import { Eye, EyeOff, Pencil, MoreHorizontal, Folder } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { Category, CategoryScope } from "@scheniders/shared";
import { MiniSparkline } from "@/components/ui/mini-sparkline";
import { useCategoryStore } from "@/store/use-category-store";
import { CategoryScopeControl } from "@/components/products/category-scope-control";

interface CategoryGridViewProps {
  categories: Category[];
  productCountMap: Record<string, number>;
  /** Write controls render only when their handler is passed (read-only users get none). */
  onEdit?: (c: Category) => void;
  onToggleVisibility?: (c: Category) => void;
  onScopeChange?: (c: Category, scope: CategoryScope) => void;
  onOpenDetail?: (c: Category) => void;
  selectable?: boolean;
}

export function CategoryGridView({
  categories,
  productCountMap,
  onEdit,
  onToggleVisibility,
  onScopeChange,
  onOpenDetail,
  selectable = false,
}: CategoryGridViewProps) {
  const { t } = useLanguage();
  const selectedIds = useCategoryStore((s) => s.selectedIds);
  const toggleSelected = useCategoryStore((s) => s.toggleSelected);
  const selectedSet = new Set(selectedIds);

  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--card-border)] p-12 text-center text-muted">
        No categories match your filters.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {categories.map((c) => {
        const selected = selectedSet.has(c.id);
        const count = productCountMap[c.id] ?? 0;
        const visible = c.is_visible && c.status !== "archived";
        return (
          <motion.div
            key={c.id}
            layout
            className={cn(
              "group relative rounded-2xl border overflow-hidden transition-all",
              selected
                ? "border-[var(--ink)] ring-2 ring-[var(--ink)]/30"
                : "border-[var(--card-border)] hover:border-[var(--ink)]/40",
              c.status === "archived" && "opacity-60",
            )}
          >
            <button
              type="button"
              onClick={() => onOpenDetail?.(c)}
              className="block w-full text-left"
            >
              <div
                className="relative h-28 w-full"
                style={{
                  backgroundColor: c.accent_color ?? "var(--pastel-yellow)",
                }}
              >
                {c.banner_url ? (
                  <Image
                    src={c.banner_url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 25vw"
                  />
                ) : c.image_url ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Image
                      src={c.image_url}
                      alt=""
                      width={80}
                      height={80}
                      className="rounded-xl object-cover"
                    />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    {c.icon ? (
                      <span className="text-4xl">{c.icon}</span>
                    ) : (
                      <Folder className="w-10 h-10 text-[var(--ink)]/40" />
                    )}
                  </div>
                )}
                <div className="absolute top-2 end-2 flex gap-1">
                  {c.status === "draft" && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">
                      {t("categories.status.draft") || "Draft"}
                    </span>
                  )}
                  {c.show_in_main_nav && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/80 text-[var(--ink)]">
                      Nav
                    </span>
                  )}
                </div>
                {selectable && (
                <label
                  className="absolute top-2 start-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelected(c.id)}
                    className="w-4 h-4 rounded border-white/60 text-[var(--ink)]"
                  />
                </label>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-xs text-muted truncate">
                      /{c.slug}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted">
                  <span>
                    {count} {count === 1 ? "product" : "products"}
                  </span>
                </div>
              </div>
            </button>

            {(onScopeChange || onToggleVisibility || onEdit) && (
            <div className="absolute bottom-2 end-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onScopeChange && (
              <CategoryScopeControl
                value={c.scope ?? "both"}
                onChange={(next) => onScopeChange(c, next)}
              />
              )}
              {onToggleVisibility && (
              <button
                type="button"
                onClick={() => onToggleVisibility(c)}
                className="p-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-muted hover:text-foreground"
                title={visible ? "Hide" : "Show"}
              >
                {visible ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
              </button>
              )}
              {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(c)}
                className="p-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-muted hover:text-foreground"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              )}
            </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
