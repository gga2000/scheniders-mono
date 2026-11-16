import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LeadStatus, LeadPriority, LeadSourcePlatform, LeadTier } from "@/types/leads";

export type LeadViewMode = "table" | "kanban" | "cards";

interface LeadStoreState {
  // The page of the list on screen. Changing what the list shows (view, sort,
  // a filter, the search) goes back to page 1: an old page number past the
  // end of the new list showed no rows and no pager to get back.
  page: number;
  setPage: (page: number) => void;

  // View
  viewMode: LeadViewMode;
  setViewMode: (mode: LeadViewMode) => void;

  // Sort (format: "column:dir", e.g. "lead_score:desc")
  sortBy: string;
  setSortBy: (v: string) => void;

  // Filters
  statusFilter: LeadStatus | null;
  platformFilter: LeadSourcePlatform | null;
  priorityFilter: LeadPriority | null;
  tierFilter: LeadTier | null;
  industryFilter: string | null;
  assigneeFilter: string | null;
  hasStoreFilter: boolean | null;
  scoreRange: [number, number];
  searchQuery: string;

  setStatusFilter: (v: LeadStatus | null) => void;
  setPlatformFilter: (v: LeadSourcePlatform | null) => void;
  setPriorityFilter: (v: LeadPriority | null) => void;
  setTierFilter: (v: LeadTier | null) => void;
  setIndustryFilter: (v: string | null) => void;
  setAssigneeFilter: (v: string | null) => void;
  setHasStoreFilter: (v: boolean | null) => void;
  setScoreRange: (v: [number, number]) => void;
  setSearchQuery: (v: string) => void;
  clearFilters: () => void;

  // Selection
  selectedLeads: Set<string>;
  toggleLead: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;

}

const DEFAULT_FILTERS = {
  statusFilter: null as LeadStatus | null,
  platformFilter: null as LeadSourcePlatform | null,
  priorityFilter: null as LeadPriority | null,
  tierFilter: null as LeadTier | null,
  industryFilter: null as string | null,
  assigneeFilter: null as string | null,
  hasStoreFilter: null as boolean | null,
  scoreRange: [0, 100] as [number, number],
  searchQuery: "",
};

export const useLeadStore = create<LeadStoreState>()(
  persist(
    (set) => ({
      page: 1,
      setPage: (page) => set({ page: Math.max(1, page) }),

      viewMode: "table",
      setViewMode: (mode) => set({ viewMode: mode, page: 1 }),

      sortBy: "created_at:desc",
      setSortBy: (v) => set({ sortBy: v, page: 1 }),

      ...DEFAULT_FILTERS,

      setStatusFilter: (v) => set({ statusFilter: v, page: 1 }),
      setPlatformFilter: (v) => set({ platformFilter: v, page: 1 }),
      setPriorityFilter: (v) => set({ priorityFilter: v, page: 1 }),
      setTierFilter: (v) => set({ tierFilter: v, page: 1 }),
      setIndustryFilter: (v) => set({ industryFilter: v, page: 1 }),
      setAssigneeFilter: (v) => set({ assigneeFilter: v, page: 1 }),
      setHasStoreFilter: (v) => set({ hasStoreFilter: v, page: 1 }),
      setScoreRange: (v) => set({ scoreRange: v, page: 1 }),
      setSearchQuery: (v) => set({ searchQuery: v, page: 1 }),
      clearFilters: () => set({ ...DEFAULT_FILTERS, page: 1 }),

      selectedLeads: new Set<string>(),
      toggleLead: (id) =>
        set((state) => {
          const next = new Set(state.selectedLeads);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { selectedLeads: next };
        }),
      selectAll: (ids) => set({ selectedLeads: new Set(ids) }),
      clearSelection: () => set({ selectedLeads: new Set() }),
    }),
    {
      name: "lead-store",
      partialize: (state) => ({
        viewMode: state.viewMode,
        sortBy: state.sortBy,
      }),
    }
  )
);

export function useActiveFilterCount() {
  return useLeadStore((s) => {
    let count = 0;
    if (s.statusFilter) count++;
    if (s.platformFilter) count++;
    if (s.priorityFilter) count++;
    if (s.tierFilter) count++;
    if (s.industryFilter) count++;
    if (s.assigneeFilter) count++;
    if (s.hasStoreFilter !== null) count++;
    if (s.scoreRange[0] > 0 || s.scoreRange[1] < 100) count++;
    if (s.searchQuery) count++;
    return count;
  });
}
