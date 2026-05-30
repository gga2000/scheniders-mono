"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useInfiniteMerchants } from "@/hooks/use-infinite-merchants";
import { useAdminStore } from "@/store/use-admin-store";
import { useMerchantKeyboardNav } from "@/hooks/use-merchant-keyboard-nav";
import { useLastActors } from "@/hooks/use-last-actors";
import { MerchantCard } from "@/components/merchants/merchant-card";
import { MerchantFilterBarV2 } from "@/components/merchants/merchant-filter-bar-v2";
import { MerchantBulkBar } from "@/components/merchants/merchant-bulk-bar";
import { BulkActionDialog } from "@/components/merchants/bulk-action-dialog";
import { ExportButton } from "@/components/shared/export-button";
import { VirtualizedMerchantTable } from "@/components/merchants/virtualized-merchant-table";
import { MerchantSheetView } from "@/components/merchants/merchant-sheet-view";
import { MerchantDensityToggle } from "@/components/merchants/merchant-density-toggle";
import { MerchantColumnVisibility } from "@/components/merchants/merchant-column-visibility";
import { AdvancedFilterBuilder } from "@/components/merchants/advanced-filter-builder";
import { MerchantDetailDialog } from "@/components/merchants/merchant-detail-dialog";
import { MerchantDetailPanel } from "@/components/merchants/merchant-detail-panel";
import { SmartAlertRules } from "@/components/merchants/smart-alert-rules";
import { MerchantsDigestBanner } from "@/components/merchants/merchants-digest-banner";
import { MerchantsRollupStrip } from "@/components/merchants/merchants-rollup-strip";
import { MerchantsMapView } from "@/components/merchants/merchants-map-view";
import { MerchantsCompareDialog } from "@/components/merchants/merchants-compare-dialog";
import { MerchantsKanbanView } from "@/components/merchants/merchants-kanban-view";
import { MerchantEmptyState } from "@/components/merchants/merchant-empty-state";
import { MerchantCardGridSkeleton } from "@/components/merchants/merchant-card-skeleton";
import { KeyboardShortcutsOverlay } from "@/components/merchants/keyboard-shortcuts-overlay";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import { useRealtimePulse } from "@/store/use-realtime-pulse";
import {
  EASE_CROSSFADE,
  STAGGER_CHILDREN,
  DELAY_CHILDREN,
} from "@/lib/animation-constants";
import {
  Building2,
  LayoutGrid,
  List,
  Sheet,
  Loader2,
  SlidersHorizontal,
  CheckSquare,
  MapPin,
  Kanban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/types/admin";

// ── View mode config ───────────────────────────────────────────────────
const VIEW_MODES: Array<{ value: ViewMode; icon: typeof LayoutGrid; label: string }> = [
  { value: "cards", icon: LayoutGrid, label: "Cards" },
  { value: "table", icon: List, label: "Table" },
  { value: "sheet", icon: Sheet, label: "Sheet" },
  { value: "map", icon: MapPin, label: "Map" },
  { value: "kanban", icon: Kanban, label: "Pipeline" },
];

export default function MerchantsPage() {
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const {
    merchants,
    total,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteMerchants(50);

  const visibleTenantIds = merchants.map((m) => m.id);
  const { data: lastActorsData } = useLastActors(visibleTenantIds);
  const lastActorsMap = lastActorsData?.actors ?? {};

  const {
    viewMode,
    setViewMode,
    density,
    setDensity,
    selectedMerchants,
    toggleMerchantSelection,
    selectAllMerchants,
    selectRange,
    clearSelection,
    lastSelectedIndex,
    setLastSelectedIndex,
    focusedIndex,
    hiddenColumns,
    toggleColumn,
    resetColumns,
    columnOrder,
    sortConfig,
    toggleSort,
    starredMerchants,
    toggleStar,
    detailViewMode,
    activeDetailId,
    setActiveDetailId,
    setDetailViewMode,
    searchQuery,
    clearFilters,
    setSearchQuery,
    planFilter,
    statusFilter,
    cityFilter,
    balanceFilter,
    healthFilter,
  } = useAdminStore();

  const pulsingMerchants = useRealtimePulse((s) => s.pulsing);

  const hasActiveFilters = !!(planFilter || statusFilter || cityFilter || balanceFilter || healthFilter);
  const hasActiveSearch = !!searchQuery.trim();

  // ── Infinite scroll sentinel ─────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Select all ───────────────────────────────────────────────────────
  const allSelected =
    merchants.length > 0 &&
    merchants.every((m) => selectedMerchants.has(m.id));

  function handleSelectAll() {
    if (allSelected) {
      clearSelection();
    } else {
      selectAllMerchants(merchants.map((m) => m.id));
    }
  }

  // ── Bulk actions ─────────────────────────────────────────────────────
  function handleBulkAction(action: string) {
    if (action === "export") {
      window.open("/api/export?type=merchants&format=csv");
      return;
    }
    if (action === "compare") {
      setCompareOpen(true);
      return;
    }
    setBulkAction(action);
  }

  // ── Shift+click selection ────────────────────────────────────────────
  const merchantIds = merchants.map((m) => m.id);

  const handleSelectWithShift = useCallback(
    (index: number, shiftKey: boolean) => {
      if (shiftKey && lastSelectedIndex !== null) {
        selectRange(lastSelectedIndex, index, merchantIds);
      } else {
        toggleMerchantSelection(merchantIds[index]);
      }
      setLastSelectedIndex(index);
    },
    [lastSelectedIndex, merchantIds, selectRange, toggleMerchantSelection, setLastSelectedIndex]
  );

  // ── Open detail ──────────────────────────────────────────────────────
  const handleOpenDetail = useCallback(
    (id: string) => {
      setDetailViewMode("dialog");
      setActiveDetailId(id);
    },
    [setActiveDetailId, setDetailViewMode]
  );

  const handleOpenPanel = useCallback(
    (id: string) => {
      setDetailViewMode("panel");
      setActiveDetailId(id);
    },
    [setActiveDetailId, setDetailViewMode]
  );

  const handleToggleShortcuts = useCallback(() => {
    setShowShortcuts((v) => !v);
  }, []);

  // ── Keyboard navigation ──────────────────────────────────────────────
  useMerchantKeyboardNav({
    merchants,
    onOpenDetail: handleOpenDetail,
    onToggleShortcuts: handleToggleShortcuts,
  });

  return (
    <div className="p-4 md:p-6 space-y-4 merchants-page">
      {/* ── Title Row — minimal: count + view modes ───────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Select All — Custom Glass Checkbox */}
          {merchants.length > 0 && (
            <button
              onClick={handleSelectAll}
              className={cn(
                "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 shrink-0 group relative overflow-hidden",
                allSelected
                  ? "border-transparent text-white"
                  : "border-foreground/30 hover:border-violet-500/50"
              )}
              title={allSelected ? "Deselect all" : "Select all"}
            >
              {allSelected && (
                <div className="absolute inset-0 bg-linear-to-br from-violet-500 to-purple-600 opacity-100" />
              )}
              <CheckSquare
                className={cn(
                  "w-3.5 h-3.5 z-10 transition-transform duration-300",
                  selectedMerchants.size > 0 ? "scale-100" : "scale-0"
                )}
              />
            </button>
          )}

          {/* Merchant Count — Glass Pill */}
          <div className="flex items-center gap-3 pl-2 pr-5 py-2 rounded-full bg-white/40 backdrop-blur-md border border-white/20 ring-1 ring-black/5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] merchants-toolbar-pill">
            <div className="p-2 rounded-full bg-linear-to-tr from-violet-400 to-purple-600 dark:bg-none! dark:bg-primary text-white dark:text-black shadow-lg shadow-violet-500/30 dark:shadow-[0_0_12px_rgba(239,255,0,0.4)]">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="flex flex-col leading-none">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-foreground dark:text-white">
                  {isLoading ? "—" : total}
                </span>
                <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wide">
                  {total === 1 ? "Merchant" : "Merchants"}
                </span>
              </div>
            </div>
          </div>

          {/* Selection Indicator */}
          <AnimatePresence>
            {selectedMerchants.size > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, x: -20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: -20 }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500 text-white shadow-lg shadow-violet-500/25"
              >
                <span className="text-sm font-bold">{selectedMerchants.size}</span>
                <span className="text-xs font-medium opacity-80">selected</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {/* ── Daily Digest Banner (dismissable per session) ─────────── */}
      <MerchantsDigestBanner />

      {/* ── Rollup Strip (Wallet · MRR · ARR · Usage 30d · Active) ── */}
      <MerchantsRollupStrip />

      {/* ── White Filter Card (orders-style) ───────────────────────── */}
      <div className="sticky top-2 z-20 rounded-3xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.4)] p-5 merchants-toolbar-group">
        <MerchantFilterBarV2
          searchAccessory={
            <>
              {viewMode !== "cards" && (
                <MerchantDensityToggle density={density} onChange={setDensity} />
              )}
              {viewMode === "table" && (
                <MerchantColumnVisibility
                  hiddenColumns={hiddenColumns}
                  onToggle={toggleColumn}
                  onReset={resetColumns}
                />
              )}
              <button
                onClick={() => setShowAdvancedFilters(true)}
                className="p-2 rounded-lg text-foreground/50 hover:bg-foreground/5 hover:text-foreground transition-all"
                title="Advanced filters"
                aria-label="Open advanced filters"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              <SmartAlertRules merchants={merchants} />
              <div className="w-px h-5 bg-foreground/10 mx-1" />
              <ExportButton type="merchants" />
            </>
          }
          pillsAccessory={
            <div className="flex items-center gap-0.5 bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]">
              {VIEW_MODES.map((mode) => {
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.value}
                    onClick={() => setViewMode(mode.value)}
                    className={cn(
                      "p-1.5 rounded-lg transition-all",
                      viewMode === mode.value
                        ? "bg-[var(--card-bg)] text-foreground shadow-sm dark:bg-primary dark:text-black"
                        : "text-foreground/50 hover:text-foreground"
                    )}
                    title={mode.label}
                    aria-label={`${mode.label} view`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          }
        />
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <ErrorBoundary name="Merchant List">
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: EASE_CROSSFADE as unknown as number[] }}
          >
            <MerchantCardGridSkeleton count={8} />
          </motion.div>
        ) : merchants.length === 0 ? (
          <MerchantEmptyState
            hasFilters={hasActiveFilters}
            hasSearch={hasActiveSearch}
            searchQuery={searchQuery}
            onClearFilters={clearFilters}
            onClearSearch={() => setSearchQuery("")}
          />
        ) : viewMode === "cards" ? (
          <motion.div
            key="cards"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.2,
              ease: EASE_CROSSFADE as unknown as number[],
              staggerChildren: STAGGER_CHILDREN,
              delayChildren: DELAY_CHILDREN,
            }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            {merchants.map((merchant, idx) => (
              <motion.div
                key={merchant.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
              >
                <MerchantCard
                  merchant={merchant}
                  isSelected={selectedMerchants.has(merchant.id)}
                  isPulsing={pulsingMerchants.has(merchant.id)}
                  isStarred={starredMerchants.includes(merchant.id)}
                  index={idx}
                  lastActor={lastActorsMap[merchant.id] ?? null}
                  onToggleSelect={toggleMerchantSelection}
                  onSelectWithShift={handleSelectWithShift}
                  onOpenDetail={handleOpenDetail}
                  onOpenPanel={handleOpenPanel}
                  onToggleStar={toggleStar}
                />
              </motion.div>
            ))}
          </motion.div>
        ) : viewMode === "map" ? (
          <motion.div
            key="map"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_CROSSFADE as unknown as number[] }}
          >
            <MerchantsMapView
              merchants={merchants}
              onMerchantClick={handleOpenDetail}
            />
          </motion.div>
        ) : viewMode === "kanban" ? (
          <motion.div
            key="kanban"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_CROSSFADE as unknown as number[] }}
          >
            <MerchantsKanbanView
              merchants={merchants}
              onOpenDetail={handleOpenDetail}
            />
          </motion.div>
        ) : viewMode === "table" ? (
          <motion.div
            key="table"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_CROSSFADE as unknown as number[] }}
          >
            <VirtualizedMerchantTable
              merchants={merchants}
              density={density}
              hiddenColumns={hiddenColumns}
              columnOrder={columnOrder}
              sortConfig={sortConfig}
              selectedMerchants={selectedMerchants}
              starredMerchants={starredMerchants}
              focusedIndex={focusedIndex}
              onToggleSelect={toggleMerchantSelection}
              onToggleSort={toggleSort}
              onToggleStar={toggleStar}
              onOpenDetail={handleOpenDetail}
              onSelectWithShift={handleSelectWithShift}
            />
          </motion.div>
        ) : (
          <motion.div
            key="sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: EASE_CROSSFADE as unknown as number[] }}
          >
            <MerchantSheetView
              merchants={merchants}
              sortConfig={sortConfig}
              selectedMerchants={selectedMerchants}
              starredMerchants={starredMerchants}
              onToggleSelect={toggleMerchantSelection}
              onToggleSort={toggleSort}
              onToggleStar={toggleStar}
              onOpenDetail={handleOpenDetail}
              onSelectWithShift={handleSelectWithShift}
            />
          </motion.div>
        )}
      </AnimatePresence>
      </ErrorBoundary>

      {/* ── Infinite scroll sentinel ────────────────────────────────── */}
      <div ref={sentinelRef} className="h-4" />
      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-foreground/30" />
          <span className="text-xs text-foreground/40 ml-2">Loading more...</span>
        </div>
      )}

      {/* ── Bulk Actions ────────────────────────────────────────────── */}
      <MerchantBulkBar
        selectedCount={selectedMerchants.size}
        onClearSelection={clearSelection}
        onBulkAction={handleBulkAction}
      />

      <BulkActionDialog
        action={bulkAction}
        selectedCount={selectedMerchants.size}
        selectedIds={[...selectedMerchants]}
        onClose={() => setBulkAction(null)}
        onSuccess={() => clearSelection()}
      />

      <MerchantsCompareDialog
        open={compareOpen}
        merchants={merchants.filter((m) => selectedMerchants.has(m.id)).slice(0, 4)}
        onClose={() => setCompareOpen(false)}
        onOpenDetail={handleOpenDetail}
      />

      {/* ── Advanced Filter Builder ─────────────────────────────────── */}
      <AdvancedFilterBuilder
        isOpen={showAdvancedFilters}
        onClose={() => setShowAdvancedFilters(false)}
        onApply={() => {
          // Advanced filters are applied through the modal
          // Future: pass filters to API via query param
        }}
      />

      {/* ── Detail Views ───────────────────────────────────────────── */}
      {detailViewMode === "dialog" && <MerchantDetailDialog />}
      <MerchantDetailPanel />

      {/* ── Keyboard Shortcuts Overlay ─────────────────────────────── */}
      <KeyboardShortcutsOverlay
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
    </div>
  );
}
