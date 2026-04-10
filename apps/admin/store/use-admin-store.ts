import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface AdminViewState {
  viewMode: "cards" | "table";
  setViewMode: (mode: "cards" | "table") => void;
}

interface AdminFilterState {
  planFilter: string | null;
  statusFilter: string | null;
  cityFilter: string | null;
  searchQuery: string;
  dateRange: { from: string | null; to: string | null };
  setPlanFilter: (plan: string | null) => void;
  setStatusFilter: (status: string | null) => void;
  setCityFilter: (city: string | null) => void;
  setSearchQuery: (query: string) => void;
  setDateRange: (range: { from: string | null; to: string | null }) => void;
  clearFilters: () => void;
}

interface AdminSelectionState {
  selectedMerchants: Set<string>;
  toggleMerchantSelection: (id: string) => void;
  selectAllMerchants: (ids: string[]) => void;
  clearSelection: () => void;
}

type AdminStore = AdminViewState & AdminFilterState & AdminSelectionState;

export const useAdminStore = create<AdminStore>()(
  persist(
    (set) => ({
      // View
      viewMode: "cards",
      setViewMode: (mode) => set({ viewMode: mode }),

      // Filters
      planFilter: null,
      statusFilter: null,
      cityFilter: null,
      searchQuery: "",
      dateRange: { from: null, to: null },
      setPlanFilter: (plan) => set({ planFilter: plan }),
      setStatusFilter: (status) => set({ statusFilter: status }),
      setCityFilter: (city) => set({ cityFilter: city }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setDateRange: (range) => set({ dateRange: range }),
      clearFilters: () =>
        set({
          planFilter: null,
          statusFilter: null,
          cityFilter: null,
          searchQuery: "",
          dateRange: { from: null, to: null },
        }),

      // Selection
      selectedMerchants: new Set(),
      toggleMerchantSelection: (id) =>
        set((state) => {
          const next = new Set(state.selectedMerchants);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { selectedMerchants: next };
        }),
      selectAllMerchants: (ids) => set({ selectedMerchants: new Set(ids) }),
      clearSelection: () => set({ selectedMerchants: new Set() }),
    }),
    {
      name: "admin-ui-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        viewMode: state.viewMode,
      }),
    }
  )
);
