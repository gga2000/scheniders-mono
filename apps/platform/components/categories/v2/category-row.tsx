"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Copy,
  Archive,
  Trash2,
  MoreHorizontal,
  Sparkles,
  AlertCircle,
  GripVertical,
  Store,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryScopeControl } from "@/components/products/category-scope-control";
import { useLanguage } from "@/hooks/use-language";
import type { Category, CategoryScope } from "@scheniders/shared";
import { MiniSparkline } from "@/components/ui/mini-sparkline";

export interface CategoryRowProps {
  category: Category;
  depth?: number;
  hasChildren?: boolean;
  expanded?: boolean;
  onToggleExpand?: (id: string) => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  productCount?: number;
  revenueSeries?: number[];
  healthGrade?: "A" | "B" | "C" | "D" | "F";
  onEdit?: (c: Category) => void;
  onDuplicate?: (c: Category) => void;
  onArchive?: (c: Category) => void;
  onDelete?: (c: Category) => void;
  onToggleVisibility?: (c: Category) => void;
  onScopeChange?: (c: Category, scope: CategoryScope) => void;
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
  onOpenDetail?: (c: Category) => void;
}

const GRADE_TONE: Record<"A" | "B" | "C" | "D" | "F", string> = {
  A: "bg-emerald-100 text-emerald-700 border-emerald-200",
  B: "bg-blue-100 text-blue-700 border-blue-200",
  C: "bg-amber-100 text-amber-700 border-amber-200",
  D: "bg-orange-100 text-orange-700 border-orange-200",
  F: "bg-rose-100 text-rose-700 border-rose-200",
};

export function CategoryRow({
  category,
  depth = 0,
  hasChildren,
  expanded,
  onToggleExpand,
  selected,
  onToggleSelect,
  productCount = 0,
  revenueSeries,
  healthGrade,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  onToggleVisibility,
  onScopeChange,
  dragHandleProps,
  isDragging,
  onOpenDetail,
}: CategoryRowProps) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  const visible = category.is_visible && category.status !== "archived";
  const scheduled =
    (category.published_at && new Date(category.published_at).getTime() > Date.now()) ||
    (category.unpublish_at && new Date(category.unpublish_at).getTime() > Date.now());
  const missingSeo = !category.meta_title || !category.meta_description;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all",
        selected
          ? "border-[var(--ink)] bg-[var(--pastel-yellow)]/20"
          : "border-transparent hover:border-[var(--card-border)] hover:bg-[var(--background)]",
        isDragging && "opacity-60 ring-2 ring-[var(--ink)]",
        category.status === "archived" && "opacity-60",
      )}
      style={{ paddingInlineStart: `${depth * 20 + 12}px` }}
    >
      {/* Drag handle */}
      {dragHandleProps && (
        <button
          {...(dragHandleProps as any)}
          className="shrink-0 cursor-grab active:cursor-grabbing text-muted hover:text-foreground"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}

      {/* Checkbox */}
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={() => onToggleSelect(category.id)}
          className="shrink-0 w-4 h-4 rounded border-[var(--card-border)] text-[var(--ink)] focus:ring-[var(--ink)]"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Expand chevron */}
      <button
        type="button"
        onClick={() => hasChildren && onToggleExpand?.(category.id)}
        className={cn(
          "shrink-0 w-5 h-5 flex items-center justify-center rounded transition-transform",
          !hasChildren && "invisible",
          expanded && "rotate-90",
        )}
      >
        <ChevronRight className="w-4 h-4 text-muted" />
      </button>

      {/* Icon / banner swatch */}
      <div
        className="shrink-0 w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center border border-[var(--card-border)]"
        style={{
          backgroundColor: category.accent_color ?? "var(--pastel-yellow)",
        }}
      >
        {category.image_url ? (
          <Image
            src={category.image_url}
            alt=""
            width={36}
            height={36}
            className="object-cover w-full h-full"
          />
        ) : category.icon ? (
          <span className="text-lg">{category.icon}</span>
        ) : (
          <span className="text-xs font-bold text-[var(--ink)]">
            {category.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      {/* Name + slug */}
      <button
        type="button"
        onClick={() => onOpenDetail?.(category)}
        className="flex-1 min-w-0 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{category.name}</span>
          {category.status === "draft" && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
              {t("categories.status.draft") || "Draft"}
            </span>
          )}
          {category.status === "archived" && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-700">
              {t("categories.status.archived") || "Archived"}
            </span>
          )}
          {scheduled && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-100 text-teal-700"
              title={
                category.published_at
                  ? `Publishes ${new Date(category.published_at).toLocaleString()}`
                  : ""
              }
            >
              {t("categories.scheduled") || "Scheduled"}
            </span>
          )}
          {category.scope === "internal" && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700"
              title={t("categories.scope.internalHint") || undefined}
            >
              <Store className="w-2.5 h-2.5" />
              {t("categories.scope.internal") || "Store only"}
            </span>
          )}
          {category.scope === "website" && (
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 text-sky-700"
              title={t("categories.scope.websiteHint") || undefined}
            >
              <Globe className="w-2.5 h-2.5" />
              {t("categories.scope.website") || "Website"}
            </span>
          )}
          {missingSeo && category.status === "published" && (
            <AlertCircle
              className="w-3.5 h-3.5 text-amber-600 shrink-0"
              aria-label="Missing SEO metadata"
            />
          )}
        </div>
        <div className="text-xs text-muted truncate">/{category.slug}</div>
      </button>

      {/* Sparkline */}
      {revenueSeries && revenueSeries.length > 1 && (
        <div className="hidden md:flex shrink-0">
          <MiniSparkline data={revenueSeries} color="#0d9488" width={64} height={22} />
        </div>
      )}

      {/* Health grade */}
      {healthGrade && (
        <span
          className={cn(
            "hidden md:inline-flex shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border",
            GRADE_TONE[healthGrade],
          )}
        >
          {healthGrade}
        </span>
      )}

      {/* Product count */}
      <div className="shrink-0 text-xs text-muted min-w-[56px] text-right">
        {productCount}{" "}
        <span className="hidden sm:inline">
          {productCount === 1
            ? t("categories.product") || "product"
            : t("categories.products") || "products"}
        </span>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {onScopeChange && (
          <CategoryScopeControl
            value={category.scope ?? "both"}
            onChange={(next) => onScopeChange(category, next)}
            className="hidden lg:flex"
          />
        )}
        {onToggleVisibility && (
          <button
            type="button"
            onClick={() => onToggleVisibility(category)}
            className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground"
            title={visible ? "Hide" : "Show"}
          >
            {visible ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
          </button>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(category)}
            className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground"
            title="Edit"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted hover:text-foreground"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute end-0 mt-1 w-44 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-lg z-40 overflow-hidden">
                {onDuplicate && (
                  <MenuItem
                    icon={Copy}
                    label={t("common.duplicate") || "Duplicate"}
                    onClick={() => {
                      setMenuOpen(false);
                      onDuplicate(category);
                    }}
                  />
                )}
                {onArchive && category.status !== "archived" && (
                  <MenuItem
                    icon={Archive}
                    label={t("common.archive") || "Archive"}
                    onClick={() => {
                      setMenuOpen(false);
                      onArchive(category);
                    }}
                  />
                )}
                {onDelete && (
                  <MenuItem
                    icon={Trash2}
                    tone="rose"
                    label={t("common.delete") || "Delete"}
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(category);
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: "default" | "rose";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--background)] transition-colors text-start",
        tone === "rose" && "text-rose-700",
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
