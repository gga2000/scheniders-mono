"use client";

import React, { useState, useMemo, useEffect } from "react";
import { orderMatchesSearch } from "@/lib/order-filter-utils";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";
import { useShallow } from "zustand/react/shallow";
import { useSidebar } from "@/components/layout/dashboard-layout";
import { MobileOrdersList } from "./MobileOrdersList";
import { MobileSearchModal } from "./MobileSearchModal";
import { MobileFilterModal } from "./MobileFilterModal";
import { OrderDetailsModal } from "@/components/orders/order-details-modal";
import { Order } from "@/lib/supabase";
import { isOrderFlagged } from "@/lib/data-quality-utils";
import { Search, Filter, Plus, Download, ChevronRight, ChevronLeft } from "lucide-react";
import { WhatsAppTemplatePanel } from "@/components/orders/whatsapp-template-panel";
import { StickyFilterBar } from "@/components/orders/sticky-filter-bar";
import { AutoSendToggle } from "@/components/orders/auto-send-toggle";

export function MobileOrdersPage() {
    const {
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
        getCustomerArchivedCount,
        getCustomerOrderCount,
        hasDuplicates,
        exportOrders,
    } = useOrdersContext();

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

        // MOB-2: this was a plain `includes()` over a concatenated string, so a
        // phone typed with spaces or an Arabic name spelled with a different alef
        // matched on desktop but not here. Both screens now share one predicate.
        if (localSearchQuery) {
            result = result.filter((o) => orderMatchesSearch(o, localSearchQuery, hookFilteredOrders));
        }

        // Status / Risk level filters
        if (filters.riskLevel) {
            if (filters.riskLevel === "flagged") {
                result = result.filter((o) => isOrderFlagged(o) || o.status === "rejected");
            } else {
                result = result.filter((o) => o.risk_data?.level === filters.riskLevel);
            }
        }

        // Default sorting: Newest first. Timestamps resolved once rather than
        // parsed twice per comparison, matching the desktop list.
        const createdAtMs = new Map<string, number>();
        for (const order of result) {
            const parsed = Date.parse(order.created_at);
            createdAtMs.set(order.id, Number.isNaN(parsed) ? 0 : parsed);
        }
        result.sort((a, b) => (createdAtMs.get(b.id) ?? 0) - (createdAtMs.get(a.id) ?? 0));

        return result;
    }, [hookFilteredOrders, localSearchQuery, filters.riskLevel]);

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
        await updateOrderStatus(id, status);
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
                            setFilters({ ...filters, status: "all" });
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
                    totalRiskCount={statusCounts?.flagged || 0}
                    showFilters={filterModalOpen}
                    setShowFilters={setFilterModalOpen}
                    hasActiveFilters={Object.values(filters).some((v) => v !== "all" && v !== "")}
                    groupBy={groupBy}
                    setGroupBy={setGroupBy}
                    filterDuplicatesOnly={filterDuplicatesOnly}
                    setFilterDuplicatesOnly={setFilterDuplicatesOnly}
                    isMobile={true}
                    className="-mx-4 bg-transparent border-b-0 shadow-none sticky top-12"
                />
            </div>

            <div className="flex-1 mt-3">
                <MobileOrdersList
                    orders={paginatedOrders}
                    onRefresh={async () => { await fetchOrders(); }}
                    onViewDetails={handleViewDetails}
                    onStatusUpdate={handleStatusUpdate}
                    getCustomerArchivedCount={getCustomerArchivedCount}
                    getCustomerOrderCount={getCustomerOrderCount}
                    hasDuplicates={hasDuplicates}
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
                    onStatusUpdate={updateOrderStatus}
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
