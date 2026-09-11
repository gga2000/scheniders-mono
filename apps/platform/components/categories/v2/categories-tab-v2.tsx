"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Undo2 } from "lucide-react";
import Fuse from "fuse.js";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import {
  useCategoriesQuery,
  useAddCategoryMutation,
  useUpdateCategoryMutation,
  useArchiveCategoryMutation,
  useRestoreCategoryMutation,
  useDeleteCategoryMutation,
  useDuplicateCategoryMutation,
  useReorderCategoriesMutation,
  type ReorderEntry,
} from "@/hooks/use-categories-query";
import { useProductsCrud } from "@/hooks/use-products-crud";
import { useCategoryStore } from "@/store/use-category-store";
import type { Category, CategoryScope} from "@scheniders/shared";
import { PageTransition } from "@/components/layout/page-transition";
import {
  CategoryFormModal,
  type CategoryFormData,
} from "@/components/categories/category-form-modal";
import { CategoryHeaderKpis } from "./category-header-kpis";
import { CategoryFiltersBar } from "./category-filters-bar";
import { CategoryBulkActionsBar } from "./category-bulk-actions-bar";
import { CategoryTreeView } from "./views/category-tree-view";
import { CategoryGridView } from "./views/category-grid-view";

export function CategoriesTabV2() {
  const { t } = useLanguage();
  const { data: categories = [], isLoading } = useCategoriesQuery({
    includeArchived: true,
  });
  const { products } = useProductsCrud();

  const addMutation = useAddCategoryMutation();
  const updateMutation = useUpdateCategoryMutation();
  const archiveMutation = useArchiveCategoryMutation();
  const restoreMutation = useRestoreCategoryMutation();
  const deleteMutation = useDeleteCategoryMutation();
  const duplicateMutation = useDuplicateCategoryMutation();
  const reorderMutation = useReorderCategoriesMutation();

  const viewMode = useCategoryStore((s) => s.viewMode);
  const filters = useCategoryStore((s) => s.filters);
  const setFilter = useCategoryStore((s) => s.setFilter);
  const selectedIds = useCategoryStore((s) => s.selectedIds);
  const clearSelection = useCategoryStore((s) => s.clearSelection);
  const setSelected = useCategoryStore((s) => s.setSelected);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [lastArchivedIds, setLastArchivedIds] = useState<string[]>([]);
  const [undoTimeLeft, setUndoTimeLeft] = useState(0);
  const undoTickRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const UNDO_TIMEOUT_MS = 8000;

  const clearUndoTimers = useCallback(() => {
    if (undoTickRef.current) clearInterval(undoTickRef.current);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTickRef.current = undefined;
    undoTimeoutRef.current = undefined;
  }, []);

  const startUndoCountdown = useCallback(() => {
    clearUndoTimers();
    setUndoTimeLeft(UNDO_TIMEOUT_MS);
    undoTickRef.current = setInterval(() => {
      setUndoTimeLeft((t) => Math.max(0, t - 100));
    }, 100);
    undoTimeoutRef.current = setTimeout(() => {
      clearUndoTimers();
      setUndoTimeLeft(0);
      setLastArchivedIds([]);
    }, UNDO_TIMEOUT_MS);
  }, [clearUndoTimers]);

  useEffect(() => {
    return () => {
      clearUndoTimers();
    };
  }, [clearUndoTimers]);

  const productCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) {
      if (p.category_id) map[p.category_id] = (map[p.category_id] ?? 0) + 1;
    }
    return map;
  }, [products]);

  const uncategorizedCount = useMemo(
    () => products.filter((p) => !p.category_id && !p.is_archived).length,
    [products],
  );

  const fuse = useMemo(
    () =>
      new Fuse(categories, {
        keys: ["name", "slug", "description", "name_ar", "name_en"],
        threshold: 0.3,
        ignoreLocation: true,
      }),
    [categories],
  );

  const filtered = useMemo(() => {
    let list = categories;

    // Status
    list = list.filter((c) => filters.statuses.includes(c.status));

    if (filters.navOnly) list = list.filter((c) => c.show_in_main_nav);
    // "both" categories answer to either audience, so they survive a website or
    // store filter — hiding them would misrepresent what the storefront shows.
    if (filters.scope === "website") list = list.filter((c) => c.scope !== "internal");
    else if (filters.scope === "internal") list = list.filter((c) => c.scope !== "website");
    else if (filters.scope === "both") list = list.filter((c) => c.scope === "both");
    if (filters.parent === "top-level") list = list.filter((c) => !c.parent_id);
    else if (filters.parent === "sub") list = list.filter((c) => !!c.parent_id);

    if (filters.searchQuery.trim().length > 0) {
      const matched = fuse.search(filters.searchQuery.trim()).map((r) => r.item);
      const allowed = new Set(matched.map((c) => c.id));
      list = list.filter((c) => allowed.has(c.id));
    }

    return list;
  }, [categories, filters, fuse]);

  const openNew = useCallback(() => {
    setEditingCategory(null);
    setModalMode("add");
    setIsModalOpen(true);
  }, []);

  const openEdit = useCallback((c: Category) => {
    setEditingCategory(c);
    setModalMode("edit");
    setIsModalOpen(true);
  }, []);

  const handleSubmit = useCallback(
    async (data: CategoryFormData) => {
      if (modalMode === "add") {
        await addMutation.mutateAsync(data);
        toast.success(t("categories.toast.created") || "Category created");
      } else if (editingCategory) {
        await updateMutation.mutateAsync({
          id: editingCategory.id,
          data: data as unknown as Partial<Category>,
        });
        toast.success(t("categories.toast.updated") || "Category updated");
      }
    },
    [addMutation, updateMutation, modalMode, editingCategory, t],
  );

  const handleArchive = useCallback(
    async (c: Category) => {
      await archiveMutation.mutateAsync(c.id);
      setLastArchivedIds([c.id]);
      startUndoCountdown();
      toast.success(t("categories.toast.archived") || "Category archived");
    },
    [archiveMutation, startUndoCountdown, t],
  );

  const handleRestore = useCallback(
    async (c: Category) => {
      await restoreMutation.mutateAsync(c.id);
      toast.success(t("categories.toast.restored") || "Category restored");
    },
    [restoreMutation, t],
  );

  const handleDelete = useCallback(
    async (c: Category) => {
      if (productCountMap[c.id] && productCountMap[c.id] > 0) {
        toast.error(
          t("categories.error.hasProducts") ||
            "Cannot delete a category with products assigned. Archive instead.",
        );
        return;
      }
      if (
        !confirm(
          t("categories.confirm.delete") ||
            `Delete "${c.name}"? This cannot be undone.`,
        )
      ) {
        return;
      }
      await deleteMutation.mutateAsync(c.id);
      toast.success(t("categories.toast.deleted") || "Category deleted");
    },
    [deleteMutation, productCountMap, t],
  );

  const handleDuplicate = useCallback(
    async (c: Category) => {
      await duplicateMutation.mutateAsync({ id: c.id, withProducts: false });
      toast.success(t("categories.toast.duplicated") || "Category duplicated");
    },
    [duplicateMutation, t],
  );

  // Scope is a one-field write, so it commits on click instead of making the
  // merchant open the edit sheet to change who a category is for.
  const handleScopeChange = useCallback(
    async (c: Category, scope: CategoryScope) => {
      await updateMutation.mutateAsync({
        id: c.id,
        data: { scope } as Partial<Category>,
      });
    },
    [updateMutation],
  );

  const handleToggleVisibility = useCallback(
    async (c: Category) => {
      await updateMutation.mutateAsync({
        id: c.id,
        data: { is_visible: !c.is_visible } as Partial<Category>,
      });
    },
    [updateMutation],
  );

  const handleReorder = useCallback(
    (entries: ReorderEntry[]) => {
      reorderMutation.mutate(entries, {
        onError: () =>
          toast.error(t("categories.error.reorder") || "Reorder failed"),
      });
    },
    [reorderMutation, t],
  );

  const handleBulkArchive = useCallback(async () => {
    const ids = [...selectedIds];
    await Promise.all(ids.map((id) => archiveMutation.mutateAsync(id)));
    setLastArchivedIds(ids);
    clearSelection();
    startUndoCountdown();
    toast.success(
      (t("categories.toast.bulkArchived") || "Archived") + ` (${ids.length})`,
    );
  }, [selectedIds, archiveMutation, clearSelection, startUndoCountdown, t]);

  const handleBulkRestore = useCallback(async () => {
    const ids = [...selectedIds];
    await Promise.all(ids.map((id) => restoreMutation.mutateAsync(id)));
    clearSelection();
    toast.success(
      (t("categories.toast.bulkRestored") || "Restored") + ` (${ids.length})`,
    );
  }, [selectedIds, restoreMutation, clearSelection, t]);

  const handleBulkToggleNav = useCallback(
    async (show: boolean) => {
      const ids = [...selectedIds];
      await Promise.all(
        ids.map((id) =>
          updateMutation.mutateAsync({
            id,
            data: { show_in_main_nav: show } as Partial<Category>,
          }),
        ),
      );
      clearSelection();
      toast.success(
        show
          ? t("categories.toast.bulkShowNav") || "Shown in nav"
          : t("categories.toast.bulkHideNav") || "Hidden from nav",
      );
    },
    [selectedIds, updateMutation, clearSelection, t],
  );

  const handleUndoArchive = useCallback(async () => {
    if (lastArchivedIds.length === 0) return;
    clearUndoTimers();
    setUndoTimeLeft(0);
    await Promise.all(lastArchivedIds.map((id) => restoreMutation.mutateAsync(id)));
    setLastArchivedIds([]);
    toast.success(t("categories.toast.undoArchive") || "Restored");
  }, [lastArchivedIds, restoreMutation, clearUndoTimers, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inForm =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inForm && e.key !== "Escape") return;

      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openNew();
      } else if (e.key === "/") {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>(
          "input[data-shortcut-target='category-search']",
        );
        el?.focus();
      } else if (e.key === "Escape" && selectedIds.length > 0) {
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNew, selectedIds.length, clearSelection]);

  return (
    <PageTransition>
      <div className="space-y-4">
        <CategoryHeaderKpis
          categories={categories}
          productCategoryCounts={productCountMap}
          uncategorizedCount={uncategorizedCount}
          totalProducts={products.length}
          onDrill={(target) => {
            if (target === "scheduled") {
              // no-op placeholder — detail drawer in P6
            }
          }}
        />

        <CategoryFiltersBar onNewCategory={openNew} />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[var(--pastel-yellow)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : viewMode === "grid" ? (
          <CategoryGridView
            categories={filtered}
            productCountMap={productCountMap}
            onEdit={openEdit}
            onToggleVisibility={handleToggleVisibility}
            onScopeChange={handleScopeChange}
          />
        ) : viewMode === "tree" ? (
          <CategoryTreeView
            categories={filtered}
            productCountMap={productCountMap}
            onEdit={openEdit}
            onDuplicate={handleDuplicate}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onToggleVisibility={handleToggleVisibility}
            onScopeChange={handleScopeChange}
            onReorder={handleReorder}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--card-border)] p-12 text-center text-muted">
            Mega-menu preview — coming in Phase 5.
          </div>
        )}

        <CategoryBulkActionsBar
          selectedCount={selectedIds.length}
          totalCount={filtered.length}
          onArchive={handleBulkArchive}
          onRestore={handleBulkRestore}
          onToggleNav={handleBulkToggleNav}
          onClear={clearSelection}
          onUndo={lastArchivedIds.length > 0 ? handleUndoArchive : undefined}
        />

        <AnimatePresence>
          {lastArchivedIds.length > 0 && undoTimeLeft > 0 && (
            <motion.div
              key="bulk-undo-pill"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 28 }}
              className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50"
            >
              <button
                type="button"
                onClick={handleUndoArchive}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--ink)] text-white text-xs font-medium shadow-md"
              >
                <Undo2 className="w-3.5 h-3.5" />
                {t("categories.bulk.undoArchive") || "Undo archive"}
                <span className="opacity-70">
                  ({Math.ceil(undoTimeLeft / 1000)}s)
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <CategoryFormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleSubmit}
          category={editingCategory}
          categories={categories}
          mode={modalMode}
        />
      </div>
    </PageTransition>
  );
}
