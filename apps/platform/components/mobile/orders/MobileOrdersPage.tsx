"use client";

import React, { useState, useMemo, useEffect } from "react";
import { orderMatchesRiskLevel } from "@/lib/order-filter-utils";
import { getScheduledState, isScheduleDue } from "@/lib/order-format-utils";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";
import { useShallow } from "zustand/react/shallow";
import { useSidebar } from "@/components/layout/dashboard-layout";
import { MobileOrdersList } from "./MobileOrdersList";
import { MobileSearchModal } from "./MobileSearchModal";
import { OrderSearchBanner } from "@/components/orders/order-search-banner";
import { MobileFilterModal } from "./MobileFilterModal";
import { OrderDetailsModal } from "@/components/orders/order-details-modal";
import { Order } from "@/lib/supabase";
import { Search, Filter, Plus, Download, ChevronRight, ChevronLeft } from "lucide-react";
import { WhatsAppTemplatePanel } from "@/components/orders/whatsapp-template-panel";
import { StickyFilterBar } from "@/components/orders/sticky-filter-bar";
import { AdChannelFilter } from "@/components/orders/ad-channel-filter";
import { AutoSendToggle } from "@/components/orders/auto-send-toggle";
import { DuplicateConfirmDialog } from "@/components/orders/duplicate-confirm-dialog";
import { useDuplicateDispatchGuard } from "@/hooks/use-duplicate-dispatch-guard";

export function MobileOrdersPage() {
    const {
        orders,
        filteredOrders: hookFilteredOrders,
        fetchOrders,
        updateOrderStatus,
        updateOrder,
        getOrderTimeline,
        getOrderNotes,
        addOrderNote,
        deleteOrder,
        createReturnOrder,
        checkOrderIdExists,
        messageTemplates,
        filters,
        setFilters,
        statusCounts,
        adChannelSummary,
        getCustomerArchivedCount,
        getCustomerOrderCount,
        hasDuplicates,
        getDuplicateWindowAlert,
        getConfirmBlockingTwin,
        exportOrders,
    } = useOrdersContext();

    // Same 48h confirm/ship guard as the desktop page.
    const duplicateGuard = useDuplicateDispatchGuard(orders, getConfirmBlockingTwin);

    // Selected through `useShallow`; a bare `useOrderStore()` subscribes to the
    // whole store and re-renders this screen on every unrelated store change.
    const {
        localSearchQuery,
        setLocalSearchQuery,
        columnFilters,
        filterDuplicatesOnly,
        sortConfig,
        setIsCreateModalOpen,
        groupBy,
        setGroupBy,
        setFilterDuplicatesOnly,
        filterDueToday,
        setFilterDueToday,
    } = useOrderStore(
        useShallow((state) => ({
            localSearchQuery: state.localSearchQuery,
            setLocalSearchQuery: state.setLocalSearchQuery,
            columnFilters: state.columnFilters,
            filterDuplicatesOnly: state.filterDuplicatesOnly,
            sortConfig: state.sortConfig,
            setIsCreateModalOpen: state.setIsCreateModalOpen,
            groupBy: state.groupBy,
            setGroupBy: state.setGroupBy,
            setFilterDuplicatesOnly: state.setFilterDuplicatesOnly,
            filterDueToday: state.filterDueToday,
            setFilterDueToday: state.setFilterDueToday,
        })),
    );

    const { setMobileMenuOpen } = useSidebar();

    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const [filterModalOpen, setFilterModalOpen] = useState(false);
    const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
    const [orderForTemplate, setOrderForTemplate] = useState<Order | null>(null);


    // --- Pagination State ---
    const ITEMS_PER_PAGE = 50;
    const [currentPage, setCurrentPage] = useState(1);


    // Apply same filtering logic as desktop (Phase 4 placeholder/integration)
    const filteredOrders = useMemo(() => {
        let result = [...hookFilteredOrders];

        // Search needs no step here: while `filters.searchQuery` is set,
        // `hookFilteredOrders` already holds the server's matches across every
        // date and status (useServerOrderSearch), shared with the desktop page.

        // Risk / flagged filter — shared with the desktop page via
        // orderMatchesRiskLevel so the two screens cannot disagree about what
        // "flagged" means. This was the last predicate still duplicated here.
        const riskLevel = filters.riskLevel;
        if (riskLevel) {
            result = result.filter((o) => orderMatchesRiskLevel(o, riskLevel));
        }

        // Due-today queue — same predicate as the desktop list and the chip count.
        if (filterDueToday) {
            result = result.filter((o) => isScheduleDue(o.status, o.scheduled_date));
        }

        // Default sorting: Newest first, with orders parked for a later day
        // below the live queue, matching the desktop list. Timestamps resolved
        // once rather than parsed twice per comparison.
        const createdAtMs = new Map<string, number>();
        for (const order of result) {
            const parsed = Date.parse(order.created_at);
            createdAtMs.set(order.id, Number.isNaN(parsed) ? 0 : parsed);
        }
        const parked = new Set(result.filter((o) => getScheduledState(o.scheduled_date) === "future").map((o) => o.id));
        result.sort((a, b) => {
            const aParked = parked.has(a.id);
            const bParked = parked.has(b.id);
            if (aParked !== bParked) return aParked ? 1 : -1;
            return (createdAtMs.get(b.id) ?? 0) - (createdAtMs.get(a.id) ?? 0);
        });

        return result;
    }, [hookFilteredOrders, filters.riskLevel, filterDueToday]);

    // Postponed orders whose day has arrived, over the list the toggle narrows —
    // the same rows and predicate as the filter, so the badge equals the list
    // it opens. It used to count the raw cache, ignoring the status tab.
    const dueTodayCount = useMemo(
        () => hookFilteredOrders.filter((o: Order) => isScheduleDue(o.status, o.scheduled_date)).length,
        [hookFilteredOrders],
    );

    // The risk badge, over the same list with the risk predicate. It read
    // `statusCounts.flagged`, a key no count ever set, so it was always 0.
    const riskCount = useMemo(
        () => hookFilteredOrders.filter((o: Order) => orderMatchesRiskLevel(o, filters.riskLevel ?? "flagged")).length,
        [hookFilteredOrders, filters.riskLevel],
    );

    // ARCH-6: the order store is module-level, so an open modal, a bulk
    // selection or a half-finished inline edit outlived this page and came back
    // on the next visit — with a stale order snapshot behind it. Clear the
    // transient half on unmount; view preferences and filters persist as before.
    useEffect(() => {
        return () => {
            useOrderStore.getState().resetTransientState();
        };
    }, []);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1); // eslint-disable-line react-hooks/set-state-in-effect
    }, [filteredOrders.length]);

    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ITEMS_PER_PAGE));
    const safeCurrentPage = Math.min(currentPage, totalPages);

    // Paginate for view
    const paginatedOrders = useMemo(() => {
        const start = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
        return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredOrders, safeCurrentPage]);

    const handleStatusUpdate = async (id: string, status: Order["status"]) => {
        if (duplicateGuard.holdStatusChange(id, status, () => { void updateOrderStatus(id, status); })) return;
        await updateOrderStatus(id, status);
    };

    /** The details modal's status changes, through the same guard. */
    const guardedStatusUpdate = async (
        id: string,
        status: Order["status"],
        reason?: string,
    ): Promise<{ success: boolean; error?: string }> => {
        if (duplicateGuard.holdStatusChange(id, status, () => { void updateOrderStatus(id, status, reason); })) {
            return { success: false };
        }
        return updateOrderStatus(id, status, reason);
    };

    const handleViewDetails = (order: Order) => {
        // We will build MobileOrderDetail shortly. 
        // It could be a full page modal or redirect.
        // For now we just log or toggle state.
        setSelectedOrder(order);
    };

    return (
        <div className="flex flex-col min-h-screen bg-background pb-safe">
            {/* Sticky Header */}
            <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-[var(--card-border)] px-4 pb-3 pt-safe flex flex-col gap-3">

                {/* Unified Search Bar */}
                <div className="flex flex-row-reverse items-center w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden h-12 relative">

                    {/* Create Order Button */}
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="h-full px-3.5 flex items-center justify-center text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-colors border-l border-[var(--card-border)] shrink-0"
                        aria-label="Create New Order"
                    >
                        <Plus className="w-[20px] h-[20px]" />
                    </button>

                    {/* Export Button */}
                    <button
                        onClick={() => exportOrders(filteredOrders.map(o => o.id))}
                        className="h-full px-3.5 flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors border-l border-[var(--card-border)] shrink-0"
                        aria-label="Export Orders CSV"
                    >
                        <Download className="w-[18px] h-[18px]" />
                    </button>

                    {/* Auto-Send WhatsApp Toggle */}
                    <AutoSendToggle />

                    {/* Sidebar Menu Button */}
                    <button
                        onClick={() => setMobileMenuOpen?.(true)}
                        className="h-full px-3.5 flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors border-l border-[var(--card-border)] shrink-0"
                        aria-label="Open menu"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>

                    {/* Search Segment (Middle/Right) */}
                    <div
                        className="flex-1 h-full px-3 flex flex-row-reverse items-center gap-2 cursor-pointer text-muted-foreground hover:bg-muted/30 transition-colors text-right"
                        onClick={() => setSearchModalOpen(true)}
                    >
                        <Search className="w-4 h-4 shrink-0" />
                        <span className="text-sm font-medium truncate">
                            {filters.searchQuery || localSearchQuery || "بحث..."}
                        </span>
                    </div>

                    {/* Number badge — clears the search and the status filter.
                        MOB-1: this also called selectAll(), but mobile renders no
                        bulk action bar and no per-row selection toggle, so the
                        selection went into the store where nothing could act on
                        it. Tapping a control labelled "Select All" and getting
                        nothing is worse than the control not claiming to do it,
                        so the dead call is gone and the label now matches the
                        behaviour. Mobile bulk actions remain unbuilt. */}
                    <button
                        onClick={() => {
                            setLocalSearchQuery('');
                            setFilters({ ...filters, status: "all", searchQuery: undefined });
                        }}
                        className="h-full px-4 flex items-center justify-center bg-gradient-to-l from-amber-500/10 to-transparent border-r border-[var(--card-border)] text-amber-600 hover:bg-amber-500/20 transition-colors"
                        title="Clear search and filters"
                    >
                        <span className="text-sm font-bold font-mono">{filteredOrders.length}</span>
                    </button>
                </div>

                {/* Sticky Filter Bar */}
                <StickyFilterBar
                    filters={filters as Parameters<typeof StickyFilterBar>[0]["filters"]}
                    setFilters={(newFilters) => setFilters(newFilters as Parameters<typeof setFilters>[0])}
                    statusCounts={statusCounts}
                    totalRiskCount={riskCount}
                    showFilters={filterModalOpen}
                    setShowFilters={setFilterModalOpen}
                    hasActiveFilters={Object.values(filters).some((v) => v !== "all" && v !== "")}
                    groupBy={groupBy}
                    setGroupBy={setGroupBy}
                    filterDuplicatesOnly={filterDuplicatesOnly}
                    setFilterDuplicatesOnly={setFilterDuplicatesOnly}
                    filterDueToday={filterDueToday}
                    setFilterDueToday={setFilterDueToday}
                    dueTodayCount={dueTodayCount}
                    isMobile={true}
                    className="-mx-4 bg-transparent border-b-0 shadow-none sticky top-12"
                />

                {/* Which ad channel brought these orders in — same chips and
                    counts as desktop, filtering through the shared hook. */}
                <AdChannelFilter
                    summary={adChannelSummary}
                    selected={filters.adChannel}
                    onSelect={(channel) => setFilters({ ...filters, adChannel: channel ?? undefined })}
                    // One scrollable line: a wrapping row would grow the sticky header.
                    className="-mx-4 flex-nowrap overflow-x-auto px-4 [scrollbar-width:none] [&>button]:shrink-0"
                />
            </div>

            <div className="flex-1 mt-3">
                <div className="px-3">
                    <OrderSearchBanner count={filteredOrders.length} />
                </div>
                <MobileOrdersList
                    orders={paginatedOrders}
                    onRefresh={async () => { await fetchOrders(); }}
                    onViewDetails={handleViewDetails}
                    onStatusUpdate={handleStatusUpdate}
                    getCustomerArchivedCount={getCustomerArchivedCount}
                    getCustomerOrderCount={getCustomerOrderCount}
                    hasDuplicates={hasDuplicates}
                    getDuplicateWindowAlert={getDuplicateWindowAlert}
                    onOpenTemplatePanel={(o) => {
                        setOrderForTemplate(o);
                        setTemplatePanelOpen(true);
                    }}
                />
            </div>

            {/* Modals */}
            <MobileSearchModal
                open={searchModalOpen}
                onClose={() => setSearchModalOpen(false)}
            />
            <MobileFilterModal
                open={filterModalOpen}
                onClose={() => setFilterModalOpen(false)}
            />

            {/* Detail View Modal */}
            {selectedOrder && (
                <OrderDetailsModal
                    order={selectedOrder ? (hookFilteredOrders.find(o => o.id === selectedOrder.id) ?? selectedOrder) : null}
                    open={!!selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onUpdate={updateOrder}
                    onStatusUpdate={guardedStatusUpdate}
                    onGetTimeline={getOrderTimeline}
                    onGetNotes={getOrderNotes}
                    onDelete={deleteOrder}
                    onCreateReturn={createReturnOrder}
                    checkOrderIdExists={checkOrderIdExists}
                    messageTemplates={messageTemplates}
                    onOpenTemplatePanel={(o) => {
                        setOrderForTemplate(o);
                        setTemplatePanelOpen(true);
                    }}
                />
            )}

            <DuplicateConfirmDialog {...duplicateGuard.dialogProps} />

            {/* WhatsApp Template Panel */}
            {orderForTemplate && (
                <WhatsAppTemplatePanel
                    order={orderForTemplate}
                    open={templatePanelOpen}
                    onClose={() => {
                        setTemplatePanelOpen(false);
                    }}
                    templates={messageTemplates}
                    onStatusUpdate={updateOrderStatus}
                />
            )}
        </div>
    );
}
