import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { CategoryStatus } from "@scheniders/shared";

const debouncedLocalStorage: StateStorage = {
  getItem: (name) => localStorage.getItem(name),
  setItem: (() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return (name: string, value: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => localStorage.setItem(name, value), 1000);
    };
  })(),
  removeItem: (name) => localStorage.removeItem(name),
};

export type CategoryViewMode = "tree" | "grid" | "megamenu";
export type CategorySortBy = "manual" | "name" | "products" | "revenue" | "updated";

export interface CategoryFilterState {
  searchQuery: string;
  statuses: CategoryStatus[];
  navOnly: boolean;
  hasRules: "all" | "yes" | "no";
  parent: "all" | "top-level" | "sub";
}

export const defaultCategoryFilterState: CategoryFilterState = {
  searchQuery: "",
  statuses: ["draft", "published"],
  navOnly: false,
  hasRules: "all",
  parent: "all",
};

interface CategoryStoreState {
  viewMode: CategoryViewMode;
  sortBy: CategorySortBy;
  expandedIds: string[];
  selectedIds: string[];
  filters: CategoryFilterState;
  draftEdits: Record<string, Record<string, unknown>>;

  setViewMode: (v: CategoryViewMode) => void;
  setSortBy: (s: CategorySortBy) => void;
  toggleExpanded: (id: string) => void;
  setExpanded: (ids: string[]) => void;
  expandAll: (ids: string[]) => void;
  collapseAll: () => void;

  toggleSelected: (id: string) => void;
  setSelected: (ids: string[]) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;

  setFilter: <K extends keyof CategoryFilterState>(k: K, v: CategoryFilterState[K]) => void;
  resetFilters: () => void;

  setDraftEdit: (id: string, patch: Record<string, unknown>) => void;
  clearDraftEdit: (id: string) => void;
  clearAllDrafts: () => void;
}

export const useCategoryStore = create<CategoryStoreState>()(
  persist(
    (set, get) => ({
      viewMode: "tree",
      sortBy: "manual",
      expandedIds: [],
      selectedIds: [],
      filters: defaultCategoryFilterState,
      draftEdits: {},

      setViewMode: (v) => set({ viewMode: v }),
      setSortBy: (s) => set({ sortBy: s }),

      toggleExpanded: (id) =>
        set((s) => ({
          expandedIds: s.expandedIds.includes(id)
            ? s.expandedIds.filter((x) => x !== id)
            : [...s.expandedIds, id],
        })),
      setExpanded: (ids) => set({ expandedIds: ids }),
      expandAll: (ids) => set({ expandedIds: ids }),
      collapseAll: () => set({ expandedIds: [] }),

      toggleSelected: (id) =>
        set((s) => ({
          selectedIds: s.selectedIds.includes(id)
            ? s.selectedIds.filter((x) => x !== id)
            : [...s.selectedIds, id],
        })),
      setSelected: (ids) => set({ selectedIds: ids }),
      clearSelection: () => set({ selectedIds: [] }),
      isSelected: (id) => get().selectedIds.includes(id),

      setFilter: (k, v) =>
        set((s) => ({ filters: { ...s.filters, [k]: v } })),
      resetFilters: () => set({ filters: defaultCategoryFilterState }),

      setDraftEdit: (id, patch) =>
        set((s) => ({
          draftEdits: {
            ...s.draftEdits,
            [id]: { ...(s.draftEdits[id] ?? {}), ...patch },
          },
        })),
      clearDraftEdit: (id) =>
        set((s) => {
          const next = { ...s.draftEdits };
          delete next[id];
          return { draftEdits: next };
        }),
      clearAllDrafts: () => set({ draftEdits: {} }),
    }),
    {
      name: "category-store-v1",
      storage: createJSONStorage(() => debouncedLocalStorage),
      partialize: (s) => ({
        viewMode: s.viewMode,
        sortBy: s.sortBy,
        expandedIds: s.expandedIds,
        filters: s.filters,
      }),
    },
  ),
);
