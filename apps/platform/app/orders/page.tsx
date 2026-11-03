"use client";

import { DuplicateConfirmDialog } from "@/components/orders/duplicate-confirm-dialog";
import { StockTodayDialog } from "@/components/orders/stock-today-dialog";
import { StockShortfallDialog } from "@/components/orders/stock-shortfall-dialog";
import { OrderDialogs } from "@/components/orders/order-dialogs";
import { OrderBulkDialogs } from "@/components/orders/order-bulk-dialogs";
import { EASE_PANEL, EASE_CROSSFADE } from "@/components/layout/page-transition";
import { motion, AnimatePresence } from "framer-motion";
import { ScrollToTopButton, BackupPrompt, IraqMap } from "@/components/orders/page/lazy";
import { useOrdersPageModel } from "@/components/orders/page/use-orders-page-model";
import { OrdersPageToolbar } from "@/components/orders/page/orders-page-toolbar";
import { OrdersPageList } from "@/components/orders/page/orders-page-list";

export default function OrdersPage() {
    const m = useOrdersPageModel();
    const { isMounted, isReturnsOpen, setIsReturnsOpen, isStockTodayOpen, setIsStockTodayOpen, isScannerOpen, setIsScannerOpen, error, getConfirmBlockingTwin, t, setShowDuplicateModal, setDuplicateOrder, handleSplitOrder, workflowTemplates, filteredOrders, duplicateGuard, stockGuard, handleStatusUpdate, guardedBulk, showMapPanel, displayedOrders, isInitialLoading } = m;

    return (
        <AnimatePresence mode="wait">
            {isInitialLoading ? (
                <motion.div
                    key="skeleton"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.25, ease: EASE_CROSSFADE } }}
                    className="min-h-screen bg-[var(--background)]"
                />
            ) : error ? (
                <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="min-h-screen flex items-center justify-center"
                >
                    <div className="pastel-card pastel-card-pink p-8 text-center">
                        <h2 className="text-xl font-bold text-rose-900 mb-2">{t("orders.errorTitle")}</h2>
                        <p className="text-rose-700">{error}</p>
                    </div>
                </motion.div>
            ) : (
                <motion.div
                    key="content"
                    initial="hidden"
                    animate="visible"
                    variants={{
                        hidden: { opacity: 0 },
                        visible: {
                            opacity: 1,
                            transition: {
                                duration: 0.3,
                                ease: EASE_CROSSFADE,
                                staggerChildren: 0.07,
                            },
                        },
                    }}
                >
                    <div className="min-h-screen p-4 md:p-6 lg:p-8 orders-page relative">
                        <div className="space-y-4 md:space-y-6">
                            <OrdersPageToolbar m={m} />

                            <OrdersPageList m={m} />
                        </div>

                        {/* Governorate Map Side Panel - Floating */}
                        <AnimatePresence initial={false}>
                            {showMapPanel && (
                                <motion.div
                                    initial={{ opacity: 0, x: 40 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 40 }}
                                    transition={{ duration: 0.3, ease: EASE_PANEL }}
                                    className="hidden lg:block fixed top-20 right-6 z-40"
                                >
                                    <div className="w-[340px] h-[420px] shadow-xl rounded-3xl overflow-hidden">
                                        <IraqMap orders={filteredOrders} />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/*
                        ARCH-1: the modal tail — 325 lines of dialogs — used to sit
                        here. It is now two components split by what they act on: one
                        order, or a selection. Both read the store and the orders
                        context directly, because that is where their state already
                        lived; only what the page genuinely owns is passed in.
                    */}
                    <OrderDialogs
                        isMounted={isMounted}
                        isReturnsOpen={isReturnsOpen}
                        setIsReturnsOpen={setIsReturnsOpen}
                        isScannerOpen={isScannerOpen}
                        setIsScannerOpen={setIsScannerOpen}
                        workflowTemplates={workflowTemplates}
                        displayedOrders={displayedOrders}
                        onSplitConfirm={handleSplitOrder}
                        onStatusUpdate={handleStatusUpdate}
                    />

                    <StockTodayDialog open={isStockTodayOpen} onOpenChange={setIsStockTodayOpen} />
                    <StockShortfallDialog {...stockGuard.dialogProps} />

                    <OrderBulkDialogs bulk={guardedBulk} getDispatchTwin={getConfirmBlockingTwin} />

                    {/* Lives here rather than in either dialog group: it guards the
                        card, the table and the bulk bar alike. */}
                    <DuplicateConfirmDialog
                        {...duplicateGuard.dialogProps}
                        onCompare={(order) => {
                            setDuplicateOrder(order);
                            setShowDuplicateModal(true);
                        }}
                    />

                    {/* Scroll to Top Button */}
                    <ScrollToTopButton />

                    {/* Monthly Backup Reminder */}
                    <BackupPrompt />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
