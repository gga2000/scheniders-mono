import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";

// Debounced localStorage to avoid excessive writes
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

export type ViewMode = "grid" | "list" | "category" | "kanban" | "heatmap";
export type SortField = "sales" | "revenue" | "price" | "stock" | "health" | "name" | "displayOrder";
export type GridDensity = "comfy" | "normal" | "compact" | "tight";

// Rich preset shape: captures the full filter bar state (search + advanced + sort)
// so a one-click apply restores everything.
export interface SavedFilterPreset {
    id: string;
    name: string;
    createdAt: string;
    state: {
        searchQuery: string;
        // advancedFilters is the shape from AdvancedFilters (FilterValues) or null
        advancedFilters: Record<string, any> | null;
        sortBy: string;
    };
    // Back-compat: older presets serialized `filters: FilterState`. Readers should
    // prefer `state` when present and fall back to `filters`.
    filters?: FilterState;
}

export interface FilterState {
    searchQuery: string;
    priceMin: number | null;
    priceMax: number | null;
    salesMin: number | null;
    salesMax: number | null;
    stockStatus: "all" | "in_stock" | "low_stock" | "out_of_stock";
    showArchived: boolean;
    categoryIds: string[];
    productType: string[];
    visibility: "all" | "visible" | "hidden";
    tags: string[];
    healthScore: string[];
    abcTier: string[];
    hasVariants: "all" | "yes" | "no";
}

export const defaultFilterState: FilterState = {
    searchQuery: "",
    priceMin: null,
    priceMax: null,
    salesMin: null,
    salesMax: null,
    stockStatus: "all",
    showArchived: false,
    categoryIds: [],
    productType: [],
    visibility: "all",
    tags: [],
    healthScore: [],
    abcTier: [],
    hasVariants: "all",
};

// --- View Preferences Slice ---
interface ViewPreferencesSlice {
    viewMode: ViewMode;
    sortBy: SortField;
    savedFilterPresets: SavedFilterPreset[];
    recentSearches: string[];
    collapsedCategories: Set<string>;
    gridDensity: GridDensity;
    gridGroupByCategory: boolean;
    setViewMode: (mode: ViewMode) => void;
    setSortBy: (sort: SortField) => void;
    addFilterPreset: (preset: SavedFilterPreset) => void;
    removeFilterPreset: (id: string) => void;
    addRecentSearch: (q: string) => void;
    removeRecentSearch: (q: string) => void;
    clearRecentSearches: () => void;
    toggleCategoryCollapse: (categoryId: string) => void;
    setCategoryCollapsed: (categoryId: string, collapsed: boolean) => void;
    setGridDensity: (density: GridDensity) => void;
    setGridGroupByCategory: (on: boolean) => void;
}

// --- Selection Slice ---
interface SelectionSlice {
    selectedIds: Set<string>;
    toggleSelection: (id: string) => void;
    selectAll: (ids: string[]) => void;
    clearSelection: () => void;
    selectMany: (ids: string[]) => void;
    selectRange: (ids: string[]) => void;
}

// --- UI State Slice ---
interface UIStateSlice {
    showLowStockAlert: boolean;
    lowStockAlertSnoozedUntil: number | null;
    alertSnooze: {
        critical: number | null;
        warning: number | null;
        info: number | null;
    };
    lowStockAlertExpanded: boolean;
    isFormModalOpen: boolean;
    formModalMode: "add" | "edit";
    isDetailModalOpen: boolean;
    isCompareMode: boolean;
    compareIds: string[];
    setShowLowStockAlert: (show: boolean) => void;
    snoozeLowStockAlert: (hours: number) => void;
    snoozeAlertSeverity: (severity: "critical" | "warning" | "info", hours: number) => void;
    isAlertSeveritySnoozed: (severity: "critical" | "warning" | "info") => boolean;
    toggleLowStockAlertExpanded: () => void;
    openFormModal: (mode: "add" | "edit") => void;
    closeFormModal: () => void;
    openDetailModal: () => void;
    closeDetailModal: () => void;
    toggleCompareMode: () => void;
    addToCompare: (id: string) => void;
    removeFromCompare: (id: string) => void;
    clearCompare: () => void;
}

// --- Inline Edit Slice ---
interface InlineEditSlice {
    editingCell: { productId: string; field: string } | null;
    setEditingCell: (cell: { productId: string; field: string } | null) => void;
}

export type ProductStore = ViewPreferencesSlice &
    SelectionSlice &
    UIStateSlice &
    InlineEditSlice;

export const useProductStore = create<ProductStore>()(
    persist(
        (set, get) => ({
            // --- View Preferences ---
            viewMode: "grid",
            sortBy: "sales",
            savedFilterPresets: [] as SavedFilterPreset[],
            recentSearches: [] as string[],
            collapsedCategories: new Set(),
            gridDensity: "compact" as GridDensity,
            gridGroupByCategory: false,

            setViewMode: (mode) => set({ viewMode: mode }),
            setSortBy: (sort) => set({ sortBy: sort }),
            setGridDensity: (density) => set({ gridDensity: density }),
            setGridGroupByCategory: (on) => set({ gridGroupByCategory: on }),
            addFilterPreset: (preset) =>
                set((state) => ({
                    savedFilterPresets: [...state.savedFilterPresets, preset],
                })),
            removeFilterPreset: (id) =>
                set((state) => ({
                    savedFilterPresets: state.savedFilterPresets.filter((p) => p.id !== id),
                })),
            addRecentSearch: (q) =>
                set((state) => {
                    const trimmed = q.trim();
                    if (!trimmed) return state;
                    // De-dupe (case-insensitive), most recent first, cap at 10.
                    const lower = trimmed.toLowerCase();
                    const filtered = state.recentSearches.filter(
                        (s) => s.toLowerCase() !== lower
                    );
                    return { recentSearches: [trimmed, ...filtered].slice(0, 10) };
                }),
            removeRecentSearch: (q) =>
                set((state) => ({
                    recentSearches: state.recentSearches.filter((s) => s !== q),
                })),
            clearRecentSearches: () => set({ recentSearches: [] }),
            toggleCategoryCollapse: (categoryId) =>
                set((state) => {
                    const next = new Set(state.collapsedCategories);
                    if (next.has(categoryId)) {
                        next.delete(categoryId);
                    } else {
                        next.add(categoryId);
                    }
                    return { collapsedCategories: next };
                }),
            setCategoryCollapsed: (categoryId, collapsed) =>
                set((state) => {
                    const next = new Set(state.collapsedCategories);
                    if (collapsed) {
                        next.add(categoryId);
                    } else {
                        next.delete(categoryId);
                    }
                    return { collapsedCategories: next };
                }),

            // --- Selection ---
            selectedIds: new Set(),
            toggleSelection: (id) =>
                set((state) => {
                    const next = new Set(state.selectedIds);
                    if (next.has(id)) {
                        next.delete(id);
                    } else {
                        next.add(id);
                    }
                    return { selectedIds: next };
                }),
            selectAll: (ids) => set({ selectedIds: new Set(ids) }),
            clearSelection: () => set({ selectedIds: new Set() }),
            selectMany: (ids) =>
                set((state) => {
                    const next = new Set(state.selectedIds);
                    ids.forEach((id) => next.add(id));
                    return { selectedIds: next };
                }),
            // Union of current selection and the given range for shift-click range selection.
            selectRange: (ids) =>
                set((state) => {
                    const next = new Set(state.selectedIds);
                    ids.forEach((id) => next.add(id));
                    return { selectedIds: next };
                }),

            // --- UI State ---
            showLowStockAlert: true,
            lowStockAlertSnoozedUntil: null,
            alertSnooze: { critical: null, warning: null, info: null },
            lowStockAlertExpanded: false,
            isFormModalOpen: false,
            formModalMode: "add",
            isDetailModalOpen: false,
            isCompareMode: false,
            compareIds: [],

            setShowLowStockAlert: (show) => set({ showLowStockAlert: show }),
            snoozeLowStockAlert: (hours) =>
                set({
                    showLowStockAlert: false,
                    lowStockAlertSnoozedUntil: Date.now() + hours * 60 * 60 * 1000,
                }),
            snoozeAlertSeverity: (severity, hours) =>
                set((state) => ({
                    alertSnooze: {
                        ...state.alertSnooze,
                        [severity]: Date.now() + hours * 60 * 60 * 1000,
                    },
                })),
            isAlertSeveritySnoozed: (severity: "critical" | "warning" | "info") => {
                const snoozedUntil = get().alertSnooze[severity];
                return snoozedUntil !== null && Date.now() < snoozedUntil;
            },
            toggleLowStockAlertExpanded: () =>
                set((state) => ({ lowStockAlertExpanded: !state.lowStockAlertExpanded })),
            openFormModal: (mode: "add" | "edit") => set({ isFormModalOpen: true, formModalMode: mode }),
            closeFormModal: () => set({ isFormModalOpen: false }),
            openDetailModal: () => set({ isDetailModalOpen: true }),
            closeDetailModal: () => set({ isDetailModalOpen: false }),
            toggleCompareMode: () =>
                set((state) => ({
                    isCompareMode: !state.isCompareMode,
                    compareIds: state.isCompareMode ? [] : state.compareIds,
                })),
            addToCompare: (id: string) =>
                set((state) => {
                    if (state.compareIds.length >= 4) return state;
                    return { compareIds: [...state.compareIds, id] };
                }),
            removeFromCompare: (id: string) =>
                set((state) => ({
                    compareIds: state.compareIds.filter((cid) => cid !== id),
                })),
            clearCompare: () => set({ compareIds: [], isCompareMode: false }),

            // --- Inline Edit ---
            editingCell: null,
            setEditingCell: (cell: { productId: string; field: string } | null) => set({ editingCell: cell }),
        }),
        {
            name: "products-ui-store",
            storage: createJSONStorage(() => debouncedLocalStorage),
            partialize: (state) => ({
                viewMode: state.viewMode,
                sortBy: state.sortBy,
                savedFilterPresets: state.savedFilterPresets,
                // Convert Set to array for JSON serialization
                collapsedCategories: Array.from(state.collapsedCategories),
                alertSnooze: state.alertSnooze,
                lowStockAlertSnoozedUntil: state.lowStockAlertSnoozedUntil,
                gridDensity: state.gridDensity,
                gridGroupByCategory: state.gridGroupByCategory,
            }),
            merge: (persisted: any, current) => ({
                ...current,
                ...(persisted as object),
                // Restore Set from array
                collapsedCategories: new Set(persisted?.collapsedCategories || []),
                // Always reset transient state
                selectedIds: new Set(),
                editingCell: null,
                isFormModalOpen: false,
                isDetailModalOpen: false,
                isCompareMode: false,
                compareIds: [],
            }),
        }
    )
);
