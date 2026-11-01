import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { Order } from "@/types/order";

// ---------------------------------------------------------------------------
// Debounced Storage Adapter
// Batches localStorage writes to avoid blocking the main thread on rapid
// state changes (search keystrokes, filter toggles, modal opens).
// Reads are instant; writes are coalesced with a 1s trailing debounce.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Slice Types
// ---------------------------------------------------------------------------

interface ViewPreferencesSlice {
  viewMode: "list" | "cards" | "table" | "kanban";
  compactView: 0 | 1 | 2;
  compactGrid: boolean;
  actionDock: boolean;
  showSearchBar: boolean;
  analyticsLevel: 0 | 1 | 2;
  toolbarCollapsed: boolean;
  soundEnabled: boolean;
  tableDensity: "compact" | "comfortable" | "spacious";
  hiddenColumns: Set<string>;

  setViewMode: (mode: "list" | "cards" | "table" | "kanban") => void;
  setCompactView: (val: 0 | 1 | 2) => void;
  setCompactGrid: (val: boolean) => void;
  setActionDock: (val: boolean) => void;
  setShowSearchBar: (val: boolean) => void;
  setAnalyticsLevel: (val: 0 | 1 | 2) => void;
  setToolbarCollapsed: (val: boolean) => void;
  toggleToolbarCollapse: () => void;
  setSoundEnabled: (val: boolean) => void;
  setTableDensity: (val: "compact" | "comfortable" | "spacious") => void;
  setHiddenColumns: (val: Set<string>) => void;
}

interface FilterUISlice {
  showFilters: boolean;
  showPresets: boolean;
  newPresetName: string;
  groupBy: "none" | "status" | "city" | "verified";
  filterDuplicatesOnly: boolean;
  /** Show only orders whose scheduled day has arrived and that still need work. */
  filterDueToday: boolean;
  sortConfig: { key: string; direction: "asc" | "desc" } | null;
  sortConfigs: Array<{ key: string; direction: "asc" | "desc" }>;
  columnFilters: Record<string, string>;
  openFilterColumn: string | null;
  activePresetId: string | null;
  datePreset: string | null;
  localSearchQuery: string;
  activeDateRange: { startDate: string | null; endDate: string | null };

  setShowFilters: (val: boolean) => void;
  setShowPresets: (val: boolean) => void;
  setNewPresetName: (name: string) => void;
  setGroupBy: (val: "none" | "status" | "city" | "verified") => void;
  setFilterDuplicatesOnly: (val: boolean) => void;
  setFilterDueToday: (val: boolean) => void;
  toggleSort: (key: string, shiftKey?: boolean) => void;
  setColumnFilters: (filters: Record<string, string>) => void;
  setOpenFilterColumn: (val: string | null) => void;
  setActivePresetId: (id: string | null) => void;
  setDatePreset: (preset: string | null) => void;
  setLocalSearchQuery: (q: string) => void;
  setActiveDateRange: (range: { startDate: string | null; endDate: string | null }) => void;
}

interface ModalsSlice {
  isModalOpen: boolean;
  selectedOrder: Order | null;
  isCreateModalOpen: boolean;
  showDuplicateModal: boolean;
  duplicateOrder: Order | null;
  cancelDialogOpen: boolean;
  orderToCancel: Order | null;
  rejectDialogOpen: boolean;
  orderToReject: Order | null;
  templatePanelOpen: boolean;
  orderForTemplate: Order | null;
  isImportModalOpen: boolean;
  isExportModalOpen: boolean;
  splitOrderDialog: { open: boolean; order: Order | null };
  screenshotOrder: Order | null;
  showDatePicker: boolean;
  datePickerPos: { top: number; left: number };
  colorPickerOpenId: string | null;

  openOrderDetails: (order: Order) => void;
  closeOrderDetails: () => void;
  setSelectedOrder: (order: Order | null) => void;
  setIsModalOpen: (val: boolean) => void;
  setIsCreateModalOpen: (val: boolean) => void;
  openDuplicateModal: (order: Order) => void;
  closeDuplicateModal: () => void;
  setShowDuplicateModal: (val: boolean) => void;
  setDuplicateOrder: (order: Order | null) => void;
  openCancelDialog: (order: Order) => void;
  closeCancelDialog: () => void;
  setCancelDialogOpen: (val: boolean) => void;
  setOrderToCancel: (order: Order | null) => void;
  openRejectDialog: (order: Order) => void;
  closeRejectDialog: () => void;
  setRejectDialogOpen: (val: boolean) => void;
  setOrderToReject: (order: Order | null) => void;
  openTemplatePanel: (order: Order) => void;
  closeTemplatePanel: () => void;
  setTemplatePanelOpen: (val: boolean) => void;
  setOrderForTemplate: (order: Order | null) => void;
  setIsImportModalOpen: (val: boolean) => void;
  setIsExportModalOpen: (val: boolean) => void;
  openSplitDialog: (order: Order) => void;
  closeSplitDialog: () => void;
  setSplitOrderDialog: (val: { open: boolean; order: Order | null }) => void;
  setScreenshotOrder: (order: Order | null) => void;
  setShowDatePicker: (val: boolean) => void;
  setDatePickerPos: (pos: { top: number; left: number }) => void;
  setColorPickerOpenId: (id: string | null) => void;
}

interface SelectionSlice {
  selectedOrders: Set<string>;
  showArchived: boolean;
  loadingId: string | null;

  toggleOrderSelection: (orderId: string) => void;
  selectAll: (orderIds: string[]) => void;
  clearSelection: () => void;
  setSelectedOrders: (val: Set<string>) => void;
  setShowArchived: (val: boolean) => void;
  setLoadingId: (id: string | null) => void;
}

interface TransientSlice {
  isFilterPanelAnimating: boolean;
  isHeaderAnimating: boolean;
  notificationsEnabled: boolean;
  editingCell: { orderId: string; field: string } | null;

  setIsFilterPanelAnimating: (val: boolean) => void;
  setIsHeaderAnimating: (val: boolean) => void;
  setNotificationsEnabled: (val: boolean) => void;
  setEditingCell: (val: { orderId: string; field: string } | null) => void;

  /**
   * Clear everything that should not outlive a visit to the orders page.
   *
   * ARCH-6: this store is module-level, so an open modal, a bulk selection or a
   * half-finished inline edit survived navigating away and reappeared on return
   * — with `selectedOrder` still holding the snapshot captured last time, which
   * by then is stale. View preferences and filters are deliberately NOT cleared:
   * those are meant to persist, and are what `partialize` writes to storage.
   */
  resetTransientState: () => void;
}

// ---------------------------------------------------------------------------
// Combined Store Type
// ---------------------------------------------------------------------------

export type OrderStore = ViewPreferencesSlice &
  FilterUISlice &
  ModalsSlice &
  SelectionSlice &
  TransientSlice;

// ---------------------------------------------------------------------------
// Store Implementation
// ---------------------------------------------------------------------------

export const useOrderStore = create<OrderStore>()(
  persist(
    (set, _get) => ({
      // =====================================================================
      // View Preferences Slice
      // =====================================================================
      viewMode: "list",
      compactView: 0,
      compactGrid: false,
      actionDock: true,
      showSearchBar: true,
      analyticsLevel: 0,
      toolbarCollapsed: false,
      soundEnabled: true,

      setViewMode: (mode) => set({ viewMode: mode }),
      setCompactView: (val) => set({ compactView: val }),
      setCompactGrid: (val) => set({ compactGrid: val }),
      setActionDock: (val) => set({ actionDock: val }),
      setShowSearchBar: (val) => set({ showSearchBar: val }),
      setAnalyticsLevel: (val) => set({ analyticsLevel: val }),
      setToolbarCollapsed: (val) => set({ toolbarCollapsed: val }),
      toggleToolbarCollapse: () =>
        set((s) => ({ toolbarCollapsed: !s.toolbarCollapsed })),
      setSoundEnabled: (val) => set({ soundEnabled: val }),
      tableDensity: "comfortable",
      hiddenColumns: new Set<string>(),
      setTableDensity: (val) => set({ tableDensity: val }),
      setHiddenColumns: (val) => set({ hiddenColumns: val }),

      // =====================================================================
      // Filter UI Slice
      // =====================================================================
      showFilters: false,
      showPresets: false,
      newPresetName: "",
      groupBy: "none",
      filterDuplicatesOnly: false,
      filterDueToday: false,
      sortConfig: null,
      sortConfigs: [],
      columnFilters: {},
      openFilterColumn: null,
      activePresetId: null,
      datePreset: null,
      localSearchQuery: "",
      activeDateRange: { startDate: null, endDate: null },

      setShowFilters: (val) => set({ showFilters: val }),
      setShowPresets: (val) => set({ showPresets: val }),
      setNewPresetName: (name) => set({ newPresetName: name }),
      setGroupBy: (val) => set({ groupBy: val }),
      setFilterDuplicatesOnly: (val) => set({ filterDuplicatesOnly: val }),
      setFilterDueToday: (val) => set({ filterDueToday: val }),
      toggleSort: (key, shiftKey) =>
        set((s) => {
          if (shiftKey) {
            // Multi-sort: add or toggle this key in the sortConfigs array (max 3)
            const existing = s.sortConfigs.findIndex(sc => sc.key === key);
            const next = [...s.sortConfigs];
            if (existing >= 0) {
              if (next[existing].direction === "asc") {
                next[existing] = { key, direction: "desc" };
              } else {
                next.splice(existing, 1);
              }
            } else if (next.length < 3) {
              next.push({ key, direction: "asc" });
            }
            return { sortConfigs: next, sortConfig: next.length === 1 ? next[0] : next.length === 0 ? null : s.sortConfig };
          }
          // Single sort (original behavior)
          if (s.sortConfig?.key === key) {
            if (s.sortConfig.direction === "asc")
              return { sortConfig: { key, direction: "desc" }, sortConfigs: [{ key, direction: "desc" }] };
            return { sortConfig: null, sortConfigs: [] };
          }
          return { sortConfig: { key, direction: "asc" }, sortConfigs: [{ key, direction: "asc" }] };
        }),
      setColumnFilters: (filters) => set({ columnFilters: filters }),
      setOpenFilterColumn: (val) => set({ openFilterColumn: val }),
      setActivePresetId: (id) => set({ activePresetId: id }),
      setDatePreset: (preset) => set({ datePreset: preset }),
      setLocalSearchQuery: (q) => set({ localSearchQuery: q }),
      setActiveDateRange: (range) => set({ activeDateRange: range }),

      // =====================================================================
      // Modals Slice
      // =====================================================================
      isModalOpen: false,
      selectedOrder: null,
      isCreateModalOpen: false,
      showDuplicateModal: false,
      duplicateOrder: null,
      cancelDialogOpen: false,
      orderToCancel: null,
      rejectDialogOpen: false,
      orderToReject: null,
      templatePanelOpen: false,
      orderForTemplate: null,
      isImportModalOpen: false,
      isExportModalOpen: false,
      splitOrderDialog: { open: false, order: null },
      screenshotOrder: null,
      showDatePicker: false,
      datePickerPos: { top: 0, left: 0 },
      colorPickerOpenId: null,

      openOrderDetails: (order) =>
        set({ isModalOpen: true, selectedOrder: order }),
      closeOrderDetails: () =>
        set({ isModalOpen: false, selectedOrder: null }),
      setSelectedOrder: (order) => set({ selectedOrder: order }),
      setIsModalOpen: (val) => set({ isModalOpen: val }),
      setIsCreateModalOpen: (val) => set({ isCreateModalOpen: val }),
      openDuplicateModal: (order) =>
        set({ showDuplicateModal: true, duplicateOrder: order }),
      closeDuplicateModal: () =>
        set({ showDuplicateModal: false, duplicateOrder: null }),
      setShowDuplicateModal: (val) => set({ showDuplicateModal: val }),
      setDuplicateOrder: (order) => set({ duplicateOrder: order }),
      openCancelDialog: (order) =>
        set({ cancelDialogOpen: true, orderToCancel: order }),
      closeCancelDialog: () =>
        set({ cancelDialogOpen: false, orderToCancel: null }),
      setCancelDialogOpen: (val) => set({ cancelDialogOpen: val }),
      setOrderToCancel: (order) => set({ orderToCancel: order }),
      openRejectDialog: (order) =>
        set({ rejectDialogOpen: true, orderToReject: order }),
      closeRejectDialog: () =>
        set({ rejectDialogOpen: false, orderToReject: null }),
      setRejectDialogOpen: (val) => set({ rejectDialogOpen: val }),
      setOrderToReject: (order) => set({ orderToReject: order }),
      openTemplatePanel: (order) =>
        set({ templatePanelOpen: true, orderForTemplate: order }),
      closeTemplatePanel: () =>
        set({ templatePanelOpen: false, orderForTemplate: null }),
      setTemplatePanelOpen: (val) => set({ templatePanelOpen: val }),
      setOrderForTemplate: (order) => set({ orderForTemplate: order }),
      setIsImportModalOpen: (val) => set({ isImportModalOpen: val }),
      setIsExportModalOpen: (val) => set({ isExportModalOpen: val }),
      openSplitDialog: (order) =>
        set({ splitOrderDialog: { open: true, order } }),
      closeSplitDialog: () =>
        set({ splitOrderDialog: { open: false, order: null } }),
      setSplitOrderDialog: (val) => set({ splitOrderDialog: val }),
      setScreenshotOrder: (order) => set({ screenshotOrder: order }),
      setShowDatePicker: (val) => set({ showDatePicker: val }),
      setDatePickerPos: (pos) => set({ datePickerPos: pos }),
      setColorPickerOpenId: (id) => set({ colorPickerOpenId: id }),

      // =====================================================================
      // Selection Slice
      // =====================================================================
      selectedOrders: new Set<string>(),
      showArchived: false,
      loadingId: null,

      toggleOrderSelection: (orderId) =>
        set((s) => {
          const next = new Set(s.selectedOrders);
          if (next.has(orderId)) next.delete(orderId);
          else next.add(orderId);
          return { selectedOrders: next };
        }),
      selectAll: (orderIds) => set({ selectedOrders: new Set(orderIds) }),
      clearSelection: () => set({ selectedOrders: new Set<string>() }),
      setSelectedOrders: (val) => set({ selectedOrders: val }),
      setShowArchived: (val) => set({ showArchived: val }),
      setLoadingId: (id) => set({ loadingId: id }),

      // =====================================================================
      // Transient Slice
      // =====================================================================
      isFilterPanelAnimating: false,
      isHeaderAnimating: false,
      notificationsEnabled: true,

      editingCell: null,
      setEditingCell: (val) => set({ editingCell: val }),
      setIsFilterPanelAnimating: (val) => set({ isFilterPanelAnimating: val }),
      setIsHeaderAnimating: (val) => set({ isHeaderAnimating: val }),
      setNotificationsEnabled: (val) => set({ notificationsEnabled: val }),

      resetTransientState: () => set({
        // Modals and the order snapshots they hold
        isModalOpen: false,
        selectedOrder: null,
        isCreateModalOpen: false,
        showDuplicateModal: false,
        duplicateOrder: null,
        cancelDialogOpen: false,
        orderToCancel: null,
        rejectDialogOpen: false,
        orderToReject: null,
        templatePanelOpen: false,
        orderForTemplate: null,
        isImportModalOpen: false,
        isExportModalOpen: false,
        splitOrderDialog: { open: false, order: null },
        screenshotOrder: null,
        showDatePicker: false,
        colorPickerOpenId: null,
        // Bulk selection and in-flight row state
        selectedOrders: new Set<string>(),
        loadingId: null,
        editingCell: null,
        // Animation latches
        isFilterPanelAnimating: false,
        isHeaderAnimating: false,
      }),
    }),
    {
      name: "orders-ui-store",
      storage: createJSONStorage(() => debouncedLocalStorage),
      // Only persist view preferences — everything else is transient
      partialize: (state) => ({
        viewMode: state.viewMode,
        compactView: state.compactView,
        compactGrid: state.compactGrid,
        actionDock: state.actionDock,
        showSearchBar: state.showSearchBar,
        analyticsLevel: state.analyticsLevel,
        toolbarCollapsed: state.toolbarCollapsed,
        soundEnabled: state.soundEnabled,
        tableDensity: state.tableDensity,
        activeDateRange: state.activeDateRange,
        notificationsEnabled: state.notificationsEnabled,
      }),
    }
  )
);
