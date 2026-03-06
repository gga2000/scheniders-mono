"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { useOrderStore } from "@/store/use-order-store";
import { useSidebar } from "@/components/layout/dashboard-layout";
import { MobileOrdersList } from "./MobileOrdersList";
import { MobileSearchModal } from "./MobileSearchModal";
import { MobileFilterModal } from "./MobileFilterModal";
import { OrderDetailsModal } from "@/components/orders/order-details-modal";
import { Order } from "@/lib/supabase";
import { OrderAssignment, mockAssignments } from "@/lib/team-types";
import { isOrderFlagged } from "@/lib/data-quality-utils";
import { Search, Filter, Plus, Download, ChevronRight, ChevronLeft } from "lucide-react";
import { WhatsAppTemplatePanel } from "@/components/orders/whatsapp-template-panel";
import { StickyFilterBar } from "@/components/orders/sticky-filter-bar";

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

    const {
        localSearchQuery,
        setLocalSearchQuery,
        columnFilters,
        filterDuplicatesOnly,
        sortConfig,
        setIsCreateModalOpen,
        selectAll,
        groupBy,
        setGroupBy,
        setFilterDuplicatesOnly,
    } = useOrderStore();

    const { setMobileMenuOpen } = useSidebar();

    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const [filterModalOpen, setFilterModalOpen] = useState(false);
    const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
    const [orderForTemplate, setOrderForTemplate] = useState<Order | null>(null);

    const [assignments, setAssignments] = useState<OrderAssignment[]>(mockAssignments);

    // --- Pagination State ---
    const ITEMS_PER_PAGE = 50;
    const [currentPage, setCurrentPage] = useState(1);

    const handleAssignDuty = React.useCallback((orderId: string, duty: 'confirmation' | 'fulfillment', employeeId: string) => {
        setAssignments(prev => {
            const filtered = prev.filter(a => !(a.order_id === orderId && a.duty === duty));
            return [...filtered, {
                id: `a_${Date.now()}`,
                order_id: orderId,
                employee_id: employeeId,
                duty,
                assigned_at: new Date().toISOString(),
                status: 'pending'
            }];
        });
    }, []);

    // Apply same filtering logic as desktop (Phase 4 placeholder/integration)
    const filteredOrders = useMemo(() => {
        let result = [...hookFilteredOrders];

        // Global Search
        if (localSearchQuery) {
            const lowerQuery = localSearchQuery.toLowerCase();
            result = result.filter((o) => {
                const searchStr = `${o.customer_name || ""} ${o.phone || ""} ${o.city || ""} ${o.order_id || ""} ${o.sequence_number || ""} ${o.notes || ""}`.toLowerCase();
                return searchStr.includes(lowerQuery);
            });
        }

        // Status / Risk level filters
        if (filters.riskLevel) {
            if (filters.riskLevel === "flagged") {
                result = result.filter((o) => isOrderFlagged(o) || o.status === "rejected");
            } else {
                result = result.filter((o) => o.risk_data?.level === filters.riskLevel);
            }
        }

        // Default sorting: Newest first
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return result;
    }, [hookFilteredOrders, localSearchQuery, filters.riskLevel]);

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
        <div className="flex flex-col min-h-screen bg-background pb-6">
            {/* Sticky Header */}
            <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-[var(--card-border)] px-4 py-3 flex flex-col gap-3">

                {/* Unified Search Bar */}
                <div className="flex items-center w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-sm overflow-hidden h-12 relative" dir="rtl">

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
                        className="flex-1 h-full px-3 flex items-center gap-2 cursor-pointer text-muted-foreground hover:bg-muted/30 transition-colors"
                        onClick={() => setSearchModalOpen(true)}
                    >
                        <Search className="w-4 h-4 shrink-0" />
                        <span className="text-sm font-medium truncate">
                            {filters.searchQuery || localSearchQuery || "بحث..."}
                        </span>
                    </div>

                    {/* Number Badge / Select All (Far Left in RTL) */}
                    <button
                        onClick={() => {
                            setLocalSearchQuery('');
                            setFilters({ ...filters, status: "all" });
                            selectAll(filteredOrders.map(o => o.id));
                        }}
                        className="h-full px-4 flex items-center justify-center bg-gradient-to-l from-amber-500/10 to-transparent border-r border-[var(--card-border)] text-amber-600 hover:bg-amber-500/20 transition-colors"
                        title="Select All / Clear Search"
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
                    order={selectedOrder}
                    open={!!selectedOrder}
                    onClose={() => setSelectedOrder(null)}
                    onUpdate={updateOrder}
                    onStatusUpdate={updateOrderStatus}
                    onGetTimeline={getOrderTimeline}
                    onGetNotes={getOrderNotes}
                    onAddNote={addOrderNote}
                    onDelete={deleteOrder}
                    onCreateReturn={createReturnOrder}
                    checkOrderIdExists={checkOrderIdExists}
                    assignments={assignments.filter(a => a.order_id === selectedOrder.id)}
                    onAssignDuty={handleAssignDuty}
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
