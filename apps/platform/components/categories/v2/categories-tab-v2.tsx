"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Undo2 } from "lucide-react";
import Fuse from "fuse.js";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSIONS } from "@/lib/permissions";
import { categoryWriteErrorKey } from "@/lib/product-write-error";
import {
  useCategoriesQuery,
  useCategoryMembershipsQuery,
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
import type { Category, CategoryScope } from "@scheniders/shared";
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
  const { data: memberships = [], isSuccess: membershipsReady } = useCategoryMembershipsQuery();

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

  // A category holds the products that point at it plus its curated members
  // (product_categories), the same set the storefront shows on its page.
  const curatedCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of memberships) map[m.category_id] = (map[m.category_id] ?? 0) + 1;
    return map;
  }, [memberships]);

  const productCountMap = useMemo(() => {
    const members = new Map<string, Set<string>>();
    const add = (categoryId: string, productId: string) => {
      const set = members.get(categoryId) ?? new Set<string>();
      set.add(productId);
      members.set(categoryId, set);
    };
    for (const p of products) if (p.category_id) add(p.category_id, p.id);
    for (const m of memberships) add(m.category_id, m.product_id);
    const map: Record<string, number> = {};
    for (const [id, set] of members) map[id] = set.size;
    return map;
  }, [products, memberships]);

  const uncategorizedCount = useMemo(() => {
    const curated = new Set(memberships.map((m) => m.product_id));
    return products.filter((p) => !p.category_id && !curated.has(p.id) && !p.is_archived).length;
  }, [products, memberships]);

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

  // Category writes need products.edit; RLS has the final say, and a refused
  // write now throws (it used to match no rows and still toast success).
  const { can } = usePermission();
  const canEditCategories = can(PERMISSIONS.EDIT_PRODUCTS);
  // RLS lets only products.manage delete a category.
  const canDeleteCategories = can(PERMISSIONS.MANAGE_PRODUCTS);
  const reportCategoryError = useCallback(
    (err: unknown) => toast.error(t(categoryWriteErrorKey(err))),
    [t],
  );
  /** Runs one write per id; reports how many failed instead of stopping at the first. */
  const runForEach = useCallback(
    async (ids: string[], write: (id: string) => Promise<unknown>): Promise<string[]> => {
      const results = await Promise.allSettled(ids.map((id) => write(id)));
      const done = ids.filter((_, i) => results[i].status === "fulfilled");
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) {
        toast.error(
          t("categories.error.someFailed", { failed: ids.length - done.length, total: ids.length }) +
            " " + t(categoryWriteErrorKey(failed.reason)),
        );
      }
      return done;
    },
    [t],
  );

  const handleArchive = useCallback(
    async (c: Category) => {
      if (!canEditCategories) return;
      try {
        await archiveMutation.mutateAsync(c.id);
      } catch (err) {
        reportCategoryError(err);
        return;
      }
      setLastArchivedIds([c.id]);
      startUndoCountdown();
      toast.success(t("categories.toast.archived") || "Category archived");
    },
    [archiveMutation, startUndoCountdown, t, canEditCategories, reportCategoryError],
  );

  const handleRestore = useCallback(
    async (c: Category) => {
      if (!canEditCategories) return;
      try {
        await restoreMutation.mutateAsync(c.id);
      } catch (err) {
        reportCategoryError(err);
        return;
      }
      toast.success(t("categories.toast.restored") || "Category restored");
    },
    [restoreMutation, t, canEditCategories, reportCategoryError],
  );

  const handleDelete = useCallback(
    async (c: Category) => {
      if (!canDeleteCategories) return;
      // Deleting cascades into curated members and subcategories, so the check
      // waits for the membership list instead of passing on an empty one.
      if (!membershipsReady) {
        toast.error(t("products.errors.saveFailed"));
        return;
      }
      if ((curatedCountMap[c.id] ?? 0) > 0) {
        toast.error(t("categories.error.hasCurated"));
        return;
      }
      if ((productCountMap[c.id] ?? 0) > 0) {
        toast.error(t("categories.error.hasProducts"));
        return;
      }
      if (categories.some((other) => other.parent_id === c.id)) {
        toast.error(t("categories.error.hasChildren"));
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
      try {
        await deleteMutation.mutateAsync(c.id);
      } catch (err) {
        reportCategoryError(err);
        return;
      }
      toast.success(t("categories.toast.deleted") || "Category deleted");
    },
    [deleteMutation, productCountMap, curatedCountMap, membershipsReady, categories, canDeleteCategories, t, reportCategoryError],
  );

  const handleDuplicate = useCallback(
    async (c: Category) => {
      if (!canEditCategories) return;
      try {
        await duplicateMutation.mutateAsync({ id: c.id, withProducts: false, copySuffix: t("categories.copySuffix") });
      } catch (err) {
        reportCategoryError(err);
        return;
      }
      toast.success(t("categories.toast.duplicated") || "Category duplicated");
    },
    [duplicateMutation, t, canEditCategories, reportCategoryError],
  );

  // Scope is a one-field write, so it commits on click instead of making the
  // merchant open the edit sheet to change who a category is for.
  const handleScopeChange = useCallback(
    async (c: Category, scope: CategoryScope) => {
      if (!canEditCategories) return;
      try {
        await updateMutation.mutateAsync({
          id: c.id,
          data: { scope },
        });
      } catch (err) {
        reportCategoryError(err);
      }
    },
    [updateMutation, canEditCategories, reportCategoryError],
  );

  const handleToggleVisibility = useCallback(
    async (c: Category) => {
      if (!canEditCategories) return;
      try {
        await updateMutation.mutateAsync({
          id: c.id,
          data: { is_visible: !c.is_visible } as Partial<Category>,
        });
      } catch (err) {
        reportCategoryError(err);
      }
    },
    [updateMutation, canEditCategories, reportCategoryError],
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
    if (!canEditCategories) return;
    const ids = await runForEach([...selectedIds], (id) => archiveMutation.mutateAsync(id));
    clearSelection();
    if (ids.length === 0) return;
    setLastArchivedIds(ids);
    startUndoCountdown();
    toast.success(
      (t("categories.toast.bulkArchived") || "Archived") + ` (${ids.length})`,
    );
  }, [selectedIds, archiveMutation, clearSelection, startUndoCountdown, t, canEditCategories, runForEach]);

  const handleBulkRestore = useCallback(async () => {
    if (!canEditCategories) return;
    const ids = await runForEach([...selectedIds], (id) => restoreMutation.mutateAsync(id));
    clearSelection();
    if (ids.length === 0) return;
    toast.success(
      (t("categories.toast.bulkRestored") || "Restored") + ` (${ids.length})`,
    );
  }, [selectedIds, restoreMutation, clearSelection, t, canEditCategories, runForEach]);

  const handleBulkToggleNav = useCallback(
    async (show: boolean) => {
      if (!canEditCategories) return;
      const ids = await runForEach([...selectedIds], (id) =>
        updateMutation.mutateAsync({
          id,
          data: { show_in_main_nav: show } as Partial<Category>,
        }),
      );
      clearSelection();
      if (ids.length === 0) return;
      toast.success(
        show
          ? t("categories.toast.bulkShowNav") || "Shown in nav"
          : t("categories.toast.bulkHideNav") || "Hidden from nav",
      );
    },
    [selectedIds, updateMutation, clearSelection, t, canEditCategories, runForEach],
  );

  const handleUndoArchive = useCallback(async () => {
    if (lastArchivedIds.length === 0) return;
    clearUndoTimers();
    setUndoTimeLeft(0);
    const restored = await runForEach(lastArchivedIds, (id) => restoreMutation.mutateAsync(id));
    setLastArchivedIds([]);
    if (restored.length > 0) toast.success(t("categories.toast.undoArchive") || "Restored");
  }, [lastArchivedIds, restoreMutation, clearUndoTimers, t, runForEach]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inForm =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inForm && e.key !== "Escape") return;

      if (canEditCategories && e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
  }, [openNew, selectedIds.length, clearSelection, canEditCategories]);

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

        <CategoryFiltersBar onNewCategory={canEditCategories ? openNew : undefined} />

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[var(--pastel-yellow)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : viewMode === "grid" ? (
          canEditCategories ? (
            <CategoryGridView
              categories={filtered}
              productCountMap={productCountMap}
              onEdit={openEdit}
              onToggleVisibility={handleToggleVisibility}
              onScopeChange={handleScopeChange}
              selectable
            />
          ) : (
            <CategoryGridView categories={filtered} productCountMap={productCountMap} />
          )
        ) : canEditCategories ? (
          <CategoryTreeView
            categories={filtered}
            productCountMap={productCountMap}
            onEdit={openEdit}
            onDuplicate={handleDuplicate}
            onArchive={handleArchive}
            onDelete={canDeleteCategories ? handleDelete : undefined}
            onToggleVisibility={handleToggleVisibility}
            onScopeChange={handleScopeChange}
            onReorder={handleReorder}
            selectable
          />
        ) : (
          <CategoryTreeView categories={filtered} productCountMap={productCountMap} />
        )}

        {canEditCategories && (
          <CategoryBulkActionsBar
            selectedCount={selectedIds.length}
            totalCount={filtered.length}
            onArchive={handleBulkArchive}
            onRestore={handleBulkRestore}
            onToggleNav={handleBulkToggleNav}
            onClear={clearSelection}
            onUndo={lastArchivedIds.length > 0 ? handleUndoArchive : undefined}
          />
        )}

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
                {t("categories.bulk.undoArchiveAction")}
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
