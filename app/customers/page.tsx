"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useCustomerUrlState } from "@/hooks/use-customer-url-state";
import { usePaginatedCustomers } from "@/hooks/use-paginated-customers";
import { useLanguage } from "@/hooks/use-language";
import { PageTransition } from "@/components/layout/page-transition";
import { motion, AnimatePresence } from "framer-motion";
import { Users, LayoutGrid, List, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";

import { CustomerOmniSearch } from "@/components/customers/omni-search";
import { VirtualizedCustomerList } from "@/components/customers/virtualized-list";
import { CustomerTopMetrics } from "@/components/customers/top-metrics";
import { CustomerDetailModal } from "@/components/customers/customer-detail-modal";
import { AdvancedCustomerFilters } from "@/components/customers/advanced-filters";
import { BulkTagModal } from "@/components/customers/bulk-tag-modal";
import { BroadcastModal } from "@/components/customers/broadcast-modal";
import { CustomerSplitPaneSkeleton } from "@/components/ui/skeletons";
import { useCustomerBulkActions } from "@/hooks/use-bulk-actions";
// NEW Phase 1 Components
import { StickyCustomerFilterBar } from "@/components/customers/sticky-filter-bar";
import { FloatingCustomerActionBar } from "@/components/customers/floating-action-bar";
import { SavedCustomerViewsTabs } from "@/components/customers/saved-views-tabs";
import { useCustomerFilterPresets } from "@/hooks/use-customer-filter-presets";

export default function CustomersPage() {
    const { t } = useLanguage();

    // 1. URL State Management (Filters & Selection)
    const {
        state,
        rawSearch, setSearch,
        setStatus,
        setCity,
        setSort,
        setSelectedCustomer
    } = useCustomerUrlState();

    // Derived for easy access
    const statusFilter = state.status;
    const selectedCustomerId = state.customerId;

    // 2. Server-side Data Fetching
    const {
        data,
        isLoading,
        isError,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage
    } = usePaginatedCustomers();

    // Local state for bulk actions and UI
    const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
    const [isTagModalOpen, setIsTagModalOpen] = useState(false);
    const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
    const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
    const [compactLevel, setCompactLevel] = useState<0 | 1 | 2>(1); // 0=full, 1=semi, 2=ultra
    const [activePresetId, setActivePresetId] = useState<string | null>(null);
    const [showFilters, setShowFilters] = useState(true);
    const [groupBy, setGroupBy] = useState<'none' | 'status' | 'city' | 'governorate'>('none');

    const { exportToCSV, bulkAddTags, isTagging } = useCustomerBulkActions();
    const { presets, savePreset, deletePreset, applyPreset } = useCustomerFilterPresets();

    // Derived state
    const customers = useMemo(() => {
        return data?.pages.flatMap(page => page.customers) ?? [];
    }, [data]);

    const totalCount = data?.pages[0]?.totalCount ?? 0;

    // Find the full customer object for the selected ID to pass to the profile panel
    const activeCustomer = useMemo(() => {
        if (!selectedCustomerId) return null;
        return customers.find(c => c.phone === selectedCustomerId) || null;
    }, [selectedCustomerId, customers]);

    // Multi-select handlers
    const handleToggleSelection = useCallback((phone: string) => {
        setSelectedPhones(prev => {
            const newSet = new Set(prev);
            if (newSet.has(phone)) {
                newSet.delete(phone);
            } else {
                newSet.add(phone);
            }
            return newSet;
        });
    }, []);

    const handleSelectAll = useCallback(() => {
        setSelectedPhones(new Set(customers.map(c => c.phone)));
    }, [customers]);

    const handleClearSelection = useCallback(() => {
        setSelectedPhones(new Set());
    }, []);

    // Preset handlers
    const handleSelectPreset = useCallback((presetId: string) => {
        const preset = presets.find(p => p.id === presetId);
        if (preset) {
            applyPreset(preset);
            setActivePresetId(presetId);
        }
    }, [presets, applyPreset]);

    const handleSavePreset = useCallback((name: string) => {
        savePreset(name);
    }, [savePreset]);

    const handleDeletePreset = useCallback((presetId: string) => {
        deletePreset(presetId);
        if (activePresetId === presetId) {
            setActivePresetId(null);
        }
    }, [deletePreset, activePresetId]);

    const handleClearFilter = useCallback(() => {
        setStatus("all");
        setActivePresetId(null);
    }, [setStatus]);

    // Handle Loader/Error States
    if (isLoading) return <CustomerSplitPaneSkeleton />;

    if (isError) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="pastel-card pastel-card-pink p-8 text-center max-w-md w-full">
                    <h2 className="text-xl font-bold text-rose-900 mb-2">Failed to load customers</h2>
                    <p className="text-rose-700">Please check your connection and try again.</p>
                </div>
            </div>
        );
    }

    return (
        <PageTransition>
            <div className="min-h-[calc(100vh-5rem)] h-[calc(100vh-5rem)] p-4 md:p-6 flex flex-col overflow-hidden relative">

                {/* Global Header with Saved Views */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">
                                <Users className="w-6 h-6 sm:w-8 sm:h-8" />
                                {t("customers.title")}
                            </h1>
                            <p className="text-muted mt-1 text-sm">
                                Managing {totalCount.toLocaleString()} {totalCount === 1 ? 'customer' : 'customers'}
                            </p>
                        </div>
                    </div>

                    {/* Saved Views Tabs & View Mode Toggle */}
                    <div className="flex items-center gap-3">
                        <SavedCustomerViewsTabs
                            presets={presets}
                            activePresetId={activePresetId}
                            onSelect={handleSelectPreset}
                            onSave={handleSavePreset}
                            onDelete={handleDeletePreset}
                            onClearFilter={handleClearFilter}
                        />

                        {/* View Mode Toggle */}
                        <div className="flex items-center gap-1 p-1 bg-white/60 dark:bg-[#1E1E1E] backdrop-blur-md border border-white/20 dark:border-[#333333] rounded-xl">
                            <button
                                onClick={() => setCompactLevel(0)}
                                className={cn(
                                    "p-2 rounded-lg transition-all",
                                    compactLevel === 0
                                        ? "bg-white dark:bg-[#2A2A2A] shadow-sm text-primary dark:text-[#EFFF00]"
                                        : "text-muted-foreground hover:text-foreground dark:hover:text-white"
                                )}
                                title="Full View"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setCompactLevel(1)}
                                className={cn(
                                    "p-2 rounded-lg transition-all",
                                    compactLevel === 1
                                        ? "bg-white dark:bg-[#2A2A2A] shadow-sm text-primary dark:text-[#EFFF00]"
                                        : "text-muted-foreground hover:text-foreground dark:hover:text-white"
                                )}
                                title="Semi-Compact"
                            >
                                <List className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setCompactLevel(2)}
                                className={cn(
                                    "p-2 rounded-lg transition-all",
                                    compactLevel === 2
                                        ? "bg-white dark:bg-[#2A2A2A] shadow-sm text-primary dark:text-[#EFFF00]"
                                        : "text-muted-foreground hover:text-foreground dark:hover:text-white"
                                )}
                                title="Ultra-Compact"
                            >
                                <Rows3 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Top Level Analytics */}
                <CustomerTopMetrics />

                {/* Main Content Layout */}
                <div className="flex flex-1 overflow-hidden relative">

                    {/* Master List */}
                    <div className="w-full h-full flex flex-col">
                        {/* Search & Sticky Filter Bar */}
                        <div className="space-y-4 mb-4 flex-shrink-0">
                            <div className="flex gap-2 items-center w-full">
                                <div className="flex-1">
                                    <CustomerOmniSearch rawSearch={rawSearch || ""} setSearch={setSearch} />
                                </div>
                                <button
                                    onClick={() => setIsAdvancedFiltersOpen(true)}
                                    className="h-10 px-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm font-medium hover:bg-[var(--card-border)] transition-colors flex items-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                                    Filters
                                    {/* Show count of active advanced filters */}
                                    {(() => {
                                        const count = [state.minLtv, state.maxLtv, state.lastOrderWithinDays, state.tagId].filter(v => v !== undefined).length;
                                        return count > 0 ? (
                                            <span className="w-5 h-5 rounded-full bg-[var(--ink)] text-white text-[10px] flex items-center justify-center -ml-1">
                                                {count}
                                            </span>
                                        ) : null;
                                    })()}
                                </button>
                            </div>

                            {/* NEW: Sticky Filter Bar with Status Pills */}
                            <StickyCustomerFilterBar
                                filters={{
                                    status: statusFilter,
                                    search: state.search,
                                    city: state.city,
                                    minLtv: state.minLtv,
                                    maxLtv: state.maxLtv,
                                    lastOrderWithinDays: state.lastOrderWithinDays,
                                    tagId: state.tagId,
                                }}
                                setFilters={(newFilters) => {
                                    if (newFilters.status !== undefined) setStatus(newFilters.status);
                                }}
                                statusCounts={{
                                    all: totalCount,
                                    vip: 0, // Will be calculated from data
                                    regular: 0,
                                    new: 0,
                                }}
                                showFilters={showFilters}
                                setShowFilters={setShowFilters}
                                hasActiveFilters={!!(state.minLtv || state.maxLtv || state.lastOrderWithinDays || state.tagId)}
                                groupBy={groupBy}
                                setGroupBy={setGroupBy}
                            />
                        </div>

                        {/* The High-Performance List */}
                        <div className="flex-1 bg-[var(--background)] border border-[var(--card-border)] rounded-3xl overflow-hidden shadow-sm flex flex-col relative is-active group">
                            {/* Faded gradient at top of list for smooth visual entry */}
                            <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-[var(--background)] to-transparent z-10 pointer-events-none" />

                            <VirtualizedCustomerList
                                customers={customers}
                                totalCount={totalCount}
                                isLoading={isLoading}
                                isFetchingNextPage={isFetchingNextPage}
                                hasNextPage={!!hasNextPage}
                                fetchNextPage={fetchNextPage}
                                selectedCustomerId={selectedCustomerId}
                                onSelectCustomer={setSelectedCustomer}
                                selectedPhones={selectedPhones}
                                onToggleSelection={handleToggleSelection}
                                onSelectAll={handleSelectAll}
                                onClearSelection={handleClearSelection}
                                compactLevel={compactLevel}
                            />

                            {/* Faded gradient at bottom of list */}
                            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[var(--background)] to-transparent z-10 pointer-events-none" />
                        </div>
                    </div>

                </div>

                <CustomerDetailModal
                    customer={activeCustomer}
                    isOpen={!!selectedCustomerId}
                    onClose={() => setSelectedCustomer(null)}
                />

                {/* NEW: Floating Action Bar for Bulk Operations */}
                <FloatingCustomerActionBar
                    selectedCount={selectedPhones.size}
                    onAddTags={() => setIsTagModalOpen(true)}
                    onExport={() => exportToCSV(Array.from(selectedPhones))}
                    onBroadcastMessage={() => setIsBroadcastModalOpen(true)}
                />

                <BulkTagModal
                    isOpen={isTagModalOpen}
                    onClose={() => setIsTagModalOpen(false)}
                    selectedCount={selectedPhones.size}
                    isLoading={isTagging}
                    onConfirm={async (tagIds) => {
                        await bulkAddTags(Array.from(selectedPhones), tagIds);
                        setIsTagModalOpen(false);
                        setSelectedPhones(new Set()); // Clear selection after successful tag
                    }}
                />

                <BroadcastModal
                    isOpen={isBroadcastModalOpen}
                    onClose={() => setIsBroadcastModalOpen(false)}
                    selectedCount={selectedPhones.size}
                    selectedPhones={Array.from(selectedPhones)}
                />

                <AdvancedCustomerFilters
                    isOpen={isAdvancedFiltersOpen}
                    onClose={() => setIsAdvancedFiltersOpen(false)}
                />
            </div>
        </PageTransition>
    );
}
