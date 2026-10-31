"use client";

import { useState, useMemo, useEffect } from "react";
import { useOrdersContext } from "@/components/providers/orders-provider";
import { usePrinting } from "@/hooks/use-printing";
import { PrintBatch } from "@/lib/supabase";
import { Order } from "@/lib/supabase";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/layout/page-transition";
import { LabelSettingsPanel } from "@/components/printing/label-settings-panel";
import { PrintPreviewModal } from "@/components/printing/print-preview-modal";
import { BatchManager } from "@/components/printing/batch-manager";
import { BatchDetailsModal } from "@/components/printing/batch-details-modal";
import { ReprintWarningModal } from "@/components/printing/reprint-warning-modal";
import { MarkAsShippedDialog, MarkAsDeliveredDialog } from "@/components/printing/confirmation-dialog";
import { DateRangePicker } from "@scheniders/ui/date-range-picker";
import { EnhancedLabelOptions, printBulkEnhancedLabels, printBulkInvoices, generateBulkA6InvoicesHTML, printBulkShippingLabels, generateBulkShippingLabelsHTML } from "@/lib/enhanced-label-generator";
import { downloadLabelPdf } from "@/lib/pdf-download";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { useLanguage } from "@/hooks/use-language";
import {
    Printer,
    CheckSquare,
    MapPin,
    FileText,
    Tag,
    Truck,
    CheckCircle,
    Search,
    ChevronDown,
    X,
    CalendarDays,
    Eye,
    RefreshCw,
    AlertTriangle,
    SlidersHorizontal,
    Download,
    Flame,
    Flag,
} from "lucide-react";
import { formatIQD, formatDate, getBaseOrderId } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { partitionByShipDay } from "@/lib/order-bulk-scope";
import { toast } from "@/hooks/use-toast";
import { getQueueFlags, hasBlockingFlag } from "@/lib/dispatch-queue";
import { DispatchSummary } from "@/components/printing/dispatch-summary";

export default function PrintingPage() {
    const { orders, loading, error, bulkUpdateStatus } = useOrdersContext();
    const printing = usePrinting(orders);
    const { t } = useLanguage();

    // Selection state
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
    const [printType, setPrintType] = useState<"labels" | "invoices">("labels");
    const [invoiceTemplate, setInvoiceTemplate] = useState<"classic" | "modern" | "prime">("prime");

    // UI state
    const [showFilters, setShowFilters] = useState(true);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [sortBy, setSortBy] = useState<"priority" | "date" | "city" | "price">("priority");
    const [sortDirection] = useState<"asc" | "desc">("asc");

    // Modal state
    const [showPreview, setShowPreview] = useState(false);
    const [showReprintWarning, setShowReprintWarning] = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [showShipDialog, setShowShipDialog] = useState(false);
    const [showDeliverDialog, setShowDeliverDialog] = useState(false);
    const [selectedBatch, setSelectedBatch] = useState<PrintBatch | null>(null);
    const [showBatchDetails, setShowBatchDetails] = useState(false);

    // Automation state
    const [autoShipAfterPrint, setAutoShipAfterPrint] = useState(true);

    // Export menu state
    const [showExportMenu, setShowExportMenu] = useState(false);

    // Customer order counts for labels
    const [customerOrderCounts, setCustomerOrderCounts] = useState<Record<string, number>>({});

    // Fetch customer counts for selected orders
    useEffect(() => {
        async function fetchCounts() {
            const phones = [...new Set(printing.printableOrders.map((o) => o.phone))];
            const counts: Record<string, number> = {};

            for (const phone of phones) {
                counts[phone] = await printing.getCustomerOrderCount(phone);
            }

            setCustomerOrderCounts(counts);
        }

        if (printing.printableOrders.length > 0) {
            fetchCounts();
        }
    }, [printing.printableOrders]);

    // Load batches on mount
    useEffect(() => {
        printing.fetchBatches();
        printing.fetchPrintHistory();
    }, []);

    // Sort orders
    const sortedOrders = useMemo(() => {
        const sorted = [...printing.printableOrders].sort((a, b) => {
            let comparison = 0;

            switch (sortBy) {
                case "priority":
                    const priorityOrder = { urgent: 0, high: 1, normal: 2 };
                    comparison = priorityOrder[a.priority || "normal"] - priorityOrder[b.priority || "normal"];
                    break;
                case "date":
                    comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                    break;
                case "city":
                    comparison = (a.city || "").localeCompare(b.city || "");
                    break;
                case "price":
                    comparison = Number(a.price) - Number(b.price);
                    break;
            }

            return sortDirection === "asc" ? comparison : -comparison;
        });

        return sorted;
    }, [printing.printableOrders, sortBy, sortDirection]);

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

    // Get selected orders list
    const selectedOrdersList = sortedOrders.filter((o) => selectedOrders.has(o.id));

    // Check for reprints
    const reprintOrders = selectedOrdersList.filter((o) => printing.isReprintOrder(o.id));

    // Handle print action
    const handlePrint = async () => {
        if (selectedOrders.size === 0) return;

        // Check for reprints first
        if (reprintOrders.length > 0) {
            setShowReprintWarning(true);
            return;
        }

        await executePrint(selectedOrdersList);
    };

    // Execute print
    const executePrint = async (ordersToPrint: Order[]) => {
        const unprintable = ordersToPrint.filter((o) => hasBlockingFlag(getQueueFlags(o)));
        if (unprintable.length > 0) {
            toast.warning(
                `${unprintable.length} without phone or address`,
                "Fix them on the orders page or deselect them, then print again."
            );
            return;
        }

        const labelOptions: EnhancedLabelOptions = {
            ...printing.labelSettings,
            invoiceTemplate: invoiceTemplate,
        };

        if (printType === "labels") {
            if (labelOptions.size === "80x120") {
                await printBulkShippingLabels(ordersToPrint, labelOptions);
            } else {
                await printBulkEnhancedLabels(ordersToPrint, labelOptions, customerOrderCounts);
            }
        } else {
            printBulkInvoices(ordersToPrint, labelOptions);
        }

        // The print dialog has already opened by now, so a failed record must be
        // loud: unrecorded prints look "never printed" and get printed twice.
        const batchName = `${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
        })}`;
        const recorded = await printing.recordPrint(
            ordersToPrint.map((o) => o.id),
            printType === "labels" ? "label" : "invoice",
            printing.labelSettings.size,
            batchName,
            invoiceTemplate
        );
        if (!recorded.success) {
            toast.error("Printed, but not recorded", recorded.error);
            return;
        }

        if (autoShipAfterPrint) {
            // Orders postponed to a later day stay home, same rule as the orders page.
            const { shippable, scheduledLater } = partitionByShipDay(ordersToPrint);
            if (scheduledLater.length > 0) {
                toast.warning(
                    `${scheduledLater.length} scheduled for a later day kept back`,
                    "They were printed but not moved to In Transit."
                );
            }
            if (shippable.length > 0) {
                await bulkUpdateStatus(shippable.map((o) => o.id), "in_transit");
            }
            setSelectedOrders(new Set());
        }
    };

    // Handle print all (including reprints)
    const handlePrintAll = async () => {
        setShowReprintWarning(false);
        await executePrint(selectedOrdersList);
    };

    // Handle print new only
    const handlePrintNewOnly = async () => {
        setShowReprintWarning(false);
        const newOrders = selectedOrdersList.filter((o) => !printing.isReprintOrder(o.id));
        if (newOrders.length > 0) {
            await executePrint(newOrders);
        }
    };

    // Handle mark as shipped
    const handleMarkAsShipped = async () => {
        const { shippable, scheduledLater } = partitionByShipDay(selectedOrdersList);
        if (scheduledLater.length > 0) {
            toast.warning(
                `${scheduledLater.length} scheduled for a later day kept back`,
                "Open one on the orders page to move it individually."
            );
        }
        if (shippable.length === 0) return;
        await bulkUpdateStatus(shippable.map((o) => o.id), "in_transit");
        setSelectedOrders(new Set(scheduledLater.map((o) => o.id)));
    };

    // Handle mark as delivered
    const handleMarkAsDelivered = async () => {
        await bulkUpdateStatus(Array.from(selectedOrders), "delivered");
        setSelectedOrders(new Set());
    };

    // Handle download PDF (server-side Puppeteer for vector-quality output)
    const handleDownloadPDF = async () => {
        if (selectedOrders.size === 0) return;

        const ordersToPrint = sortedOrders.filter((o) => selectedOrders.has(o.id));
        const labelOptions: EnhancedLabelOptions = {
            ...printing.labelSettings,
            invoiceTemplate: invoiceTemplate,
        };

        setPdfLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                alert("Please log in to download PDFs.");
                return;
            }

            let html: string;
            let filename: string;
            let pageWidth = '80mm';
            let pageHeight = '120mm';

            if (printType === "labels" && labelOptions.size === "80x120") {
                html = await generateBulkShippingLabelsHTML(ordersToPrint, labelOptions);
                filename = `shipping-labels-${new Date().toISOString().slice(0, 10)}.pdf`;
            } else if (printType === "labels") {
                const { generateBulkLabelsHTML } = await import("@/lib/enhanced-label-generator");
                html = await generateBulkLabelsHTML(ordersToPrint, labelOptions, customerOrderCounts);
                filename = `labels-${new Date().toISOString().slice(0, 10)}.pdf`;
                pageWidth = '210mm';
                pageHeight = '297mm';
            } else {
                html = await generateBulkA6InvoicesHTML(ordersToPrint, labelOptions);
                filename = `invoices-${new Date().toISOString().slice(0, 10)}.pdf`;
                pageWidth = '210mm';
                pageHeight = '297mm';
            }

            await downloadLabelPdf(html, filename, session.access_token, pageWidth, pageHeight);
        } catch (err) {
            console.error("PDF generation error:", err);
            alert("Failed to generate PDF. Please try again.");
        } finally {
            setPdfLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4 border-[var(--pastel-purple)] border-t-transparent animate-spin"></div>
                    <p className="text-muted font-medium">Loading print queue...</p>
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
            <div className="min-h-screen p-6 md:p-8">
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
                                    {sortedOrders.length} confirmed orders ready to print
                                    {selectedOrders.size > 0 && ` • ${selectedOrders.size} selected`}
                                </p>
                            </div>

                            {/* Action Buttons - Always visible area to prevent snap */}
                            <div className="flex items-center gap-2 min-h-[44px]">
                                <AnimatePresence mode="wait">
                                    {selectedOrders.size > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -10 }}
                                            transition={{ duration: 0.15 }}
                                            className="flex items-center gap-2"
                                        >
                                            {/* Preview Button */}
                                            <button
                                                onClick={() => setShowPreview(true)}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--pastel-blue)] text-blue-900 hover:shadow-md transition-all font-medium text-sm"
                                            >
                                                <Eye className="h-4 w-4" />
                                                Preview
                                            </button>

                                            {/* Print Button */}
                                            <button
                                                onClick={handlePrint}
                                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--ink)] text-white shadow-lg hover:scale-[1.02] transition-all font-semibold text-sm"
                                            >
                                                <Printer className="h-4 w-4" />
                                                Print {selectedOrders.size}
                                            </button>

                                            {/* Download PDF Button */}
                                            <button
                                                onClick={handleDownloadPDF}
                                                disabled={pdfLoading}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--pastel-purple)] text-purple-900 hover:shadow-md transition-all font-medium text-sm disabled:opacity-50"
                                            >
                                                {pdfLoading ? (
                                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Download className="h-4 w-4" />
                                                )}
                                                {pdfLoading ? "Generating..." : "PDF"}
                                            </button>

                                            {/* Shipping Export Dropdown */}
                                            <div className="relative">
                                                <button
                                                    onClick={() => setShowExportMenu(!showExportMenu)}
                                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 text-white hover:shadow-md transition-all font-medium text-sm"
                                                    title="Export for Delivery"
                                                >
                                                    <FileText className="h-4 w-4" />
                                                    تصدير للشحن
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                </button>
                                                {showExportMenu && (
                                                    <>
                                                        <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                                                        <div className="absolute top-full mt-1 right-0 z-50 bg-white rounded-xl shadow-lg border border-gray-200 py-1 min-w-[180px]">
                                                            <button
                                                                onClick={() => {
                                                                    printing.exportToPrimeCSV(Array.from(selectedOrders), sortedOrders);
                                                                    setShowExportMenu(false);
                                                                }}
                                                                className="w-full text-right px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                                                            >
                                                                <FileText className="h-4 w-4 text-slate-600" />
                                                                Prime
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    printing.exportToWaseetCSV(Array.from(selectedOrders), sortedOrders);
                                                                    setShowExportMenu(false);
                                                                }}
                                                                className="w-full text-right px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                                                            >
                                                                <FileText className="h-4 w-4 text-slate-600" />
                                                                الوسيط (Al-Waseet)
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>

                                            {/* Ship Button */}
                                            <button
                                                onClick={() => setShowShipDialog(true)}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--pastel-green)] text-emerald-900 hover:shadow-md transition-all font-medium text-sm"
                                            >
                                                <Truck className="h-4 w-4" />
                                                Ship
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
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
                                    Labels
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
                                    Invoices
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
                                        📄 Classic
                                    </button>
                                    <button
                                        onClick={() => setInvoiceTemplate("modern")}
                                        className={cn(
                                            "px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium",
                                            invoiceTemplate === "modern"
                                                ? "bg-gradient-to-r from-orange-500 to-rose-500 text-white"
                                                : "text-muted hover:text-foreground"
                                        )}
                                    >
                                        ✨ Modern
                                    </button>
                                    <button
                                        onClick={() => setInvoiceTemplate("prime")}
                                        className={cn(
                                            "px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium",
                                            invoiceTemplate === "prime"
                                                ? "bg-gradient-to-r from-slate-700 to-slate-900 text-white"
                                                : "text-muted hover:text-foreground"
                                        )}
                                    >
                                        📋 Prime
                                    </button>
                                </div>
                            )}

                            {/* Filters Toggle */}
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={cn(
                                    "p-3 rounded-2xl border transition-all shadow-sm",
                                    showFilters
                                        ? "bg-blue-100 border-blue-200 text-blue-700"
                                        : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                )}
                                title="Toggle Filters"
                            >
                                <SlidersHorizontal className="w-4 h-4" />
                            </button>
                        </div>
                    </motion.div>

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
                                {/* Search & Filters */}
                                <div className="pastel-card p-4 space-y-4">
                                    <div className="flex flex-col lg:flex-row gap-4">
                                        {/* Search */}
                                        <div className="relative flex-1">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
                                            <input
                                                type="text"
                                                placeholder="Search by name, phone, or order ID..."
                                                value={printing.filters.searchQuery || ""}
                                                onChange={(e) =>
                                                    printing.setFilters({
                                                        ...printing.filters,
                                                        searchQuery: e.target.value || undefined,
                                                    })
                                                }
                                                className="w-full pl-12 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-purple)] transition-all"
                                            />
                                        </div>

                                        {/* City Filter */}
                                        <div className="relative">
                                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                            <select
                                                value={printing.filters.city || ""}
                                                onChange={(e) =>
                                                    printing.setFilters({
                                                        ...printing.filters,
                                                        city: e.target.value || undefined,
                                                    })
                                                }
                                                className="pl-10 pr-8 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-purple)] appearance-none cursor-pointer min-w-[150px]"
                                            >
                                                <option value="">All Cities</option>
                                                {printing.availableCities.map((city) => (
                                                    <option key={city} value={city}>
                                                        {city}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                                        </div>

                                        {/* Sort */}
                                        <div className="relative">
                                            <select
                                                value={sortBy}
                                                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                                                className="pl-4 pr-8 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-2xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-purple)] appearance-none cursor-pointer"
                                            >
                                                <option value="priority">Sort by Priority</option>
                                                <option value="date">Sort by Date</option>
                                                <option value="city">Sort by City</option>
                                                <option value="price">Sort by Price</option>
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                                        </div>

                                        {/* Date Range */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowDatePicker(!showDatePicker)}
                                                className={cn(
                                                    "p-3 rounded-2xl border transition-all shadow-sm flex items-center gap-2",
                                                    (printing.filters.dateFrom || printing.filters.dateTo)
                                                        ? "bg-amber-100 border-amber-200 text-amber-700"
                                                        : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                                )}
                                                title="Date Filter"
                                            >
                                                <CalendarDays className="w-4 h-4" />
                                                {printing.filters.dateFrom && (
                                                    <span className="text-xs font-medium hidden sm:inline">
                                                        {printing.filters.dateFrom === printing.filters.dateTo
                                                            ? new Date(printing.filters.dateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                                            : `${new Date(printing.filters.dateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${printing.filters.dateTo ? new Date(printing.filters.dateTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '...'}`
                                                        }
                                                    </span>
                                                )}
                                            </button>

                                            {showDatePicker && (
                                                <div className="absolute right-0 top-full mt-2 z-50 shadow-2xl rounded-3xl">
                                                    <DateRangePicker
                                                        inline
                                                        dateFrom={printing.filters.dateFrom}
                                                        dateTo={printing.filters.dateTo}
                                                        onDateChange={(from, to) => {
                                                            printing.setFilters({
                                                                ...printing.filters,
                                                                dateFrom: from,
                                                                dateTo: to,
                                                            });
                                                            setShowDatePicker(false);
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Clear Filters */}
                                        {(printing.filters.searchQuery ||
                                            printing.filters.city ||
                                            printing.filters.dateFrom) && (
                                                <button
                                                    onClick={printing.clearFilters}
                                                    className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 hover:bg-red-100 transition-all flex items-center gap-2"
                                                >
                                                    <X className="w-4 h-4" />
                                                    Clear
                                                </button>
                                            )}
                                    </div>

                                    {/* Priority Pills */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm text-muted mr-2">Priority:</span>
                                        {["all", "urgent", "high", "normal"].map((priority) => (
                                            <button
                                                key={priority}
                                                onClick={() =>
                                                    printing.setFilters({
                                                        ...printing.filters,
                                                        priority: priority === "all" ? undefined : (priority as Order["priority"]),
                                                    })
                                                }
                                                className={cn(
                                                    "px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                                                    (priority === "all" && !printing.filters.priority) ||
                                                        printing.filters.priority === priority
                                                        ? priority === "urgent"
                                                            ? "bg-red-500 text-white"
                                                            : priority === "high"
                                                                ? "bg-orange-500 text-white"
                                                                : "bg-[var(--ink)] text-white"
                                                        : "bg-[var(--background)] border border-[var(--card-border)] text-muted hover:bg-[var(--card-border)]"
                                                )}
                                            >
                                                {priority === "all" ? "All" : priority.charAt(0).toUpperCase() + priority.slice(1)}
                                            </button>
                                        ))}

                                        {/* Auto-ship toggle */}
                                        <div className="ml-auto flex items-center gap-2">
                                            <span className="text-sm text-muted">Auto-ship after print:</span>
                                            <button
                                                onClick={() => setAutoShipAfterPrint(!autoShipAfterPrint)}
                                                className={cn(
                                                    "w-10 h-6 rounded-full transition-all relative",
                                                    autoShipAfterPrint ? "bg-green-500" : "bg-gray-300"
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow",
                                                        autoShipAfterPrint ? "left-5" : "left-1"
                                                    )}
                                                />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Label Settings */}
                                <LabelSettingsPanel
                                    settings={printing.labelSettings}
                                    onSettingsChange={printing.setLabelSettings}
                                    isExpanded={false}
                                />

                                {/* Auto-Ship After Print Toggle */}
                                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <div className="flex items-center gap-3">
                                        <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        <div>
                                            <div className="font-semibold text-gray-900 dark:text-white">
                                                Auto-Ship After Print
                                            </div>
                                            <div className="text-xs text-gray-600 dark:text-gray-400">
                                                Automatically mark orders as &ldquo;In Transit&rdquo; after printing
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setAutoShipAfterPrint(!autoShipAfterPrint)}
                                        className={cn(
                                            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                                            autoShipAfterPrint ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                                autoShipAfterPrint ? "translate-x-6" : "translate-x-1"
                                            )}
                                        />
                                    </button>
                                </div>

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
                                    onOpenBatchDetails={(batch) => {
                                        setSelectedBatch(batch);
                                        setShowBatchDetails(true);
                                    }}
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
                                    Select all ({sortedOrders.length} orders)
                                </span>
                            </div>
                        )}

                        <StaggerContainer className="space-y-3">
                            {sortedOrders.length === 0 ? (
                                <div className="pastel-card p-12 text-center">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--pastel-green)] flex items-center justify-center">
                                        <CheckCircle className="h-8 w-8 text-green-700" />
                                    </div>
                                    <p className="text-lg font-medium text-foreground mb-1">No orders to print</p>
                                    <p className="text-sm text-muted">Confirmed orders will appear here for printing</p>
                                </div>
                            ) : (
                                sortedOrders.map((order) => (
                                    <StaggerItem key={order.id}>
                                        <div className="group relative w-full">
                                            <div
                                                className={cn(
                                                    "bg-[var(--card-bg)] rounded-xl shadow-sm hover:shadow-md transition-all duration-200",
                                                    "flex items-center",
                                                    "border border-[var(--card-border)]/50",
                                                    "hover:border-[var(--secondary)] transition-colors duration-300",
                                                    selectedOrders.has(order.id) && "ring-2 ring-[var(--foreground)]"
                                                )}
                                            >
                                                {/* Thin Left Accent Bar */}
                                                <div
                                                    className={cn(
                                                        "w-1 self-stretch rounded-l-xl flex-shrink-0",
                                                        order.priority === "urgent"
                                                            ? "bg-red-500"
                                                            : order.priority === "high"
                                                                ? "bg-orange-400"
                                                                : order.is_return
                                                                    ? "bg-purple-500"
                                                                    : "bg-emerald-400"
                                                    )}
                                                />

                                                {/* Selection Checkbox */}
                                                <div className="pl-2 flex items-center justify-center flex-shrink-0">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedOrders.has(order.id)}
                                                        onChange={(e) => {
                                                            e.stopPropagation();
                                                            toggleOrderSelection(order.id);
                                                        }}
                                                        className="w-3.5 h-3.5 rounded border-gray-300 text-[var(--foreground)] focus:ring-[var(--pastel-yellow)] cursor-pointer"
                                                    />
                                                </div>

                                                {/* Main Content - Single Row */}
                                                <div className="flex-1 flex items-center gap-3 py-2 px-3 min-w-0">
                                                    {/* Customer Name + Order ID */}
                                                    <div className="flex items-center gap-2 min-w-[130px] max-w-[180px] flex-shrink-0">
                                                        <span className="font-semibold text-sm truncate text-foreground">
                                                            {order.customer_name}
                                                        </span>
                                                        <span className="text-xs font-mono text-muted flex-shrink-0">
                                                            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10">
                                                                #{getBaseOrderId(order.order_id)}
                                                            </span>
                                                        </span>
                                                    </div>

                                                    {/* Thin Divider */}
                                                    <div className="w-px h-5 bg-[var(--card-border)] flex-shrink-0 hidden md:block" />

                                                    {/* Badges */}
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        {printing.isReprintOrder(order.id) && (
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-100 text-amber-700">
                                                                <RefreshCw className="w-2.5 h-2.5" />
                                                                ×{printing.getOrderPrintCount(order.id)}
                                                            </span>
                                                        )}
                                                        {order.is_return && (
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-purple-100 text-purple-700">
                                                                <AlertTriangle className="w-2.5 h-2.5" />
                                                                REFUND
                                                            </span>
                                                        )}
                                                        {order.priority === "urgent" && (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-red-100 text-red-700 animate-pulse">
                                                                <Flame className="w-2.5 h-2.5" />
                                                            </span>
                                                        )}
                                                        {order.priority === "high" && (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-100 text-amber-700">
                                                                <Flag className="w-2.5 h-2.5" />
                                                            </span>
                                                        )}
                                                        {customerOrderCounts[order.phone] > 1 && (
                                                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[9px] font-bold">
                                                                #{customerOrderCounts[order.phone]}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Thin Divider */}
                                                    <div className="w-px h-5 bg-[var(--card-border)] flex-shrink-0 hidden md:block" />

                                                    {/* Items as Text */}
                                                    <div className="flex-1 min-w-0 hidden md:flex items-center gap-2">
                                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-purple-500 text-white font-bold text-[10px]">
                                                            {mergeOrderItems(order.items).length}
                                                        </span>
                                                        <span className="text-sm text-foreground/70 truncate">
                                                            {mergeOrderItems(order.items).map(item => `${item.name} ×${item.quantity}`).join(', ')}
                                                        </span>
                                                    </div>

                                                    {/* Thin Divider */}
                                                    <div className="w-px h-5 bg-[var(--card-border)] flex-shrink-0 hidden lg:block" />

                                                    {/* City */}
                                                    {order.city && (
                                                        <div className="hidden lg:flex items-center gap-1 text-xs text-muted flex-shrink-0 max-w-[120px]">
                                                            <MapPin className="w-3 h-3 flex-shrink-0" />
                                                            <span className="truncate">{order.city}</span>
                                                        </div>
                                                    )}

                                                    {/* Payment + Price */}
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <span
                                                            className={cn(
                                                                "px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase",
                                                                order.payment_status === "prepaid"
                                                                    ? "bg-green-100 text-green-700"
                                                                    : order.payment_status === "partial"
                                                                        ? "bg-blue-100 text-blue-700"
                                                                        : "bg-amber-100 text-amber-700"
                                                            )}
                                                        >
                                                            {order.payment_status === "prepaid"
                                                                ? "PAID"
                                                                : order.payment_status === "partial"
                                                                    ? "PARTIAL"
                                                                    : "COD"}
                                                        </span>
                                                        <div className="text-right min-w-[90px]">
                                                            <p className="text-sm font-bold text-foreground tabular-nums">
                                                                {formatIQD(Number(order.price))}
                                                            </p>
                                                            <p className="text-[10px] text-muted">{formatDate(order.created_at)}</p>
                                                        </div>
                                                    </div>

                                                    {/* Queue flags */}
                                                    {(() => {
                                                        const flags = getQueueFlags(order);
                                                        return (
                                                            <div className="flex flex-shrink-0 items-center gap-1">
                                                                {flags.reprint && (
                                                                    <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                                                                        Printed ×{order.print_count}
                                                                    </span>
                                                                )}
                                                                {flags.scheduledLater && (
                                                                    <span className="rounded-lg bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                                                                        Later
                                                                    </span>
                                                                )}
                                                                {(flags.missingPhone || flags.missingAddress) && (
                                                                    <span className="rounded-lg bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                                                        {flags.missingPhone ? "No phone" : "No address"}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* Notes indicator */}
                                                    {order.notes && (
                                                        <div className="flex-shrink-0" title={order.notes}>
                                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </StaggerItem>
                                ))
                            )}
                        </StaggerContainer>
                    </motion.div>
                </div>

                {/* Modals */}
                <PrintPreviewModal
                    isOpen={showPreview}
                    onClose={() => setShowPreview(false)}
                    orders={selectedOrdersList}
                    printType={printType}
                    labelOptions={{ ...printing.labelSettings, invoiceTemplate }}
                    customerOrderCounts={customerOrderCounts}
                    onPrint={() => executePrint(selectedOrdersList)}
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
                    onConfirm={handleMarkAsShipped}
                    orderCount={selectedOrders.size}
                />

                <MarkAsDeliveredDialog
                    isOpen={showDeliverDialog}
                    onClose={() => setShowDeliverDialog(false)}
                    onConfirm={handleMarkAsDelivered}
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
                            alert("Please log in to download PDFs.");
                            return;
                        }
                        const html = await generateBulkA6InvoicesHTML(batchOrdersForPdf, labelOptions);
                        await downloadLabelPdf(html, `batch-${selectedBatch?.name || "orders"}.pdf`, session.access_token, '210mm', '297mm');
                    }}
                    onDeleteBatch={printing.deleteBatch}
                    onUpdateName={printing.updateBatchName}
                    onRemoveOrders={printing.removeOrdersFromBatch}
                    onExportPrimeCSV={(orderIds, ordersData) => {
                        printing.exportToPrimeCSV(orderIds, ordersData);
                    }}
                />
            </div>
        </PageTransition>
    );
}
