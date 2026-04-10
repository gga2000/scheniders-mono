import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LeadStatus, LeadPriority, LeadSourcePlatform, LeadTier } from "@/types/leads";

export type LeadViewMode = "table" | "kanban" | "cards";

interface LeadStoreState {
  // View
  viewMode: LeadViewMode;
  setViewMode: (mode: LeadViewMode) => void;

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

  // Active filter count
  activeFilterCount: () => number;
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
    (set, get) => ({
      viewMode: "table",
      setViewMode: (mode) => set({ viewMode: mode }),

      ...DEFAULT_FILTERS,

      setStatusFilter: (v) => set({ statusFilter: v }),
      setPlatformFilter: (v) => set({ platformFilter: v }),
      setPriorityFilter: (v) => set({ priorityFilter: v }),
      setTierFilter: (v) => set({ tierFilter: v }),
      setIndustryFilter: (v) => set({ industryFilter: v }),
      setAssigneeFilter: (v) => set({ assigneeFilter: v }),
      setHasStoreFilter: (v) => set({ hasStoreFilter: v }),
      setScoreRange: (v) => set({ scoreRange: v }),
      setSearchQuery: (v) => set({ searchQuery: v }),
      clearFilters: () => set(DEFAULT_FILTERS),

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

      activeFilterCount: () => {
        const s = get();
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
      },
    }),
    {
      name: "lead-store",
      partialize: (state) => ({
        viewMode: state.viewMode,
      }),
    }
  )
);
