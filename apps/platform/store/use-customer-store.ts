import { create } from "zustand";
import { persist } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Store Type
// ---------------------------------------------------------------------------

interface CustomerStore {
  // Selection
  selectedPhones: Set<string>;
  togglePhoneSelection: (phone: string) => void;
  selectAllPhones: (phones: string[]) => void;
  clearPhoneSelection: () => void;
  setSelectedPhones: (val: Set<string>) => void;

  // Modals
  isTagModalOpen: boolean;
  setIsTagModalOpen: (val: boolean) => void;
  isBroadcastModalOpen: boolean;
  setIsBroadcastModalOpen: (val: boolean) => void;

  // Trust modals
  isCommunityRatingModalOpen: boolean;
  setCommunityRatingModalOpen: (val: boolean) => void;
  communityRatingContext: { phone: string; orderId?: string } | null;
  setCommunityRatingContext: (ctx: { phone: string; orderId?: string } | null) => void;

  isScoreBreakdownModalOpen: boolean;
  setScoreBreakdownModalOpen: (val: boolean) => void;
  scoreBreakdownPhone: string | null;
  setScoreBreakdownPhone: (phone: string | null) => void;

  isRejectionEditModalOpen: boolean;
  setRejectionEditModalOpen: (val: boolean) => void;
  rejectionEditContext: { orderId: string; phone: string; currentReason: string } | null;
  setRejectionEditContext: (ctx: { orderId: string; phone: string; currentReason: string } | null) => void;

  isLinkCustomersModalOpen: boolean;
  setLinkCustomersModalOpen: (val: boolean) => void;
  linkCustomersPhone: string | null;
  setLinkCustomersPhone: (phone: string | null) => void;

  isVoiceRecorderModalOpen: boolean;
  setVoiceRecorderModalOpen: (val: boolean) => void;
  voiceRecorderPhone: string | null;
  setVoiceRecorderPhone: (phone: string | null) => void;

  isAddNoteModalOpen: boolean;
  setAddNoteModalOpen: (val: boolean) => void;

  // View mode
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;

  // View preferences (persisted)
  compactLevel: 0 | 1 | 2;
  setCompactLevel: (val: 0 | 1 | 2) => void;

  // Filter UI
  activePresetId: string | null;
  setActivePresetId: (id: string | null) => void;
  showFilters: boolean;
  setShowFilters: (val: boolean) => void;
  groupBy: "none" | "status" | "city" | "governorate";
  setGroupBy: (val: "none" | "status" | "city" | "governorate") => void;

  // Analytics
  isExpandedAnalytics: boolean;
  setIsExpandedAnalytics: (val: boolean) => void;
  metricsCollapsed: boolean;
  setMetricsCollapsed: (val: boolean) => void;

  // Date range
  dateFrom: string | undefined;
  setDateFrom: (val: string | undefined) => void;
  dateTo: string | undefined;
  setDateTo: (val: string | undefined) => void;
}

// ---------------------------------------------------------------------------
// Store Implementation
// ---------------------------------------------------------------------------

export const useCustomerStore = create<CustomerStore>()(
  persist(
    (set) => ({
      // Selection
      selectedPhones: new Set<string>(),
      togglePhoneSelection: (phone) =>
        set((s) => {
          const next = new Set(s.selectedPhones);
          if (next.has(phone)) next.delete(phone);
          else next.add(phone);
          return { selectedPhones: next };
        }),
      selectAllPhones: (phones) =>
        set({ selectedPhones: new Set(phones) }),
      clearPhoneSelection: () =>
        set({ selectedPhones: new Set<string>() }),
      setSelectedPhones: (val) => set({ selectedPhones: val }),

      // Modals
      isTagModalOpen: false,
      setIsTagModalOpen: (val) => set({ isTagModalOpen: val }),
      isBroadcastModalOpen: false,
      setIsBroadcastModalOpen: (val) => set({ isBroadcastModalOpen: val }),

      // Trust modals
      isCommunityRatingModalOpen: false,
      setCommunityRatingModalOpen: (val) => set({ isCommunityRatingModalOpen: val }),
      communityRatingContext: null,
      setCommunityRatingContext: (ctx) => set({ communityRatingContext: ctx }),

      isScoreBreakdownModalOpen: false,
      setScoreBreakdownModalOpen: (val) => set({ isScoreBreakdownModalOpen: val }),
      scoreBreakdownPhone: null,
      setScoreBreakdownPhone: (phone) => set({ scoreBreakdownPhone: phone }),

      isRejectionEditModalOpen: false,
      setRejectionEditModalOpen: (val) => set({ isRejectionEditModalOpen: val }),
      rejectionEditContext: null,
      setRejectionEditContext: (ctx) => set({ rejectionEditContext: ctx }),

      isLinkCustomersModalOpen: false,
      setLinkCustomersModalOpen: (val) => set({ isLinkCustomersModalOpen: val }),
      linkCustomersPhone: null,
      setLinkCustomersPhone: (phone) => set({ linkCustomersPhone: phone }),

      isVoiceRecorderModalOpen: false,
      setVoiceRecorderModalOpen: (val) => set({ isVoiceRecorderModalOpen: val }),
      voiceRecorderPhone: null,
      setVoiceRecorderPhone: (phone) => set({ voiceRecorderPhone: phone }),

      isAddNoteModalOpen: false,
      setAddNoteModalOpen: (val) => set({ isAddNoteModalOpen: val }),

      // View mode
      viewMode: 'grid' as const,
      setViewMode: (mode) => set({ viewMode: mode }),

      // View preferences
      compactLevel: 2,
      setCompactLevel: (val) => set({ compactLevel: val }),

      // Filter UI
      activePresetId: null,
      setActivePresetId: (id) => set({ activePresetId: id }),
      showFilters: true,
      setShowFilters: (val) => set({ showFilters: val }),
      groupBy: "none",
      setGroupBy: (val) => set({ groupBy: val }),

      // Analytics
      isExpandedAnalytics: false,
      setIsExpandedAnalytics: (val) => set({ isExpandedAnalytics: val }),
      metricsCollapsed: false,
      setMetricsCollapsed: (val) => set({ metricsCollapsed: val }),

      // Date range
      dateFrom: undefined,
      setDateFrom: (val) => set({ dateFrom: val }),
      dateTo: undefined,
      setDateTo: (val) => set({ dateTo: val }),
    }),
    {
      name: "customers-ui-store",
      partialize: (state) => ({
        compactLevel: state.compactLevel,
        viewMode: state.viewMode,
      }),
    }
  )
);
