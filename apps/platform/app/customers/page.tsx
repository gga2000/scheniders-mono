"use client";

import { useMemo, useCallback, useRef, useEffect, useDeferredValue } from "react";
import { useCustomerUrlState } from "@/hooks/use-customer-url-state";
import { usePaginatedCustomers } from "@/hooks/use-paginated-customers";
import { useCustomerStore } from "@/store/use-customer-store";
import { useLanguage } from "@/hooks/use-language";
import { PageTransition } from "@/components/layout/page-transition";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutGrid, List, Rows3, ChevronDown, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

import dynamic from "next/dynamic";

const CustomerOmniSearch = dynamic(
    () => import("@/components/customers/omni-search").then(mod => ({ default: mod.CustomerOmniSearch })),
    { ssr: false }
);

const VirtualizedCustomerList = dynamic(
    () => import("@/components/customers/virtualized-list").then(mod => ({ default: mod.VirtualizedCustomerList })),
    { ssr: false }
);

const CustomerDashboardMetrics = dynamic(
    () => import("@/components/customers/dashboard-metrics").then(mod => ({ default: mod.CustomerDashboardMetrics })),
    { ssr: false }
);

const InsightsDrawer = dynamic(
    () => import("@/components/customers/dashboard-metrics").then(mod => ({ default: mod.InsightsDrawer })),
    { ssr: false }
);

const CustomerDetailModal = dynamic(
    () => import("@/components/customers/customer-detail-modal").then(mod => ({ default: mod.CustomerDetailModal })),
    { ssr: false }
);
import { BulkTagModal } from "@/components/customers/bulk-tag-modal";
import { BroadcastModal } from "@/components/customers/broadcast-modal";
import { CustomerSplitPaneSkeleton } from "@/components/ui/skeletons";
import { useCustomerBulkActions } from "@/hooks/use-bulk-actions";
// NEW Phase 1 Components
import { StickyCustomerFilterBar } from "@/components/customers/sticky-filter-bar";
import { FloatingCustomerActionBar } from "@/components/customers/floating-action-bar";
import { SavedCustomerViewsTabs } from "@/components/customers/saved-views-tabs";
import { useCustomerFilterPresets } from "@/hooks/use-customer-filter-presets";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { DateRangePicker } from "@/components/ui/date-range-picker";

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

    // ── Zustand Store (replaces ~12 useState calls) ──
    const {
        selectedPhones, setSelectedPhones,
        isTagModalOpen, setIsTagModalOpen,
        isBroadcastModalOpen, setIsBroadcastModalOpen,
        compactLevel, setCompactLevel,
        activePresetId, setActivePresetId,
        showFilters, setShowFilters,
        groupBy, setGroupBy,
        isExpandedAnalytics, setIsExpandedAnalytics,
        metricsCollapsed, setMetricsCollapsed,
        dateFrom, setDateFrom,
        dateTo, setDateTo,
    } = useCustomerStore();

    const lastScrollTopRef = useRef(0);

    // Bidirectional scroll: collapse on scroll down, expand on scroll back to top
    const handleListScroll = useCallback((scrollTop: number) => {
        const scrollingDown = scrollTop > lastScrollTopRef.current;
        lastScrollTopRef.current = scrollTop;

        const { metricsCollapsed: collapsed, setMetricsCollapsed: setCollapsed, setIsExpandedAnalytics: setExpanded } = useCustomerStore.getState();
        if (scrollingDown && scrollTop > 150 && !collapsed) {
            setCollapsed(true);
            setExpanded(false);
            localStorage.setItem("customersToolbarCollapsed", "true");
        } else if (!scrollingDown && scrollTop <= 20 && collapsed) {
            setCollapsed(false);
            localStorage.setItem("customersToolbarCollapsed", "false");
        }
    }, []);

    // Ensure we clean up the collapsed state when unmounting
    useEffect(() => {
        return () => {
            localStorage.setItem("customersToolbarCollapsed", "false");
        };
    }, []);

    const { exportToCSV, bulkAddTags, isTagging } = useCustomerBulkActions();
    const { presets, savePreset, deletePreset, applyPreset } = useCustomerFilterPresets();
    const { getCustomerOrderCount } = useOrdersContext();

    // Check if a customer has potential duplicates (more than 1 active order)
    const customerHasDuplicates = useCallback((phone: string): boolean => {
        return getCustomerOrderCount(phone) > 1;
    }, [getCustomerOrderCount]);

    const deferredData = useDeferredValue(data);
    const deferredStatusFilter = useDeferredValue(statusFilter);

    // Derived state — with client-side sort for VIP (highest paying) and Loss (lowest LTV)
    const customers = useMemo(() => {
        const flat = deferredData?.pages.flatMap(page => page.customers) ?? [];
        if (deferredStatusFilter === 'vip') {
            return [...flat].sort((a, b) => b.total_spent - a.total_spent);
        } else if (deferredStatusFilter === 'regular') {
            return [...flat].sort((a, b) => a.total_spent - b.total_spent);
        }
        return flat;
    }, [deferredData, deferredStatusFilter]);

    const totalCount = data?.pages[0]?.totalCount ?? 0;

    // Find the full customer object for the selected ID to pass to the profile panel
    const activeCustomer = useMemo(() => {
        if (!selectedCustomerId) return null;
        return customers.find(c => c.phone === selectedCustomerId) || null;
    }, [selectedCustomerId, customers]);

    // Multi-select handlers
    const handleToggleSelection = useCallback((phone: string) => {
        useCustomerStore.getState().togglePhoneSelection(phone);
    }, []);

    const handleSelectAll = useCallback(() => {
        useCustomerStore.getState().selectAllPhones(customers.map(c => c.phone));
    }, [customers]);

    const handleClearSelection = useCallback(() => {
        useCustomerStore.getState().clearPhoneSelection();
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
    // Only block on skeleton when there is truly no data at all (prevents skeleton flash on stale-while-revalidate)
    const hasAnyData = (data?.pages?.length ?? 0) > 0;
    if (isLoading && !hasAnyData) return <CustomerSplitPaneSkeleton />;

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

                {/* Main Content Layout Wrapper (Metrics + List AND Drawer) */}
                <div className="flex flex-1 overflow-hidden min-h-0 relative gap-6">

                    {/* Main Content Left Side */}
                    <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full">

                        {/* Collapsible Metrics Section */}
                        <div
                            className={cn(
                                "overflow-hidden flex-shrink-0",
                                metricsCollapsed ? "max-h-0 opacity-0 mb-0" : "max-h-[500px] opacity-100 mb-0"
                            )}
                            style={{ transition: "max-height 400ms cubic-bezier(0.4, 0, 0.2, 1), opacity 300ms ease, margin 300ms ease" }}
                        >
                            <CustomerDashboardMetrics
                                isExpanded={isExpandedAnalytics}
                                onToggleExpand={() => setIsExpandedAnalytics(!isExpandedAnalytics)}
                            />
                        </div>

                        {/* Show metrics button when collapsed */}
                        {metricsCollapsed && (
                            <button
                                onClick={() => {
                                    setMetricsCollapsed(false);
                                }}
                                className="flex items-center justify-center gap-2 mb-2 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground bg-[var(--card-bg)] dark:bg-[#1E1E1E] border border-[var(--card-border)] hover:border-primary/30 transition-all duration-300 flex-shrink-0 group"
                            >
                                <ChevronDown className="w-3.5 h-3.5 group-hover:translate-y-0.5 transition-transform" />
                                Show Metrics
                            </button>
                        )}

                        {/* Master List Area - extends below the fold */}
                        <div className={cn(
                            "flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--card-bg)] dark:bg-[#1E1E1E] border border-[var(--card-border)] shadow-sm overflow-hidden mt-2 p-4 md:p-6 pb-0",
                            metricsCollapsed ? "rounded-xl" : "rounded-2xl md:rounded-3xl"
                        )}>

                            {/* Compact Header: Title + Tabs + Date + Search + View Icons */}
                            <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                                <h2 className="text-sm font-bold tracking-tight text-foreground whitespace-nowrap hidden md:flex items-center gap-1.5">
                                    Customers
                                    <span className="text-xs font-normal text-muted-foreground">· {totalCount.toLocaleString()}</span>
                                </h2>
                                <div className="flex items-center bg-slate-100 dark:bg-black/40 p-0.5 rounded-lg border border-slate-200 dark:border-white/10 shrink-0">
                                    <button onClick={() => setStatus('all')} className={cn("px-2.5 py-1 text-xs font-medium rounded transition-colors", statusFilter === 'all' ? "bg-white dark:bg-slate-700 text-foreground dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-800 dark:hover:text-white")}>All</button>
                                    <button onClick={() => setStatus('vip')} className={cn("px-2.5 py-1 text-xs font-medium rounded transition-colors", statusFilter === 'vip' ? "bg-white dark:bg-slate-700 text-foreground dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-800 dark:hover:text-white")}>VIP</button>
                                    <button onClick={() => setStatus('regular')} className={cn("px-2.5 py-1 text-xs font-medium rounded transition-colors", statusFilter === 'regular' ? "bg-white dark:bg-slate-700 text-foreground dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-800 dark:hover:text-white")}>Loss</button>
                                    <button onClick={() => setStatus('new')} className={cn("px-2.5 py-1 text-xs font-medium rounded transition-colors", statusFilter === 'new' ? "bg-white dark:bg-slate-700 text-foreground dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-800 dark:hover:text-white")}>New</button>
                                </div>
                                <div className="shrink-0">
                                    <DateRangePicker
                                        dateFrom={dateFrom}
                                        dateTo={dateTo}
                                        onDateChange={(from, to) => {
                                            setDateFrom(from);
                                            setDateTo(to);
                                        }}
                                    />
                                </div>
                                <div className="flex-1">
                                    <CustomerOmniSearch rawSearch={rawSearch || ""} setSearch={setSearch} />
                                </div>
                                {/* View Mode Toggle */}
                                <div className="flex items-center gap-0.5 p-0.5 bg-white/60 dark:bg-black/30 backdrop-blur-sm border border-white/20 dark:border-white/10 rounded-lg shrink-0">
                                    <button
                                        onClick={() => setCompactLevel(0)}
                                        className={cn(
                                            "p-1.5 rounded transition-all",
                                            compactLevel === 0
                                                ? "bg-white dark:bg-[#2A2A2A] shadow-sm text-primary dark:text-[#EFFF00]"
                                                : "text-muted-foreground hover:text-foreground dark:hover:text-white"
                                        )}
                                        title="Full View"
                                    >
                                        <LayoutGrid className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => setCompactLevel(1)}
                                        className={cn(
                                            "p-1.5 rounded transition-all",
                                            compactLevel === 1
                                                ? "bg-white dark:bg-[#2A2A2A] shadow-sm text-primary dark:text-[#EFFF00]"
                                                : "text-muted-foreground hover:text-foreground dark:hover:text-white"
                                        )}
                                        title="Semi-Compact"
                                    >
                                        <List className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => setCompactLevel(2)}
                                        className={cn(
                                            "p-1.5 rounded transition-all",
                                            compactLevel === 2
                                                ? "bg-white dark:bg-[#2A2A2A] shadow-sm text-primary dark:text-[#EFFF00]"
                                                : "text-muted-foreground hover:text-foreground dark:hover:text-white"
                                        )}
                                        title="Ultra-Compact"
                                    >
                                        <Rows3 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* The High-Performance List */}
                            <div className="flex-1 flex flex-col min-h-0 relative is-active group md:-mx-2">
                                {/* Faded gradient at top of list for smooth visual entry */}
                                <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-[var(--card-bg)] dark:from-[#1E1E1E] to-transparent z-10 pointer-events-none" />

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
                                    onListScroll={handleListScroll}
                                    hasDuplicates={customerHasDuplicates}
                                />

                                {/* Faded gradient at bottom of list */}
                                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[var(--card-bg)] dark:from-[#1E1E1E] to-transparent z-10 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    {/* Conditional Right Column: Insights Drawer */}
                    <AnimatePresence>
                        {isExpandedAnalytics && (
                            <motion.div
                                initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                                animate={{ width: "340px", opacity: 1, marginLeft: 24 }}
                                exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                                className="hidden xl:flex flex-col flex-shrink-0 min-h-0 h-full"
                            >
                                <InsightsDrawer onClose={() => setIsExpandedAnalytics(false)} />
                            </motion.div>
                        )}
                    </AnimatePresence>
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

            </div>
        </PageTransition >
    );
}
