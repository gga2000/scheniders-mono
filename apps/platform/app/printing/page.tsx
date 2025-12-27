"use client";

import { useState, useMemo, useEffect } from "react";
import { useOrders } from "@/hooks/use-orders";
import { usePrinting, LabelSettings, PrintBatch } from "@/hooks/use-printing";
import { Order } from "@/lib/supabase";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/layout/page-transition";
import { LabelSettingsPanel } from "@/components/printing/label-settings-panel";
import { PrintPreviewModal } from "@/components/printing/print-preview-modal";
import { PrintStatsPanel } from "@/components/printing/print-stats-panel";
import { BatchManager } from "@/components/printing/batch-manager";
import { BatchDetailsModal } from "@/components/printing/batch-details-modal";
import { ReprintWarningModal } from "@/components/printing/reprint-warning-modal";
import { MarkAsShippedDialog, MarkAsDeliveredDialog } from "@/components/printing/confirmation-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { EnhancedLabelOptions, printBulkEnhancedLabels, printBulkInvoices, generateBulkA6InvoicesHTML } from "@/lib/enhanced-label-generator";
import { motion, AnimatePresence } from "framer-motion";
import {
    Printer,
    Package,
    CheckSquare,
    Square,
    MapPin,
    Phone,
    FileText,
    Tag,
    Truck,
    CheckCircle,
    Search,
    ChevronDown,
    Filter,
    X,
    CalendarDays,
    Eye,
    BarChart3,
    RefreshCw,
    AlertTriangle,
    ChevronUp,
    Star,
    SlidersHorizontal,
    GripVertical,
    Download,
} from "lucide-react";
import { formatIQD, formatDate, getBaseOrderId } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function PrintingPage() {
    const { orders, loading, error, updateOrderStatus, bulkUpdateStatus } = useOrders();
    const printing = usePrinting(orders);

    // Selection state
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
    const [printType, setPrintType] = useState<"labels" | "invoices">("invoices");
    const [invoiceTemplate, setInvoiceTemplate] = useState<"classic" | "modern" | "prime">("prime");

    // UI state
    const [showStats, setShowStats] = useState(false);
    const [showFilters, setShowFilters] = useState(true);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [sortBy, setSortBy] = useState<"priority" | "date" | "city" | "price">("priority");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

    // Modal state
    const [showPreview, setShowPreview] = useState(false);
    const [showReprintWarning, setShowReprintWarning] = useState(false);
    const [showShipDialog, setShowShipDialog] = useState(false);
    const [showDeliverDialog, setShowDeliverDialog] = useState(false);
    const [selectedBatch, setSelectedBatch] = useState<PrintBatch | null>(null);
    const [showBatchDetails, setShowBatchDetails] = useState(false);

    // Automation state
    const [autoShipAfterPrint, setAutoShipAfterPrint] = useState(true);

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
        const labelOptions: EnhancedLabelOptions = {
            ...printing.labelSettings,
            invoiceTemplate: invoiceTemplate,
        };

        if (printType === "labels") {
            await printBulkEnhancedLabels(ordersToPrint, labelOptions, customerOrderCounts);
        } else {
            printBulkInvoices(ordersToPrint, labelOptions);
        }

        // Record print history
        await printing.recordPrint(
            ordersToPrint.map((o) => o.id),
            printType === "labels" ? "label" : "invoice",
            undefined,
            printing.labelSettings.size
        );

        // Auto-create batch for this print job
        const batchName = `${new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        })} - ${new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        })}`;
        await printing.createBatch(
            batchName,
            ordersToPrint.map((o) => o.id),
            ordersToPrint,
            invoiceTemplate,
            printType
        );

        // Auto-ship if enabled
        if (autoShipAfterPrint) {
            await bulkUpdateStatus(ordersToPrint.map((o) => o.id), "in_transit");
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
        await bulkUpdateStatus(Array.from(selectedOrders), "in_transit");
        setSelectedOrders(new Set());
    };

    // Handle mark as delivered
    const handleMarkAsDelivered = async () => {
        await bulkUpdateStatus(Array.from(selectedOrders), "delivered");
        setSelectedOrders(new Set());
    };

    // Handle download PDF
    const handleDownloadPDF = async () => {
        if (selectedOrders.size === 0) return;

        const ordersToPrint = sortedOrders.filter((o) => selectedOrders.has(o.id));
        const labelOptions: EnhancedLabelOptions = {
            ...printing.labelSettings,
            invoiceTemplate: invoiceTemplate,
        };

        // Generate the HTML content
        const html = await generateBulkA6InvoicesHTML(ordersToPrint, labelOptions);

        // Create iframe completely off-screen (iframes don't affect main document layout)
        const iframe = document.createElement("iframe");
        iframe.style.cssText = "position:absolute;left:-99999px;top:-99999px;width:794px;height:1123px;border:none;";
        iframe.srcdoc = html;
        document.body.appendChild(iframe);

        // Wait for iframe to load
        await new Promise<void>((resolve) => {
            iframe.onload = () => resolve();
            setTimeout(resolve, 2000); // Fallback timeout
        });

        // Additional wait for content rendering
        await new Promise((resolve) => setTimeout(resolve, 500));

        try {
            const html2canvas = (await import("html2canvas")).default;
            const { jsPDF } = await import("jspdf");

            const iframeDoc = iframe.contentDocument;
            if (!iframeDoc) throw new Error("Could not access iframe document");

            const body = iframeDoc.body;

            const canvas = await html2canvas(body, {
                scale: 1.5,
                useCORS: true,
                logging: false,
                backgroundColor: "#ffffff",
                allowTaint: true,
            });

            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4",
            });

            const imgWidth = 210;
            const pageHeight = 297;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            const imgData = canvas.toDataURL("image/png");

            let yPos = 0;
            let remainingHeight = imgHeight;

            pdf.addImage(imgData, "PNG", 0, yPos, imgWidth, imgHeight);
            remainingHeight -= pageHeight;

            while (remainingHeight > 0) {
                pdf.addPage();
                yPos = -(imgHeight - remainingHeight);
                pdf.addImage(imgData, "PNG", 0, yPos, imgWidth, imgHeight);
                remainingHeight -= pageHeight;
            }

            pdf.save(`invoices-${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Failed to generate PDF. Please try again.");
        } finally {
            document.body.removeChild(iframe);
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
                    <h2 className="text-xl font-bold text-rose-900 mb-2">Error Loading Print Queue</h2>
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
                                    Print Queue
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
                                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--foreground)] text-white shadow-lg hover:scale-[1.02] transition-all font-semibold text-sm"
                                            >
                                                <Printer className="h-4 w-4" />
                                                Print {selectedOrders.size}
                                            </button>

                                            {/* Download PDF Button */}
                                            <button
                                                onClick={handleDownloadPDF}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--pastel-purple)] text-purple-900 hover:shadow-md transition-all font-medium text-sm"
                                            >
                                                <Download className="h-4 w-4" />
                                                PDF
                                            </button>

                                            {/* Prime CSV Export Button */}
                                            <button
                                                onClick={() => {
                                                    printing.exportToPrimeCSV(Array.from(selectedOrders), sortedOrders);
                                                }}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 text-white hover:shadow-md transition-all font-medium text-sm"
                                                title="Export for Prime Delivery"
                                            >
                                                <FileText className="h-4 w-4" />
                                                تصدير للشحن
                                            </button>

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
                                            ? "bg-[var(--foreground)] text-white"
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
                                            ? "bg-[var(--foreground)] text-white"
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

                            {/* Stats Toggle */}
                            <button
                                onClick={() => setShowStats(!showStats)}
                                className={cn(
                                    "p-3 rounded-2xl border transition-all shadow-sm",
                                    showStats
                                        ? "bg-purple-100 border-purple-200 text-purple-700"
                                        : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted hover:bg-[var(--background)]"
                                )}
                                title="Toggle Stats"
                            >
                                <BarChart3 className="w-4 h-4" />
                            </button>

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

                    {/* Stats Panel */}
                    <AnimatePresence>
                        {showStats && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <PrintStatsPanel stats={printing.stats} />
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Filters & Settings Panel */}
                    <AnimatePresence>
                        {showFilters && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden space-y-4"
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
                                                        priority: priority === "all" ? undefined : (priority as any),
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
                                                                : "bg-[var(--foreground)] text-white"
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
                                            ? "bg-[var(--foreground)] border-[var(--foreground)] text-white"
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
                                        <motion.div
                                            className={cn(
                                                "bg-[var(--card-bg)] rounded-[20px] shadow-[var(--card-shadow)] overflow-hidden transition-all cursor-pointer",
                                                selectedOrders.has(order.id)
                                                    ? "ring-2 ring-[var(--foreground)] shadow-lg"
                                                    : "hover:shadow-[var(--card-shadow-hover)]"
                                            )}
                                            onClick={() => toggleOrderSelection(order.id)}
                                        >
                                            <div className="flex items-center p-4 gap-4">
                                                {/* Checkbox */}
                                                <div
                                                    className={cn(
                                                        "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0",
                                                        selectedOrders.has(order.id)
                                                            ? "bg-[var(--foreground)] border-[var(--foreground)] text-white"
                                                            : "border-[var(--card-border)]"
                                                    )}
                                                >
                                                    {selectedOrders.has(order.id) ? (
                                                        <CheckSquare className="w-4 h-4" />
                                                    ) : (
                                                        <Square className="w-4 h-4 text-transparent" />
                                                    )}
                                                </div>

                                                {/* Priority Indicator */}
                                                {order.priority !== "normal" && (
                                                    <div
                                                        className={cn(
                                                            "w-2 h-12 rounded-full flex-shrink-0",
                                                            order.priority === "urgent"
                                                                ? "bg-red-500"
                                                                : "bg-orange-400"
                                                        )}
                                                    />
                                                )}

                                                {/* Order ID Badge */}
                                                <div
                                                    className={cn(
                                                        "w-20 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                                                        printing.isReprintOrder(order.id)
                                                            ? "bg-amber-100"
                                                            : "bg-[var(--pastel-green)]"
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            "font-mono font-bold text-sm",
                                                            printing.isReprintOrder(order.id)
                                                                ? "text-amber-800"
                                                                : "text-green-900"
                                                        )}
                                                    >
                                                        #{getBaseOrderId(order.order_id)}
                                                    </span>
                                                </div>

                                                {/* Reprint indicator */}
                                                {printing.isReprintOrder(order.id) && (
                                                    <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 rounded-lg">
                                                        <RefreshCw className="w-3 h-3 text-amber-600" />
                                                        <span className="text-xs text-amber-700 font-medium">
                                                            ×{printing.getOrderPrintCount(order.id)}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Customer Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-foreground truncate">
                                                            {order.customer_name}
                                                        </p>
                                                        {customerOrderCounts[order.phone] > 1 && (
                                                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                                                                #{customerOrderCounts[order.phone]} order
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 text-sm text-muted mt-1">
                                                        <span className="flex items-center gap-1 font-mono">
                                                            <Phone className="w-3 h-3" />
                                                            {order.phone}
                                                        </span>
                                                        {order.city && (
                                                            <span className="flex items-center gap-1">
                                                                <MapPin className="w-3 h-3" />
                                                                {order.city}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Items Preview */}
                                                <div className="hidden md:block flex-1">
                                                    <div className="flex flex-wrap gap-2">
                                                        {order.items?.map((item, idx) => (
                                                            <span
                                                                key={idx}
                                                                className="px-2 py-1 bg-[var(--background)] rounded-lg text-sm"
                                                            >
                                                                {item.name} ×{item.quantity}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Payment Badge */}
                                                <div className="flex-shrink-0">
                                                    <span
                                                        className={cn(
                                                            "px-3 py-1.5 rounded-xl text-xs font-bold",
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
                                                </div>

                                                {/* Price */}
                                                <div className="text-right min-w-[100px]">
                                                    <p className="text-lg font-bold text-foreground">
                                                        {formatIQD(Number(order.price))}
                                                    </p>
                                                    <p className="text-xs text-muted">{formatDate(order.created_at)}</p>
                                                </div>

                                                {/* Notes indicator */}
                                                {order.notes && (
                                                    <div className="flex-shrink-0" title={order.notes}>
                                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
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
                        const html = await generateBulkA6InvoicesHTML(batchOrdersForPdf, labelOptions);

                        const iframe = document.createElement("iframe");
                        iframe.style.cssText = "position:absolute;left:-99999px;top:-99999px;width:794px;height:1123px;border:none;";
                        iframe.srcdoc = html;
                        document.body.appendChild(iframe);

                        await new Promise<void>((resolve) => {
                            iframe.onload = () => resolve();
                            setTimeout(resolve, 2000);
                        });
                        await new Promise((resolve) => setTimeout(resolve, 500));

                        try {
                            const html2canvas = (await import("html2canvas")).default;
                            const { jsPDF } = await import("jspdf");
                            const iframeDoc = iframe.contentDocument;
                            if (!iframeDoc) throw new Error("Could not access iframe");

                            const canvas = await html2canvas(iframeDoc.body, {
                                scale: 1.5,
                                useCORS: true,
                                logging: false,
                                backgroundColor: "#ffffff",
                                allowTaint: true,
                            });

                            const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
                            const imgWidth = 210;
                            const imgHeight = (canvas.height * imgWidth) / canvas.width;
                            const imgData = canvas.toDataURL("image/png");

                            let yPos = 0;
                            let remainingHeight = imgHeight;
                            pdf.addImage(imgData, "PNG", 0, yPos, imgWidth, imgHeight);
                            remainingHeight -= 297;

                            while (remainingHeight > 0) {
                                pdf.addPage();
                                yPos = -(imgHeight - remainingHeight);
                                pdf.addImage(imgData, "PNG", 0, yPos, imgWidth, imgHeight);
                                remainingHeight -= 297;
                            }
                            pdf.save(`batch-${selectedBatch?.name || "orders"}.pdf`);
                        } catch (error) {
                            console.error("PDF generation error:", error);
                        } finally {
                            document.body.removeChild(iframe);
                        }
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
