"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Order } from "@/lib/supabase";
import { EnhancedLabelOptions, generateLabelHTML, generateA6InvoiceHTML, generateA6InvoiceModern, generateA6InvoicePrime, generateBulkA6InvoicesHTML, generateShippingLabelHTML, SHIPPING_LABEL_CSS } from "@/lib/enhanced-label-generator";
import { X, Printer, ZoomIn, ZoomOut, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface PrintPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    orders: Order[];
    printType: "labels" | "invoices";
    labelOptions: EnhancedLabelOptions;
    customerOrderCounts?: Record<string, number>;
    onPrint: () => void;
}

export function PrintPreviewModal({
    isOpen,
    onClose,
    orders,
    printType,
    labelOptions,
    customerOrderCounts,
    onPrint,
}: PrintPreviewModalProps) {
    const { t } = useLanguage();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [previewHtml, setPreviewHtml] = useState<string>("");
    const [zoom, setZoom] = useState(100);
    const [loading, setLoading] = useState(true);

    // Generate preview HTML when modal opens or options change
    useEffect(() => {
        async function generatePreview() {
            if (!isOpen || orders.length === 0) return;

            setLoading(true);
            try {
                const order = orders[currentIndex];
                const options = {
                    ...labelOptions,
                    customerOrderCount: customerOrderCounts?.[order.phone] || 1,
                };

                let html: string;
                if (printType === "labels" && options.size === "80x120") {
                    html = await generateShippingLabelHTML(order, options);
                } else if (printType === "labels") {
                    html = await generateLabelHTML(order, options);
                } else if (options.invoiceTemplate === "prime") {
                    html = await generateA6InvoicePrime(order, options);
                } else if (options.invoiceTemplate === "modern") {
                    html = await generateA6InvoiceModern(order, options);
                } else {
                    html = await generateA6InvoiceHTML(order, options);
                }

                // For A6 invoices and shipping labels, the content is already the div
                if (printType === "invoices" || (printType === "labels" && options.size === "80x120")) {
                    setPreviewHtml(html);
                } else {
                    // Extract body content for old-style labels preview
                    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<script>/i);
                    if (bodyMatch) {
                        setPreviewHtml(bodyMatch[1]);
                    }
                }
            } catch (err) {
                console.error("Error generating preview:", err);
            } finally {
                setLoading(false);
            }
        }

        generatePreview();
    }, [isOpen, orders, currentIndex, printType, labelOptions, customerOrderCounts]);

    if (!isOpen) return null;

    const currentOrder = orders[currentIndex];

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center"
            >
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* Modal */}
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="relative bg-[var(--card-bg)] rounded-3xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-[var(--card-border)]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--pastel-purple)] flex items-center justify-center">
                                <Eye className="w-5 h-5 text-purple-700" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-foreground">{t("printing.preview_title")}</h2>
                                <p className="text-sm text-muted">
                                    {t(printType === "labels" ? "printing.preview_labelOf" : "printing.preview_invoiceOf")
                                        .replace("{current}", String(currentIndex + 1))
                                        .replace("{total}", String(orders.length))}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Zoom Controls */}
                            <div className="flex items-center gap-2 bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]">
                                <button
                                    onClick={() => setZoom(Math.max(50, zoom - 25))}
                                    className="p-2 rounded-lg hover:bg-[var(--card-border)] transition-colors"
                                    disabled={zoom <= 50}
                                >
                                    <ZoomOut className="w-4 h-4" />
                                </button>
                                <span className="text-sm font-medium w-12 text-center">{zoom}%</span>
                                <button
                                    onClick={() => setZoom(Math.min(200, zoom + 25))}
                                    className="p-2 rounded-lg hover:bg-[var(--card-border)] transition-colors"
                                    disabled={zoom >= 200}
                                >
                                    <ZoomIn className="w-4 h-4" />
                                </button>
                            </div>

                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Preview Container */}
                    <div className="flex-1 overflow-auto p-6 bg-[var(--background)]">
                        {loading ? (
                            <div className="flex items-center justify-center h-64">
                                <div className="w-10 h-10 rounded-full border-4 border-[var(--pastel-purple)] border-t-transparent animate-spin" />
                            </div>
                        ) : (
                            <div
                                className="bg-white rounded-2xl shadow-lg mx-auto transition-transform origin-top"
                                style={{
                                    transform: `scale(${zoom / 100})`,
                                    transformOrigin: "top center",
                                    maxWidth: printType === "labels" && labelOptions.size === "80x120"
                                        ? "80mm"
                                        : printType === "invoices" ? "98mm" : "auto",
                                }}
                            >
                                {/* Shipping Label Styles */}
                                {printType === "labels" && labelOptions.size === "80x120" && (
                                    <style dangerouslySetInnerHTML={{ __html: SHIPPING_LABEL_CSS }} />
                                )}
                                {/* Compact Invoice Styles - matches print output */}
                                {printType === "invoices" && (
                                    <style dangerouslySetInnerHTML={{
                                        __html: `
                                        .a6-invoice {
                                            width: 98mm;
                                            border: 1px solid #e0e0e0;
                                            border-radius: 2px;
                                            padding: 8px;
                                            display: flex;
                                            flex-direction: column;
                                            background: white;
                                            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                                            font-size: 9px;
                                            color: #1a1a2e;
                                            direction: rtl;
                                        }
                                        .invoice-header {
                                            display: flex;
                                            justify-content: space-between;
                                            align-items: center;
                                            margin-bottom: 6px;
                                            padding-bottom: 6px;
                                            border-bottom: 1px solid #eee;
                                        }
                                        .header-left, .header-center, .header-right {
                                            display: flex;
                                            flex-direction: column;
                                            align-items: center;
                                        }
                                        .header-left { align-items: flex-start; }
                                        .header-right { align-items: flex-end; }
                                        .company-badge {
                                            background: #1a1a2e;
                                            color: white;
                                            padding: 4px 10px;
                                            font-size: 8px;
                                            font-weight: 700;
                                            letter-spacing: 1px;
                                            border-radius: 2px;
                                        }
                                        .invoice-title {
                                            font-size: 14px;
                                            font-weight: 900;
                                            color: #E3735E;
                                            line-height: 1;
                                        }
                                        .invoice-title-en {
                                            font-size: 10px;
                                            font-weight: 700;
                                            color: #1a1a2e;
                                            letter-spacing: 1px;
                                        }
                                        .qr-box {
                                            width: 50px;
                                            height: 50px;
                                        }
                                        .qr-box svg {
                                            width: 100%;
                                            height: 100%;
                                        }
                                        .qr-label {
                                            font-size: 8px;
                                            font-weight: 600;
                                            color: #1a1a2e;
                                            margin-top: 2px;
                                        }
                                        .client-bar {
                                            display: grid;
                                            grid-template-columns: 2fr 1fr 1fr 1.5fr;
                                            gap: 4px;
                                            padding: 6px 0;
                                            border-bottom: 1px solid #ddd;
                                            margin-bottom: 6px;
                                        }
                                        .client-field {
                                            display: flex;
                                            flex-direction: column;
                                        }
                                        .field-label {
                                            font-size: 7px;
                                            color: #6CB3B3;
                                            font-weight: 600;
                                            margin-bottom: 2px;
                                        }
                                        .field-value {
                                            font-size: 9px;
                                            font-weight: 600;
                                            color: #1a1a2e;
                                        }
                                        .phone-num {
                                            font-family: 'Courier New', monospace;
                                            letter-spacing: 0.3px;
                                            direction: ltr;
                                            text-align: right;
                                        }
                                        .main-content {
                                            display: flex;
                                            gap: 6px;
                                            margin-bottom: 8px;
                                        }
                                        .sidebar {
                                            width: 70px;
                                            background: #f8f9fa;
                                            padding: 6px;
                                            border-radius: 3px;
                                            display: flex;
                                            flex-direction: column;
                                            gap: 4px;
                                        }
                                        .sidebar-item {
                                            display: flex;
                                            flex-direction: column;
                                        }
                                        .sidebar-label {
                                            font-size: 7px;
                                            color: #6CB3B3;
                                            font-weight: 700;
                                        }
                                        .sidebar-value {
                                            font-size: 8px;
                                            color: #1a1a2e;
                                            word-break: break-word;
                                        }
                                        .address-val {
                                            font-size: 7px;
                                            line-height: 1.2;
                                        }
                                        .items-section {
                                            flex: 1;
                                            display: flex;
                                            flex-direction: column;
                                        }
                                        .items-table {
                                            width: 100%;
                                            border-collapse: collapse;
                                            font-size: 8px;
                                        }
                                        .items-table thead tr {
                                            background: #FF6B35;
                                            color: white;
                                        }
                                        .items-table th {
                                            padding: 3px 4px;
                                            text-align: right;
                                            font-weight: 600;
                                            font-size: 7px;
                                        }
                                        .items-table td {
                                            padding: 3px 4px;
                                            border-bottom: 1px solid #f0f0f0;
                                            text-align: right;
                                        }
                                        .col-sl {
                                            width: 20px;
                                            text-align: center !important;
                                        }
                                        .col-desc {
                                            width: auto;
                                        }
                                        .col-qty {
                                            width: 30px;
                                            text-align: center !important;
                                        }
                                        .col-price {
                                            width: 60px;
                                            text-align: left !important;
                                            direction: ltr;
                                            font-weight: 600;
                                        }
                                        .totals-section {
                                            margin-top: 8px;
                                            padding-top: 6px;
                                            border-top: 1px dashed #ddd;
                                        }
                                        .total-row {
                                            display: flex;
                                            justify-content: space-between;
                                            font-size: 8px;
                                            padding: 2px 0;
                                        }
                                        .discount-row {
                                            color: #6CB3B3;
                                        }
                                        .discount-badge {
                                            background: #6CB3B3;
                                            color: white;
                                            padding: 0 5px;
                                            border-radius: 8px;
                                            font-size: 7px;
                                            font-weight: 600;
                                        }
                                        .grand-total {
                                            font-size: 12px;
                                            font-weight: 700;
                                            color: #1a1a2e;
                                            padding-top: 4px;
                                            border-top: 1px solid #1a1a2e;
                                            margin-top: 4px;
                                        }
                                        .total-amount {
                                            color: #000000;
                                            font-weight: 800;
                                        }
                                        .customer-note {
                                            font-size: 7px;
                                            color: #888;
                                            text-align: left;
                                            margin-top: 3px;
                                            font-style: italic;
                                        }
                                        .notes-section {
                                            background: #fffbeb;
                                            padding: 4px 6px;
                                            border-radius: 3px;
                                            font-size: 7px;
                                            margin-top: 4px;
                                            border: 1px dashed #f59e0b;
                                        }
                                        .notes-label {
                                            font-weight: 600;
                                            color: #f59e0b;
                                        }
                                        .invoice-footer {
                                            margin-top: 8px;
                                            padding-top: 6px;
                                        }
                                        .footer-line {
                                            height: 3px;
                                            background: #FF6B35;
                                            margin-bottom: 3px;
                                        }
                                        .footer-text {
                                            font-size: 7px;
                                            color: #888;
                                            text-align: center;
                                        }
                                        
                                        /* MODERN INVOICE STYLES */
                                        .modern-invoice {
                                            width: 98mm;
                                            border: 1px solid #e0e0e0;
                                            border-radius: 4px;
                                            padding: 10px;
                                            display: flex;
                                            flex-direction: column;
                                            background: white;
                                            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                                            direction: rtl;
                                        }
                                        .modern-invoice .top-bar {
                                            display: flex;
                                            justify-content: space-between;
                                            align-items: center;
                                            padding-bottom: 8px;
                                            border-bottom: 2px solid #1a1a2e;
                                            margin-bottom: 8px;
                                        }
                                        .modern-invoice .qr-section {
                                            display: flex;
                                            flex-direction: column;
                                            align-items: center;
                                        }
                                        .modern-invoice .qr-code {
                                            width: 40px;
                                            height: 40px;
                                        }
                                        .modern-invoice .qr-code svg {
                                            width: 100%;
                                            height: 100%;
                                        }
                                        .modern-invoice .order-id {
                                            font-size: 9px;
                                            font-weight: 700;
                                            color: #1a1a2e;
                                            margin-top: 2px;
                                        }
                                        .modern-invoice .brand {
                                            font-size: 14px;
                                            font-weight: 800;
                                            color: #FF6B35;
                                            letter-spacing: 1px;
                                        }
                                        .modern-invoice .logo-section {
                                            display: flex;
                                            flex-direction: column;
                                            align-items: center;
                                            justify-content: center;
                                        }
                                        .modern-invoice .company-logo {
                                            max-height: 40px;
                                            max-width: 60px;
                                            object-fit: contain;
                                        }
                                        .modern-invoice .logo-placeholder {
                                            font-size: 8px;
                                            font-weight: 800;
                                            color: #1a1a2e;
                                            background: #f0f0f0;
                                            padding: 8px 12px;
                                            border-radius: 4px;
                                            letter-spacing: 1px;
                                        }
                                        .modern-invoice .city-badge {
                                            background: linear-gradient(135deg, #FF6B35, #E3735E);
                                            color: white;
                                            padding: 5px 12px;
                                            border-radius: 12px;
                                            font-size: 11px;
                                            font-weight: 700;
                                        }
                                        .modern-invoice .customer-section {
                                            text-align: center;
                                            padding: 12px 0;
                                            flex-grow: 1;
                                        }
                                        .modern-invoice .customer-name {
                                            font-size: 20px;
                                            font-weight: 800;
                                            color: #1a1a2e;
                                            margin-bottom: 6px;
                                        }
                                        .modern-invoice .customer-order-id {
                                            font-size: 14px;
                                            font-weight: 700;
                                            color: #FF6B35;
                                            margin-bottom: 4px;
                                        }
                                        .modern-invoice .customer-phone {
                                            font-size: 16px;
                                            font-weight: 600;
                                            color: #333;
                                            direction: ltr;
                                            letter-spacing: 2px;
                                        }
                                        .modern-invoice .customer-address {
                                            font-size: 12px;
                                            font-weight: 600;
                                            color: #1a1a2e;
                                            margin-top: 8px;
                                            padding: 6px 10px;
                                            background: #f0f0f0;
                                            border-radius: 6px;
                                        }
                                        .modern-invoice .products-section {
                                            background: #f8f8f8;
                                            border-radius: 6px;
                                            padding: 8px 10px;
                                            margin: 6px 0;
                                        }
                                        .modern-invoice .product-item {
                                            font-size: 11px;
                                            color: #333;
                                            padding: 3px 0;
                                        }
                                        .modern-invoice .total-section {
                                            text-align: center;
                                            padding: 10px 0;
                                            border-top: 2px dashed #ddd;
                                            margin-top: auto;
                                        }
                                        .modern-invoice .delivery-row {
                                            font-size: 10px;
                                            color: #666;
                                            margin-bottom: 4px;
                                        }
                                        .modern-invoice .total-amount {
                                            font-size: 22px;
                                            font-weight: 900;
                                            color: #1a1a2e;
                                        }
                                        .modern-invoice .total-label {
                                            font-size: 12px;
                                            color: #666;
                                            font-weight: 600;
                                        }
                                        .modern-invoice .notes-section {
                                            font-size: 9px;
                                            color: #f59e0b;
                                            text-align: center;
                                            margin-top: 6px;
                                        }

                                        /* PRIME INVOICE STYLES */
                                        .prime-invoice {
                                            width: 98mm;
                                            border: 1px solid #ccc;
                                            padding: 8px;
                                            display: flex;
                                            flex-direction: column;
                                            background: white;
                                            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
                                            direction: rtl;
                                        }
                                        .prime-header {
                                            display: flex;
                                            justify-content: space-between;
                                            align-items: center;
                                            padding-bottom: 8px;
                                            border-bottom: 1px solid #333;
                                            margin-bottom: 8px;
                                        }
                                        .prime-logo {
                                            display: flex;
                                            flex-direction: column;
                                            align-items: flex-start;
                                            min-width: 60px;
                                        }
                                        .prime-brand-center {
                                            font-size: 14px;
                                            font-weight: 700;
                                            color: #666;
                                            letter-spacing: 0.5px;
                                            text-align: center;
                                            flex: 1;
                                        }
                                        .prime-qr {
                                            display: flex;
                                            flex-direction: column;
                                            align-items: center;
                                        }
                                        .prime-qr-code {
                                            width: 60px;
                                            height: 60px;
                                        }
                                        .prime-qr-code svg {
                                            width: 100%;
                                            height: 100%;
                                        }
                                        .prime-shipment-row {
                                            text-align: center;
                                            padding: 6px 0;
                                            border-bottom: 1px solid #ccc;
                                            margin-bottom: 8px;
                                        }
                                        .prime-shipment-label {
                                            font-size: 11px;
                                            color: #666;
                                            margin-left: 8px;
                                        }
                                        .prime-shipment-value {
                                            font-size: 14px;
                                            font-weight: 800;
                                            color: #1a1a2e;
                                        }
                                        .prime-table {
                                            width: 100%;
                                            border-collapse: collapse;
                                            margin-bottom: 6px;
                                        }
                                        .prime-table td {
                                            border: 1px solid #ccc;
                                            padding: 4px 6px;
                                            font-size: 10px;
                                        }
                                        .prime-label {
                                            background: #f0f0f0;
                                            font-weight: 600;
                                            color: #333;
                                            width: 25%;
                                        }
                                        .prime-value {
                                            font-weight: 500;
                                            color: #1a1a2e;
                                        }
                                        .prime-value-centered {
                                            font-weight: 700;
                                            color: #1a1a2e;
                                            text-align: center;
                                            width: 10%;
                                        }
                                        .prime-value-amount {
                                            font-weight: 800;
                                            font-size: 12px;
                                            color: #1a1a2e;
                                        }
                                        .prime-section-title {
                                            font-size: 11px;
                                            font-weight: 700;
                                            color: #333;
                                            padding: 6px 0 4px 0;
                                            border-bottom: 1px solid #ccc;
                                            margin-bottom: 4px;
                                        }
                                    `}} />
                                )}
                                <div
                                    className={printType === "invoices" ? "" : "p-4"}
                                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Navigation & Actions */}
                    <div className="flex items-center justify-between p-6 border-t border-[var(--card-border)]">
                        {/* Navigation */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                                disabled={currentIndex === 0}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                    currentIndex === 0
                                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                        : "bg-[var(--background)] border border-[var(--card-border)] hover:bg-[var(--card-border)]"
                                )}
                            >
                                {t("printing.preview_prev")}
                            </button>

                            {/* Order Pills */}
                            <div className="flex items-center gap-1 px-2">
                                {orders.slice(0, 5).map((_, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentIndex(idx)}
                                        className={cn(
                                            "w-2 h-2 rounded-full transition-all",
                                            idx === currentIndex
                                                ? "bg-[var(--ink)] w-6"
                                                : "bg-[var(--card-border)] hover:bg-[var(--foreground-muted)]"
                                        )}
                                    />
                                ))}
                                {orders.length > 5 && (
                                    <span className="text-xs text-muted ml-1">+{orders.length - 5}</span>
                                )}
                            </div>

                            <button
                                onClick={() => setCurrentIndex(Math.min(orders.length - 1, currentIndex + 1))}
                                disabled={currentIndex === orders.length - 1}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                                    currentIndex === orders.length - 1
                                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                        : "bg-[var(--background)] border border-[var(--card-border)] hover:bg-[var(--card-border)]"
                                )}
                            >
                                {t("printing.preview_next")}
                            </button>
                        </div>

                        {/* Print Action */}
                        <button
                            onClick={() => {
                                onPrint();
                                onClose();
                            }}
                            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[var(--ink)] text-white font-semibold hover:scale-[1.02] transition-all shadow-lg"
                        >
                            <Printer className="w-5 h-5" />
                            {t(printType === "labels" ? "printing.preview_printLabels" : "printing.preview_printInvoices").replace("{count}", String(orders.length))}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
