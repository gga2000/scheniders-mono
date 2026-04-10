"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useInfiniteMerchants } from "@/hooks/use-infinite-merchants";
import { useAdminStore } from "@/store/use-admin-store";
import { MerchantCard } from "@/components/merchants/merchant-card";
import { MerchantFilterBarV2 } from "@/components/merchants/merchant-filter-bar-v2";
import { MerchantBulkBar } from "@/components/merchants/merchant-bulk-bar";
import { BulkActionDialog } from "@/components/merchants/bulk-action-dialog";
import { ExportButton } from "@/components/shared/export-button";
import { VirtualizedMerchantTable } from "@/components/merchants/virtualized-merchant-table";
import { MerchantSheetView } from "@/components/merchants/merchant-sheet-view";
import { MerchantDensityToggle } from "@/components/merchants/merchant-density-toggle";
import { MerchantColumnVisibility } from "@/components/merchants/merchant-column-visibility";
import { MerchantSearchInput } from "@/components/merchants/merchant-search-input";
import { MerchantSavedViews } from "@/components/merchants/merchant-saved-views";
import { AdvancedFilterBuilder } from "@/components/merchants/advanced-filter-builder";
import { MerchantDetailDialog } from "@/components/merchants/merchant-detail-dialog";
import { MerchantDetailPanel } from "@/components/merchants/merchant-detail-panel";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/types/admin";

// ── View mode config ───────────────────────────────────────────────────
const VIEW_MODES: Array<{ value: ViewMode; icon: typeof LayoutGrid; label: string }> = [
  { value: "cards", icon: LayoutGrid, label: "Cards" },
  { value: "table", icon: List, label: "Table" },
  { value: "sheet", icon: Sheet, label: "Sheet" },
];

export default function MerchantsPage() {
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const {
    merchants,
    total,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteMerchants(50);

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
  } = useAdminStore();

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

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6" />
            Merchants
          </h1>
          <p className="text-foreground-muted mt-1">
            {isLoading ? "Loading..." : `${total} merchant${total !== 1 ? "s" : ""}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <MerchantSearchInput />

          {/* Select All */}
          {merchants.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-foreground/60 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded border-[var(--card-border)] accent-[var(--primary)]"
              />
              Select all
            </label>
          )}

          <ExportButton type="merchants" />

          {/* Advanced Filters */}
          <button
            onClick={() => setShowAdvancedFilters(true)}
            className="p-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-foreground/40 hover:text-foreground/70 transition-all"
            title="Advanced filters"
            aria-label="Open advanced filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* Density Toggle (table/sheet only) */}
          {viewMode !== "cards" && (
            <MerchantDensityToggle density={density} onChange={setDensity} />
          )}

          {/* Column Visibility (table only) */}
          {viewMode === "table" && (
            <MerchantColumnVisibility
              hiddenColumns={hiddenColumns}
              onToggle={toggleColumn}
              onReset={resetColumns}
            />
          )}

          {/* View Toggle */}
          <div className="flex items-center gap-0.5 bg-[var(--card-bg)] rounded-xl p-1 border border-[var(--card-border)]">
            {VIEW_MODES.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.value}
                  onClick={() => setViewMode(mode.value)}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    viewMode === mode.value
                      ? "bg-[var(--background)] text-foreground shadow-sm"
                      : "text-foreground/40 hover:text-foreground/70"
                  )}
                  title={mode.label}
                  aria-label={`${mode.label} view`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Saved Views Tabs ────────────────────────────────────────── */}
      <MerchantSavedViews />

      {/* ── Filter Bar ──────────────────────────────────────────────── */}
      <MerchantFilterBarV2 />

      {/* ── Content ─────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: EASE_CROSSFADE as unknown as number[] }}
            className="flex items-center justify-center py-20"
          >
            <Loader2 className="w-8 h-8 animate-spin text-foreground/30" />
          </motion.div>
        ) : merchants.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_CROSSFADE as unknown as number[] }}
            className="flex flex-col items-center justify-center py-20 text-foreground/40"
          >
            <Building2 className="w-12 h-12 mb-3" />
            <p className="text-lg font-semibold">No merchants found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </motion.div>
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
            {merchants.map((merchant) => (
              <motion.div
                key={merchant.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
              >
                <MerchantCard
                  merchant={merchant}
                  isSelected={selectedMerchants.has(merchant.id)}
                  onToggleSelect={toggleMerchantSelection}
                  onOpenDetail={handleOpenDetail}
                  onOpenPanel={handleOpenPanel}
                />
              </motion.div>
            ))}
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
    </div>
  );
}
