"use client";

import { useState, useMemo, useEffect } from "react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { usePrinting } from "@/hooks/use-printing";
import { PrintBatch } from "@/lib/supabase";
import { Order } from "@/lib/supabase";
import { PageTransition, StaggerContainer } from "@/components/layout/page-transition";
import { LabelSettingsPanel } from "@/components/printing/label-settings-panel";
import { PrintPreviewModal } from "@/components/printing/print-preview-modal";
import { BatchManager } from "@/components/printing/batch-manager";
import { BatchDetailsModal } from "@/components/printing/batch-details-modal";
import { ReprintWarningModal } from "@/components/printing/reprint-warning-modal";
import { MarkAsShippedDialog, MarkAsDeliveredDialog } from "@/components/printing/confirmation-dialog";
import { EnhancedLabelOptions, printBulkInvoices, generateBulkA6InvoicesHTML } from "@/lib/enhanced-label-generator";
import { exportOrdersToPrimeCSV } from "@/lib/export-utils";
import { downloadLabelPdf } from "@/lib/pdf-download";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import {
    Printer,
    CheckSquare,
    FileText,
    Tag,
    CheckCircle,
    SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useCustomerOrderCounts } from "@/hooks/use-customer-order-counts";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import { sortQueue } from "@/lib/dispatch-queue";
import { useDispatchRun } from "@/hooks/use-dispatch-run";
import { QueueFilters, type SortBy } from "@/components/printing/queue-filters";
import { QueueRow } from "@/components/printing/queue-row";
import { BatchHistory } from "@/components/printing/batch-history";
import { DispatchSummary } from "@/components/printing/dispatch-summary";
import { DispatchActionBar } from "@/components/printing/dispatch-action-bar";

export default function PrintingPage() {
    const { orders, loading, error, bulkUpdateStatus } = useOrdersContext();
    const printing = usePrinting(orders);
    const { t } = useLanguage();

    // Selection state
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
    const [printType, setPrintType] = useState<"labels" | "invoices">("labels");
    const [invoiceTemplate, setInvoiceTemplate] = useState<"classic" | "modern" | "prime">("prime");

    // UI state
    const [view, setView] = useState<"queue" | "history">("queue");
    const [showFilters, setShowFilters] = useState(true);
    const [sortBy, setSortBy] = useState<SortBy>("priority");

    // Modal state
    const [showPreview, setShowPreview] = useState(false);
    const [showReprintWarning, setShowReprintWarning] = useState(false);
    // Which action the reprint warning is guarding: sending to the printer or downloading the PDF
    const [reprintAction, setReprintAction] = useState<"print" | "pdf">("print");
    const [showShipDialog, setShowShipDialog] = useState(false);
    const [showDeliverDialog, setShowDeliverDialog] = useState(false);
    const [selectedBatch, setSelectedBatch] = useState<PrintBatch | null>(null);
    const [showBatchDetails, setShowBatchDetails] = useState(false);

    // Automation state
    const [autoShipAfterPrint, setAutoShipAfterPrint] = useState(true);

    // Load batches on mount
    const { fetchBatches } = printing;
    useEffect(() => {
        fetchBatches();
    }, [fetchBatches]);

    const sortedOrders = useMemo(
        () => sortQueue(printing.printableOrders, sortBy),
        [printing.printableOrders, sortBy]
    );

    // Toggle order selection
    const toggleOrderSelection = (orderId: string) => {
        const newSelected = new Set(selectedOrders);
        if (newSelected.has(orderId)) {
            newSelected.delete(orderId);
        } else {
            newSelected.add(orderId);
        }
        setSelectedOrders(newSelected);
    };

    // Select all
    const selectAll = () => {
        if (selectedOrders.size === sortedOrders.length) {
            setSelectedOrders(new Set());
        } else {
            setSelectedOrders(new Set(sortedOrders.map((o) => o.id)));
        }
    };

    // One server round trip for every customer on the page, keyed back to the raw phone the labels use.
    const countsByNormalizedPhone = useCustomerOrderCounts(sortedOrders, sortedOrders.length);
    const customerOrderCounts = useMemo(() => {
        const byPhone: Record<string, number> = {};
        for (const o of sortedOrders) {
            const count = countsByNormalizedPhone?.get(normalizePhoneForSearch(o.phone));
            if (count !== undefined) byPhone[o.phone] = count;
        }
        return byPhone;
    }, [sortedOrders, countsByNormalizedPhone]);

    // Get selected orders list
    const selectedOrdersList = sortedOrders.filter((o) => selectedOrders.has(o.id));

    // Check for reprints
    const reprintOrders = selectedOrdersList.filter((o) => printing.isReprintOrder(o.id));

    const run = useDispatchRun({
        printing,
        printType,
        invoiceTemplate,
        customerOrderCounts,
        autoShipAfterPrint,
        bulkUpdateStatus,
        setSelection: (ids) => setSelectedOrders(new Set(ids)),
    });
    const { pdfLoading } = run;

    // Printed orders get a warning first; the dialog remembers whether it guards print or PDF.
    const startRun = async (action: "print" | "pdf") => {
        if (selectedOrders.size === 0) return;
        if (reprintOrders.length > 0) {
            setReprintAction(action);
            setShowReprintWarning(true);
            return;
        }
        await (action === "pdf" ? run.executePdf(selectedOrdersList) : run.executePrint(selectedOrdersList));
    };

    const runGuarded = (ordersToRun: Order[]) =>
        reprintAction === "pdf" ? run.executePdf(ordersToRun) : run.executePrint(ordersToRun);

    const handlePrintAll = async () => {
        setShowReprintWarning(false);
        await runGuarded(selectedOrdersList);
    };

    const handlePrintNewOnly = async () => {
        setShowReprintWarning(false);
        const newOrders = selectedOrdersList.filter((o) => !printing.isReprintOrder(o.id));
        if (newOrders.length > 0) await runGuarded(newOrders);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4 border-[var(--pastel-purple)] border-t-transparent animate-spin"></div>
                    <p className="text-muted font-medium">{t("printing.loading")}</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="pastel-card pastel-card-pink p-8 text-center">
                    <h2 className="text-xl font-bold text-rose-900 mb-2">{t("printing.errorTitle")}</h2>
                    <p className="text-rose-700">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <PageTransition>
            <div className="min-h-screen p-6 pb-28 md:p-8 md:pb-8">
                <div className="space-y-6">
                    {/* Page Header */}
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
                    >
                        <div className="flex items-center gap-4 flex-wrap">
                            <div>
                                <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight flex items-center gap-3">
                                    <Printer className="w-8 h-8" />
                                    {t("printing.title")}
                                </h1>
                                <p className="text-muted mt-1 text-lg">
                                    {sortedOrders.length} {t("printing.subtitle")}
                                    {selectedOrders.size > 0 && ` • ${t("printing.selectedCount").replace("{count}", String(selectedOrders.size))}`}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                            {/* Print Type Toggle */}
                            <div className="flex bg-[var(--card-bg)] rounded-xl p-1 border border-[var(--card-border)]">
                                <button
                                    onClick={() => setPrintType("labels")}
                                    className={cn(
                                        "px-4 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium",
                                        printType === "labels"
                                            ? "bg-[var(--ink)] text-white"
                                            : "text-muted hover:text-foreground"
                                    )}
                                >
                                    <Tag className="w-4 h-4" />
                                    {t("printing.labels")}
                                </button>
                                <button
                                    onClick={() => setPrintType("invoices")}
                                    className={cn(
                                        "px-4 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium",
                                        printType === "invoices"
                                            ? "bg-[var(--ink)] text-white"
                                            : "text-muted hover:text-foreground"
                                    )}
                                >
                                    <FileText className="w-4 h-4" />
                                    {t("printing.invoices")}
                                </button>
                            </div>

                            {/* Invoice Template Toggle (only when invoices selected) */}
                            {printType === "invoices" && (
                                <div className="flex bg-[var(--card-bg)] rounded-xl p-1 border border-[var(--card-border)]">
                                    <button
                                        onClick={() => setInvoiceTemplate("classic")}
                                        className={cn(
                                            "px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium",
                                            invoiceTemplate === "classic"
                                                ? "bg-amber-500 text-white"
                                                : "text-muted hover:text-foreground"
                                        )}
                                    >
                                        {t("printing.template_classic")}
                                    </button>
                                    <button
                                        onClick={() => setInvoiceTemplate("modern")}
                                        className={cn(
                                            "px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium",
                                            invoiceTemplate === "modern"
                                                ? "bg-orange-500 text-white"
                                                : "text-muted hover:text-foreground"
                                        )}
                                    >
                                        {t("printing.template_modern")}
                                    </button>
                                    <button
                                        onClick={() => setInvoiceTemplate("prime")}
                                        className={cn(
                                            "px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium",
                                            invoiceTemplate === "prime"
                                                ? "bg-slate-800 text-white"
                                                : "text-muted hover:text-foreground"
                                        )}
                                    >
                                        {t("printing.template_prime")}
                                    </button>
                                </div>
                            )}

                            {/* Filters, label settings and batch history */}
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                aria-expanded={showFilters}
                                className={cn(
                                    "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                                    showFilters
                                        ? "bg-blue-100 border-blue-200 text-blue-700"
                                        : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                )}
                            >
                                <SlidersHorizontal className="w-4 h-4" />
                                {t("printing.filtersToggle")}
                            </button>
                        </div>
                    </motion.div>

                    {/* Queue / history switch */}
                    <div role="tablist" className="flex w-fit gap-1 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-1">
                        {(["queue", "history"] as const).map((tab) => (
                            <button
                                key={tab}
                                role="tab"
                                aria-selected={view === tab}
                                onClick={() => setView(tab)}
                                className={cn(
                                    "rounded-lg px-4 py-2 text-sm font-medium transition-all",
                                    view === tab ? "bg-[var(--ink)] text-white" : "text-muted hover:text-foreground"
                                )}
                            >
                                {tab === "queue"
                                    ? `${t("printing.view_queue")} (${sortedOrders.length})`
                                    : `${t("printing.view_history")} (${printing.batches.length})`}
                            </button>
                        ))}
                    </div>

                    {view === "history" ? (
                        <BatchHistory
                            batches={printing.batches}
                            onOpen={(batch) => {
                                setSelectedBatch(batch);
                                setShowBatchDetails(true);
                            }}
                        />
                    ) : (
                        <>
                    {/* Filters & Settings Panel */}
                    <AnimatePresence>
                        {showFilters && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto", overflow: "visible" }}
                                exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                                transition={{ duration: 0.3 }}
                                className="space-y-4"
                                style={{ overflow: "hidden" }}
                            >
                                <QueueFilters
                                    filters={printing.filters}
                                    onFiltersChange={printing.setFilters}
                                    onClear={printing.clearFilters}
                                    availableCities={printing.availableCities}
                                    sortBy={sortBy}
                                    onSortByChange={setSortBy}
                                    autoShip={autoShipAfterPrint}
                                    onAutoShipChange={setAutoShipAfterPrint}
                                />

                                {/* Label Settings */}
                                <LabelSettingsPanel
                                    settings={printing.labelSettings}
                                    onSettingsChange={printing.setLabelSettings}
                                    isExpanded={false}
                                />

                                {/* Batch Manager */}
                                <BatchManager
                                    batches={printing.batches}
                                    selectedOrderIds={selectedOrders}
                                    orders={sortedOrders}
                                    onCreateBatch={printing.createBatch}
                                    onAddToBatch={(batchId, orderIds, ordersData) =>
                                        printing.addOrdersToBatch(batchId, orderIds, ordersData)
                                    }
                                    onExportCSV={(ids) => printing.exportToCSV(ids, sortedOrders)}
                                    onExportExcel={(ids) => printing.exportToExcel(ids, sortedOrders)}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <DispatchSummary orders={selectedOrdersList} />

                    {/* Print Queue List */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="space-y-3"
                    >
                        {/* Select All Row */}
                        {sortedOrders.length > 0 && (
                            <div className="flex items-center gap-3 px-2">
                                <button
                                    onClick={selectAll}
                                    className={cn(
                                        "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                                        selectedOrders.size === sortedOrders.length
                                            ? "bg-[var(--ink)] border-[var(--ink)] text-white"
                                            : "border-[var(--card-border)] hover:border-[var(--foreground-muted)]"
                                    )}
                                >
                                    {selectedOrders.size === sortedOrders.length && (
                                        <CheckSquare className="w-4 h-4" />
                                    )}
                                </button>
                                <span className="text-sm text-muted">
                                    {t("printing.selectAll")} ({sortedOrders.length})
                                </span>
                            </div>
                        )}

                        <StaggerContainer className="space-y-3">
                            {sortedOrders.length === 0 ? (
                                <div className="pastel-card p-12 text-center">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--pastel-green)] flex items-center justify-center">
                                        <CheckCircle className="h-8 w-8 text-green-700" />
                                    </div>
                                    <p className="text-lg font-medium text-foreground mb-1">{t("printing.noOrders")}</p>
                                    <p className="text-sm text-muted">{t("printing.noOrdersDesc")}</p>
                                </div>
                            ) : (
                                sortedOrders.map((order) => (
                                    <QueueRow
                                        key={order.id}
                                        order={order}
                                        selected={selectedOrders.has(order.id)}
                                        onToggle={() => toggleOrderSelection(order.id)}
                                        customerOrderCount={customerOrderCounts[order.phone] ?? 0}
                                    />
                                ))
                            )}
                        </StaggerContainer>
                    </motion.div>
                        </>
                    )}
                </div>

                <DispatchActionBar
                    selectedCount={view === "queue" ? selectedOrders.size : 0}
                    pdfLoading={pdfLoading}
                    onPreview={() => setShowPreview(true)}
                    onPrint={() => void startRun("print")}
                    onPdf={() => void startRun("pdf")}
                    onExport={(company) => void run.exportShipment(selectedOrdersList, company)}
                    onShip={() => setShowShipDialog(true)}
                />

                {/* Modals */}
                <PrintPreviewModal
                    isOpen={showPreview}
                    onClose={() => setShowPreview(false)}
                    orders={selectedOrdersList}
                    printType={printType}
                    labelOptions={{ ...printing.labelSettings, invoiceTemplate }}
                    customerOrderCounts={customerOrderCounts}
                    onDownload={() => startRun("pdf")}
                />

                <ReprintWarningModal
                    isOpen={showReprintWarning}
                    onClose={() => setShowReprintWarning(false)}
                    reprintOrders={reprintOrders}
                    onConfirm={handlePrintAll}
                    onPrintNewOnly={handlePrintNewOnly}
                />

                <MarkAsShippedDialog
                    isOpen={showShipDialog}
                    onClose={() => setShowShipDialog(false)}
                    onConfirm={() => run.markShipped(selectedOrdersList)}
                    orderCount={selectedOrders.size}
                />

                <MarkAsDeliveredDialog
                    isOpen={showDeliverDialog}
                    onClose={() => setShowDeliverDialog(false)}
                    onConfirm={() => run.markDelivered(selectedOrdersList)}
                    orderCount={selectedOrders.size}
                />

                <BatchDetailsModal
                    isOpen={showBatchDetails}
                    onClose={() => {
                        setShowBatchDetails(false);
                        setSelectedBatch(null);
                    }}
                    batch={selectedBatch}
                    allOrders={orders}
                    onReprint={async (orderIds, template) => {
                        const batchOrdersToReprint = orders.filter((o) => orderIds.includes(o.id));
                        const labelOptions: EnhancedLabelOptions = {
                            ...printing.labelSettings,
                            invoiceTemplate: template as "classic" | "modern" | "prime",
                        };
                        printBulkInvoices(batchOrdersToReprint, labelOptions);
                    }}
                    onDownloadPDF={async (orderIds, template) => {
                        const batchOrdersForPdf = orders.filter((o) => orderIds.includes(o.id));
                        const labelOptions: EnhancedLabelOptions = {
                            ...printing.labelSettings,
                            invoiceTemplate: template as "classic" | "modern" | "prime",
                        };
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session?.access_token) {
                            toast.error(t("printing.signInAgainTitle"), t("printing.signInAgainBody"));
                            return;
                        }
                        const html = await generateBulkA6InvoicesHTML(batchOrdersForPdf, labelOptions);
                        await downloadLabelPdf(html, `batch-${selectedBatch?.name || "orders"}.pdf`, session.access_token, '210mm', '297mm');
                    }}
                    onDeleteBatch={printing.deleteBatch}
                    onUpdateName={printing.updateBatchName}
                    onRemoveOrders={printing.removeOrdersFromBatch}
                    onExportPrimeCSV={(orderIds, ordersData) => {
                        void exportOrdersToPrimeCSV(orderIds, ordersData);
                    }}
                />
            </div>
        </PageTransition>
    );
}
