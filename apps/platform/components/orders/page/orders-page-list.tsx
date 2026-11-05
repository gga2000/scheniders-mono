"use client";

import { useOrderStore } from "@/store/use-order-store";
import { OrderListPreviewStrip } from "@/components/orders/order-list-preview-strip";
import { OrderSearchBanner } from "@/components/orders/order-search-banner";
import { EmptyState } from "@/components/ui/empty-states";
import { EASE_CHROME } from "@/components/layout/page-transition";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { canOfferSelectAll } from "@/lib/order-bulk-scope";
import { AbandonedCartRecoveryStrip } from "@/components/orders/page/lazy";
// Imported directly, not through next/dynamic: as a lazy component the list
// suspended on its first render with rows, even with its code already loaded,
// and React holds a suspended reveal back (live: the placeholder showed ~0.3 s
// after the rows were in and stayed ~0.5 s). The list is the page's content,
// so its code belongs in the page's own bundle.
import { VirtualizedOrderList } from "@/components/orders/virtualized-order-list";
import { VirtualizedOrderTable } from "@/components/orders/virtualized-order-table";
import type { OrdersPageModel } from "./use-orders-page-model";

/** One section of the orders page; see app/orders/page.tsx. */
export function OrdersPageList({ m }: { m: OrdersPageModel }) {
    const { recordContact, isRefreshing, ordersPending, orderSearch, availableCities, availableProducts, filters, setFilters, getDuplicateWindowAlert, togglePin, ordersAreComplete, t, viewMode, compactView, compactGrid, groupBy, filterDuplicatesOnly, setFilterDuplicatesOnly, sortConfig, toggleSort, columnFilters, setColumnFilters, openFilterColumn, setOpenFilterColumn, setIsModalOpen, setShowDuplicateModal, setDuplicateOrder, selectedOrders, setSelectedOrders, showArchived, setSelectedOrderWithFetch, emptyStateHasFilters, isFirstRun, filteredOrders, previewing, toggleOrderSelection, PAGE_SELECT_LIMIT, selectAll, guardedStatusUpdate, listOrders, getRiskLevelByPhone, groupedOrders, modePrice, cardListProps } = m;
    return (
        <>
            {/* Section 2: Order Cards — stagger child */}
            <motion.div
                variants={{
                    hidden: { opacity: 0, y: 6 },
                    visible: {
                        opacity: 1,
                        y: 0,
                        transition: { duration: 0.35, ease: EASE_CHROME },
                    },
                }}
            >
                <div className="space-y-3">
                    {/* Active Duplicates Filter Indicator */}
                    {filterDuplicatesOnly && (
                        <div className="flex items-center gap-2 px-2">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-100 border border-orange-200 text-orange-700">
                                <span className="text-xs font-semibold">🔄 {t("orders.dupOnly")}</span>
                                <button
                                    onClick={() => setFilterDuplicatesOnly(false)}
                                    className="text-orange-500 hover:text-orange-700 font-bold text-xs"
                                    title={t("orders.removeFilter")}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    )}

                    {/* How abandoned carts ended. Store-form captures reach this tab
                        as pending_checkout cards too (promote_abandoned_carts). */}
                    {filters.status === "pending_checkout" && !showArchived && <AbandonedCartRecoveryStrip />}
                    {/* While searching, the list is a lookup across every date and status. */}
                    {!showArchived && <OrderSearchBanner count={filteredOrders.length} />}

                            {/* Selection Banner */}
                            <AnimatePresence>
                                {selectedOrders.size > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className={cn(
                                            "flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl text-sm font-medium mb-3",
                                            selectedOrders.size > 20
                                                ? "bg-amber-100 text-amber-800 border border-amber-200"
                                                : "bg-blue-50 text-blue-700 border border-blue-100"
                                        )}
                                    >
                                        {/* The count itself lives once, in the bulk action row above. */}
                                        {canOfferSelectAll({
                                            selectedCount: selectedOrders.size,
                                            loadedCount: filteredOrders.length,
                                            pageSelectLimit: PAGE_SELECT_LIMIT,
                                            ordersAreComplete,
                                        }) && (
                                            <button
                                                onClick={() => {
                                                    useOrderStore.getState().selectAll(filteredOrders.map(o => o.id));
                                                }}
                                                className="underline font-bold hover:opacity-80 transition-opacity"
                                            >
                                                {t("orders.ui.selectAllN", { count: filteredOrders.length })}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => setSelectedOrders(new Set())}
                                            className="text-xs underline opacity-70 hover:opacity-100 transition-opacity"
                                        >
                                            {t("orders.ui.clearSelection")}
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {previewing && <OrderListPreviewStrip />}

                            {/* While previewing, every row is inert: no swipe, status
                                action, selection or details until the window has loaded. */}
                            <div
                                inert={previewing}
                                aria-busy={previewing || undefined}
                                className={previewing ? "pointer-events-none select-none" : undefined}
                                data-orders-list-preview={previewing ? "" : undefined}
                            >
                            {/* Cards View */}
                            {(viewMode === "cards" || viewMode === "list") && (
                                <>
                                    {listOrders.length === 0 && (isRefreshing || ordersPending || previewing || (!showArchived && orderSearch.pending)) ? (
                                        /* An empty list while rows are still arriving is not an empty
                                           list. `loading` covers only the first fetch, so a refetch —
                                           after a window change, a reconnect, or a stale SWR
                                           hydration — used to fall straight through to the empty
                                           state, and a merchant with 4,778 orders was told "No orders
                                           yet. When you receive orders, they'll appear here." */
                                        <div className="space-y-3" aria-busy="true" aria-live="polite">
                                            {[0, 1, 2, 3].map(i => (
                                                <div key={i} className="w-full h-24 animate-pulse bg-muted/20 rounded-2xl" />
                                            ))}
                                        </div>
                                    ) : listOrders.length === 0 ? (
                                        <EmptyState
                                            type={isFirstRun ? "no-orders" : (filters.status && ['new', 'contacted', 'confirmed', 'delivered', 'rejected'].includes(filters.status) ? filters.status : "all") as "new" | "contacted" | "confirmed" | "delivered" | "rejected" | "all"}
                                            searchQuery={filters.searchQuery}
                                            hasFilters={emptyStateHasFilters}
                                        />
                                    ) : compactView >= 1 && compactGrid ? (
                                        /* PERF-2: the compact grid used to render every filtered
                                           order at once. It is the same virtualized list as below,
                                           in grid mode — `content-visibility` is deliberately not
                                           applied any more, because it would make the virtualizer
                                           measure the placeholder height instead of the card. */
                                        <VirtualizedOrderList
                                            {...cardListProps}
                                            gridMode
                                            gridClassName={cn(
                                                "grid gap-2",
                                                compactView === 2
                                                    ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                                                    : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                                            )}
                                        />
                                    ) : (
                                        /* One renderer at every list size. A small-list branch used to
                                           swap in at under 10 rows, so a filter or search crossing
                                           that line remounted every card and closed any menu open
                                           on one (seen live: the status menu shut under the click
                                           as a search's results landed). */
                                        <VirtualizedOrderList {...cardListProps} />
                                    )}
                                </>
                            )}

                            {/* Table View - State of the Art */}
                            {viewMode === "table" && (previewing && listOrders.length === 0 ? (
                                <div className="space-y-3" aria-busy="true" aria-live="polite">
                                    {[0, 1, 2, 3].map(i => (
                                        <div key={i} className="w-full h-12 animate-pulse bg-muted/20 rounded-xl" />
                                    ))}
                                </div>
                            ) : (
                                <VirtualizedOrderTable
                                    groupedOrders={groupedOrders}
                                    groupBy={groupBy}
                                    displayedOrders={listOrders}
                                    sortConfig={sortConfig}
                                    toggleSort={toggleSort}
                                    selectedOrders={selectedOrders}
                                    selectAll={selectAll}
                                    toggleOrderSelection={toggleOrderSelection}
                                    togglePin={togglePin}
                                    setSelectedOrder={setSelectedOrderWithFetch}
                                    setIsModalOpen={setIsModalOpen}
                                    getDuplicateWindowAlert={getDuplicateWindowAlert}
                                    onContactRecorded={recordContact}
                                    setDuplicateOrder={setDuplicateOrder}
                                    setShowDuplicateModal={setShowDuplicateModal}
                                    // The mode is a fact about the whole list: none over a preview.
                                    modePrice={previewing ? 0 : modePrice}
                                    updateOrderStatus={guardedStatusUpdate}
                                    getRiskLevel={getRiskLevelByPhone}
                                    columnFilters={columnFilters}
                                    setColumnFilters={setColumnFilters}
                                    openFilterColumn={openFilterColumn}
                                    setOpenFilterColumn={setOpenFilterColumn}
                                    availableCities={availableCities}
                                    availableProducts={availableProducts}
                                    filters={filters}
                                    setFilters={setFilters}
                                />
                            ))}
                            </div>


                </div>
            </motion.div>
        </>
    );
}
