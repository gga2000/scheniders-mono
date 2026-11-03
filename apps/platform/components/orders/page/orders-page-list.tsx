"use client";

import { useOrderStore } from "@/store/use-order-store";
import { OrderListPreviewStrip } from "@/components/orders/order-list-preview-strip";
import { SwipeableOrderCard } from "@/components/orders/swipeable-order-card";
import { OrderSearchBanner } from "@/components/orders/order-search-banner";
import { EmptyState } from "@/components/ui/empty-states";
import { StaggerContainer, StaggerItem, EASE_CHROME } from "@/components/layout/page-transition";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { canOfferSelectAll } from "@/lib/order-bulk-scope";
import { VirtualizedOrderList, VirtualizedOrderTable, AbandonedCartRecoveryStrip } from "@/components/orders/page/lazy";
import type { OrdersPageModel } from "./use-orders-page-model";

/** One section of the orders page; see app/orders/page.tsx. */
export function OrdersPageList({ m }: { m: OrdersPageModel }) {
    const { recordContact, isRefreshing, ordersPending, orderSearch, isBlacklisted, getBlacklistEntry, addToBlacklist, removeFromBlacklist, availableCities, availableProducts, filters, setFilters, getDuplicateWindowAlert, getCustomerHistory, getCustomerOrderCount, togglePin, toggleReviewed, cloneOrder, getCustomerArchivedCount, ordersAreComplete, t, canUnblock, canBlock, viewMode, compactView, compactGrid, actionDock, groupBy, filterDuplicatesOnly, setFilterDuplicatesOnly, sortConfig, toggleSort, columnFilters, setColumnFilters, openFilterColumn, setOpenFilterColumn, setIsModalOpen, setShowDuplicateModal, setDuplicateOrder, setScreenshotOrder, selectedOrders, setSelectedOrders, showArchived, loadingId, handleViewDetails, setSelectedOrderWithFetch, emptyStateHasFilters, isFirstRun, workflowTemplates, filteredOrders, previewing, handleStatusUpdate, openCancelDialog, openRejectDialog, openTemplatePanel, showDuplicates, mergeWithPrevious, openSplitDialog, toggleOrderSelection, PAGE_SELECT_LIMIT, selectAll, guardedStatusUpdate, listOrders, getRiskLevelByPhone, groupedOrders, modePrice, getReturnOrderInfo, getOriginalOrderInfo, cardListProps } = m;
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
                                        <span className="font-semibold">{t("orders.ui.nSelected", { count: selectedOrders.size })}</span>
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
                                    ) : listOrders.length >= 10 ? (
                                        /* Use virtualized list for 50+ orders */
                                        <VirtualizedOrderList {...cardListProps} />
                                    ) : (
                                        /* Use animated list for <50 orders */
                                        <StaggerContainer key="orders-list" className="space-y-3">
                                            {listOrders.map((order) => {
                                                const customerOrders = getCustomerHistory(order.phone);
                                                const orderCount = getCustomerOrderCount(order.phone, order.order_id);
                                                const previousOrder = !order.is_return ? (customerOrders.find(o => o.id !== order.id) || null) : null;

                                                return (
                                                    <StaggerItem key={order.id}>
                                                        <SwipeableOrderCard
                                                            order={order}
                                                            loadingId={loadingId}
                                                            onStatusUpdate={handleStatusUpdate}
                                                            onViewDetails={handleViewDetails}
                                                            onSplit={openSplitDialog}
                                                            isBlacklisted={isBlacklisted(order.phone)}
                                                            blacklistEntry={getBlacklistEntry(order.phone)}
                                                            onAddToBlacklist={canBlock ? addToBlacklist : undefined}
                                                            onRemoveFromBlacklist={canUnblock ? removeFromBlacklist : undefined}
                                                            riskLevel={(order.risk_data?.level || "low") as "low" | "medium" | "high" | "blocked"}
                                                            riskAssessment={order.risk_data}
                                                            customerOrderCount={orderCount}
                                                            archivedOrderCount={getCustomerArchivedCount(order.phone)}
                                                            previousOrder={previousOrder}
                                                            onMergeWithPrevious={mergeWithPrevious}
                                                            onShowDuplicates={showDuplicates}
                                                            duplicateAlert={getDuplicateWindowAlert(order.id)}
                                                            onContactRecorded={recordContact}
                                                            onTogglePin={togglePin}
                                                            onCloneOrder={cloneOrder}
                                                            onScreenshot={setScreenshotOrder}
                                                            onCancelWithReason={openCancelDialog}
                                                            onRejectWithReason={openRejectDialog}
                                                            onToggleReviewed={toggleReviewed}
                                                            returnOrderInfo={getReturnOrderInfo(order.id)}
                                                            originalOrderInfo={getOriginalOrderInfo(order.original_order_id)}
                                                            compact={compactView}
                                                            actionDock={actionDock}
                                                            isVirtualized={false}
                                                            onOpenTemplatePanel={openTemplatePanel}
                                                            messageTemplates={workflowTemplates}
                                                            isSelected={selectedOrders.has(order.id)}
                                                            onToggleSelection={toggleOrderSelection}
                                                            />
                                                    </StaggerItem>
                                                );
                                            })}
                                        </StaggerContainer>
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
