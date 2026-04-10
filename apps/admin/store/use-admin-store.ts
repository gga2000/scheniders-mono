import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  TableDensity,
  ViewMode,
  DetailViewMode,
  SavedView,
  SortConfig,
  MerchantColumnId,
} from "@/types/admin";

// ── Filter Preset ──────────────────────────────────────────────────────
interface FilterPreset {
  id: string;
  name: string;
  filters: {
    planFilter: string | null;
    statusFilter: string | null;
    cityFilter: string | null;
    balanceFilter: string | null;
    healthFilter: string | null;
  };
}

// ── State Slices ───────────────────────────────────────────────────────

interface AdminViewState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  density: TableDensity;
  setDensity: (d: TableDensity) => void;
  detailViewMode: DetailViewMode;
  setDetailViewMode: (m: DetailViewMode) => void;
  activeDetailId: string | null;
  setActiveDetailId: (id: string | null) => void;
}

interface AdminFilterState {
  planFilter: string | null;
  statusFilter: string | null;
  cityFilter: string | null;
  balanceFilter: string | null;
  healthFilter: string | null;
  searchQuery: string;
  dateRange: { from: string | null; to: string | null };
  setPlanFilter: (plan: string | null) => void;
  setStatusFilter: (status: string | null) => void;
  setCityFilter: (city: string | null) => void;
  setBalanceFilter: (balance: string | null) => void;
  setHealthFilter: (health: string | null) => void;
  setSearchQuery: (query: string) => void;
  setDateRange: (range: { from: string | null; to: string | null }) => void;
  clearFilters: () => void;
}

interface AdminSelectionState {
  selectedMerchants: Set<string>;
  lastSelectedIndex: number | null;
  focusedIndex: number | null;
  toggleMerchantSelection: (id: string) => void;
  selectAllMerchants: (ids: string[]) => void;
  selectRange: (from: number, to: number, ids: string[]) => void;
  clearSelection: () => void;
  setLastSelectedIndex: (idx: number | null) => void;
  setFocusedIndex: (idx: number | null) => void;
}

interface AdminPresetState {
  filterPresets: FilterPreset[];
  addFilterPreset: (preset: FilterPreset) => void;
  removeFilterPreset: (id: string) => void;
}

interface AdminSavedViewState {
  savedViews: SavedView[];
  activeViewId: string | null;
  addSavedView: (view: SavedView) => void;
  updateSavedView: (id: string, updates: Partial<SavedView>) => void;
  removeSavedView: (id: string) => void;
  setActiveView: (id: string | null) => void;
}

interface AdminStarredState {
  starredMerchants: string[];
  toggleStar: (id: string) => void;
  isStarred: (id: string) => boolean;
}

interface AdminColumnState {
  hiddenColumns: string[];
  columnOrder: MerchantColumnId[];
  toggleColumn: (col: string) => void;
  setColumnOrder: (order: MerchantColumnId[]) => void;
  resetColumns: () => void;
}

interface AdminSortState {
  sortConfig: SortConfig[];
  toggleSort: (column: string, append?: boolean) => void;
  clearSort: () => void;
}

type AdminStore = AdminViewState &
  AdminFilterState &
  AdminSelectionState &
  AdminPresetState &
  AdminSavedViewState &
  AdminStarredState &
  AdminColumnState &
  AdminSortState;

// ── Default column order ───────────────────────────────────────────────
const DEFAULT_COLUMN_ORDER: MerchantColumnId[] = [
  "business", "plan", "status", "city", "balance", "orders",
  "health", "revenue", "lastActive", "tags", "sparkline", "actions",
];

// ── Default saved views ────────────────────────────────────────────────
const DEFAULT_SAVED_VIEWS: SavedView[] = [
  {
    id: "default-all",
    name: "All Merchants",
    filters: { planFilter: null, statusFilter: null, cityFilter: null, balanceFilter: null, healthFilter: null },
    isDefault: true,
  },
  {
    id: "default-at-risk",
    name: "At Risk",
    icon: "alert-triangle",
    filters: { planFilter: null, statusFilter: null, cityFilter: null, balanceFilter: null, healthFilter: "at_risk" },
    isDefault: true,
  },
  {
    id: "default-new-trials",
    name: "New Trials",
    icon: "clock",
    filters: { planFilter: null, statusFilter: "trial", cityFilter: null, balanceFilter: null, healthFilter: null },
    isDefault: true,
  },
  {
    id: "default-enterprise",
    name: "Enterprise",
    icon: "building-2",
    filters: { planFilter: "enterprise", statusFilter: null, cityFilter: null, balanceFilter: null, healthFilter: null },
    isDefault: true,
  },
];

// ── Store ──────────────────────────────────────────────────────────────

export const useAdminStore = create<AdminStore>()(
  persist(
    (set, get) => ({
      // ── View ──
      viewMode: "cards",
      setViewMode: (mode) => set({ viewMode: mode }),
      density: "comfortable",
      setDensity: (d) => set({ density: d }),
      detailViewMode: "dialog",
      setDetailViewMode: (m) => set({ detailViewMode: m }),
      activeDetailId: null,
      setActiveDetailId: (id) => set({ activeDetailId: id }),

      // ── Filters ──
      planFilter: null,
      statusFilter: null,
      cityFilter: null,
      balanceFilter: null,
      healthFilter: null,
      searchQuery: "",
      dateRange: { from: null, to: null },
      setPlanFilter: (plan) => set({ planFilter: plan }),
      setStatusFilter: (status) => set({ statusFilter: status }),
      setCityFilter: (city) => set({ cityFilter: city }),
      setBalanceFilter: (balance) => set({ balanceFilter: balance }),
      setHealthFilter: (health) => set({ healthFilter: health }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setDateRange: (range) => set({ dateRange: range }),
      clearFilters: () =>
        set({
          planFilter: null,
          statusFilter: null,
          cityFilter: null,
          balanceFilter: null,
          healthFilter: null,
          searchQuery: "",
          dateRange: { from: null, to: null },
        }),

      // ── Selection ──
      selectedMerchants: new Set(),
      lastSelectedIndex: null,
      focusedIndex: null,
      toggleMerchantSelection: (id) =>
        set((state) => {
          const next = new Set(state.selectedMerchants);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { selectedMerchants: next };
        }),
      selectAllMerchants: (ids) => set({ selectedMerchants: new Set(ids) }),
      selectRange: (from, to, ids) =>
        set((state) => {
          const next = new Set(state.selectedMerchants);
          const start = Math.min(from, to);
          const end = Math.max(from, to);
          for (let i = start; i <= end; i++) {
            if (ids[i]) next.add(ids[i]);
          }
          return { selectedMerchants: next };
        }),
      clearSelection: () => set({ selectedMerchants: new Set(), lastSelectedIndex: null }),
      setLastSelectedIndex: (idx) => set({ lastSelectedIndex: idx }),
      setFocusedIndex: (idx) => set({ focusedIndex: idx }),

      // ── Presets (legacy) ──
      filterPresets: [],
      addFilterPreset: (preset) =>
        set((state) => ({ filterPresets: [...state.filterPresets, preset] })),
      removeFilterPreset: (id) =>
        set((state) => ({ filterPresets: state.filterPresets.filter((p) => p.id !== id) })),

      // ── Saved Views ──
      savedViews: DEFAULT_SAVED_VIEWS,
      activeViewId: "default-all",
      addSavedView: (view) =>
        set((state) => ({ savedViews: [...state.savedViews, view] })),
      updateSavedView: (id, updates) =>
        set((state) => ({
          savedViews: state.savedViews.map((v) =>
            v.id === id ? { ...v, ...updates } : v
          ),
        })),
      removeSavedView: (id) =>
        set((state) => ({
          savedViews: state.savedViews.filter((v) => v.id !== id),
          activeViewId: state.activeViewId === id ? "default-all" : state.activeViewId,
        })),
      setActiveView: (id) => set({ activeViewId: id }),

      // ── Starred ──
      starredMerchants: [],
      toggleStar: (id) =>
        set((state) => {
          const idx = state.starredMerchants.indexOf(id);
          if (idx >= 0) {
            return { starredMerchants: state.starredMerchants.filter((s) => s !== id) };
          }
          return { starredMerchants: [...state.starredMerchants, id] };
        }),
      isStarred: (id) => get().starredMerchants.includes(id),

      // ── Columns ──
      hiddenColumns: [],
      columnOrder: DEFAULT_COLUMN_ORDER,
      toggleColumn: (col) =>
        set((state) => {
          const idx = state.hiddenColumns.indexOf(col);
          if (idx >= 0) {
            return { hiddenColumns: state.hiddenColumns.filter((c) => c !== col) };
          }
          return { hiddenColumns: [...state.hiddenColumns, col] };
        }),
      setColumnOrder: (order) => set({ columnOrder: order }),
      resetColumns: () => set({ hiddenColumns: [], columnOrder: DEFAULT_COLUMN_ORDER }),

      // ── Sort ──
      sortConfig: [],
      toggleSort: (column, append = false) =>
        set((state) => {
          const existing = state.sortConfig.find((s) => s.column === column);
          if (existing) {
            if (existing.direction === "asc") {
              // asc → desc
              return {
                sortConfig: state.sortConfig.map((s) =>
                  s.column === column ? { ...s, direction: "desc" as const } : s
                ),
              };
            }
            // desc → remove
            return { sortConfig: state.sortConfig.filter((s) => s.column !== column) };
          }
          if (append) {
            return { sortConfig: [...state.sortConfig, { column, direction: "asc" as const }] };
          }
          return { sortConfig: [{ column, direction: "asc" as const }] };
        }),
      clearSort: () => set({ sortConfig: [] }),
    }),
    {
      name: "admin-ui-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        viewMode: state.viewMode,
        density: state.density,
        detailViewMode: state.detailViewMode,
        filterPresets: state.filterPresets,
        savedViews: state.savedViews,
        activeViewId: state.activeViewId,
        starredMerchants: state.starredMerchants,
        hiddenColumns: state.hiddenColumns,
        columnOrder: state.columnOrder,
      }),
    }
  )
);
