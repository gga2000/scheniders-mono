"use client";

import { useState, useMemo } from "react";
import { useOrders } from "@/hooks/use-orders";
import { Order } from "@/lib/supabase";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/layout/page-transition";
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
} from "lucide-react";
import { formatIQD, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export default function PrintingPage() {
    const { orders, loading, error, updateOrderStatus } = useOrders();
    const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
    const [printType, setPrintType] = useState<"labels" | "invoices">("labels");

    // Only show confirmed orders ready for printing
    const printableOrders = useMemo(() => {
        return orders.filter((order) => order.status === "confirmed");
    }, [orders]);

    const toggleOrderSelection = (orderId: string) => {
        const newSelected = new Set(selectedOrders);
        if (newSelected.has(orderId)) {
            newSelected.delete(orderId);
        } else {
            newSelected.add(orderId);
        }
        setSelectedOrders(newSelected);
    };

    const selectAll = () => {
        if (selectedOrders.size === printableOrders.length) {
            setSelectedOrders(new Set());
        } else {
            setSelectedOrders(new Set(printableOrders.map((o) => o.id)));
        }
    };

    const handlePrint = () => {
        const ordersToPrint = printableOrders.filter((o) => selectedOrders.has(o.id));

        // Create a new window for printing
        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        const content = printType === "labels"
            ? generateLabelsHTML(ordersToPrint)
            : generateInvoicesHTML(ordersToPrint);

        printWindow.document.write(content);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    };

    const handleMarkAsDelivered = async () => {
        for (const orderId of selectedOrders) {
            await updateOrderStatus(orderId, "delivered");
        }
        setSelectedOrders(new Set());
    };

    const generateLabelsHTML = (orders: Order[]) => {
        return `
            <!DOCTYPE html>
            <html dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>Shipping Labels</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Tahoma, sans-serif; }
                    .label {
                        width: 4in;
                        height: 6in;
                        border: 2px solid #333;
                        padding: 20px;
                        margin: 10px auto;
                        page-break-after: always;
                    }
                    .label:last-child { page-break-after: avoid; }
                    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 15px; }
                    .header h1 { font-size: 24px; }
                    .order-id { font-size: 28px; font-weight: bold; margin: 15px 0; text-align: center; }
                    .customer-name { font-size: 22px; font-weight: bold; margin: 10px 0; }
                    .phone { font-size: 20px; font-family: monospace; margin: 10px 0; direction: ltr; text-align: right; }
                    .address { font-size: 16px; margin: 15px 0; padding: 10px; background: #f5f5f5; border-radius: 5px; }
                    .items { margin: 15px 0; }
                    .item { padding: 5px 0; border-bottom: 1px dashed #ccc; }
                    .total { font-size: 24px; font-weight: bold; text-align: center; margin-top: 20px; padding: 15px; background: #333; color: white; border-radius: 5px; }
                    @media print {
                        .label { margin: 0; border: 2px solid #333; }
                    }
                </style>
            </head>
            <body>
                ${orders.map((order) => `
                    <div class="label">
                        <div class="header">
                            <h1>🧴 Schneiders</h1>
                        </div>
                        <div class="order-id">#${order.order_id}</div>
                        <div class="customer-name">${order.customer_name}</div>
                        <div class="phone">📞 ${order.phone}</div>
                        <div class="address">
                            <strong>📍 العنوان:</strong><br>
                            ${order.city || ""} ${order.governorate_code ? `(${order.governorate_code})` : ""}<br>
                            ${order.address_details || ""}
                        </div>
                        <div class="items">
                            ${order.items?.map((item) => `
                                <div class="item">${item.name} × ${item.quantity}</div>
                            `).join("") || ""}
                        </div>
                        <div class="total">
                            💰 ${formatIQD(Number(order.price))}
                        </div>
                    </div>
                `).join("")}
            </body>
            </html>
        `;
    };

    const generateInvoicesHTML = (orders: Order[]) => {
        return `
            <!DOCTYPE html>
            <html dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>Invoices</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Tahoma, sans-serif; }
                    .invoice {
                        max-width: 8in;
                        margin: 20px auto;
                        padding: 30px;
                        border: 1px solid #ddd;
                        page-break-after: always;
                    }
                    .invoice:last-child { page-break-after: avoid; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
                    .logo { font-size: 28px; font-weight: bold; }
                    .invoice-info { text-align: left; }
                    .invoice-number { font-size: 14px; color: #666; }
                    .date { font-size: 12px; color: #999; }
                    .customer-section { display: flex; justify-content: space-between; margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 8px; }
                    .customer-info h3 { margin-bottom: 10px; }
                    .customer-info p { margin: 5px 0; color: #666; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { padding: 12px; text-align: right; border-bottom: 1px solid #eee; }
                    th { background: #f5f5f5; font-weight: bold; }
                    .total-row { font-size: 18px; font-weight: bold; background: #333; color: white; }
                    .total-row td { padding: 15px; }
                    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px; }
                </style>
            </head>
            <body>
                ${orders.map((order) => `
                    <div class="invoice">
                        <div class="header">
                            <div class="logo">🧴 Schneiders</div>
                            <div class="invoice-info">
                                <div class="invoice-number">فاتورة #${order.order_id}</div>
                                <div class="date">${formatDate(order.created_at)}</div>
                            </div>
                        </div>
                        
                        <div class="customer-section">
                            <div class="customer-info">
                                <h3>معلومات العميل</h3>
                                <p><strong>${order.customer_name}</strong></p>
                                <p>📞 ${order.phone}</p>
                            </div>
                            <div class="customer-info">
                                <h3>عنوان الشحن</h3>
                                <p>${order.city || "-"} ${order.governorate_code ? `(${order.governorate_code})` : ""}</p>
                                <p>${order.address_details || "-"}</p>
                            </div>
                        </div>
                        
                        <table>
                            <thead>
                                <tr>
                                    <th>المنتج</th>
                                    <th>الكمية</th>
                                    <th>السعر</th>
                                    <th>المجموع</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${order.items?.map((item) => `
                                    <tr>
                                        <td>${item.name}</td>
                                        <td>${item.quantity}</td>
                                        <td>${formatIQD(item.price)}</td>
                                        <td>${formatIQD(item.price * item.quantity)}</td>
                                    </tr>
                                `).join("") || "<tr><td colspan='4'>لا توجد عناصر</td></tr>"}
                            </tbody>
                            <tfoot>
                                <tr class="total-row">
                                    <td colspan="3">المجموع الكلي</td>
                                    <td>${formatIQD(Number(order.price))}</td>
                                </tr>
                            </tfoot>
                        </table>
                        
                        <div class="footer">
                            <p>شكراً لتسوقكم معنا! 💜</p>
                            <p>Schneiders Perfumes</p>
                        </div>
                    </div>
                `).join("")}
            </body>
            </html>
        `;
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4 border-[var(--pastel-yellow)] border-t-transparent animate-spin"></div>
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
                        className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6"
                    >
                        <div>
                            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight flex items-center gap-3">
                                <Printer className="w-8 h-8" />
                                Print Queue
                            </h1>
                            <p className="text-muted mt-2 text-lg">
                                {printableOrders.length} confirmed orders ready to print
                            </p>
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

                            {/* Action Buttons */}
                            <AnimatePresence>
                                {selectedOrders.size > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        className="flex items-center gap-2"
                                    >
                                        <button
                                            onClick={handlePrint}
                                            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[var(--foreground)] text-white shadow-lg hover:scale-[1.02] transition-all font-semibold"
                                        >
                                            <Printer className="h-5 w-5" />
                                            Print {selectedOrders.size}
                                        </button>
                                        <button
                                            onClick={handleMarkAsDelivered}
                                            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[var(--pastel-mint)] text-teal-900 hover:bg-[var(--pastel-mint-dark)] transition-all font-medium"
                                        >
                                            <Truck className="h-5 w-5" />
                                            Mark Delivered
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    {/* Print Queue List */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2 }}
                        className="space-y-3"
                    >
                        {/* Select All Row */}
                        {printableOrders.length > 0 && (
                            <div className="flex items-center gap-3 px-2">
                                <button
                                    onClick={selectAll}
                                    className={cn(
                                        "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                                        selectedOrders.size === printableOrders.length
                                            ? "bg-[var(--foreground)] border-[var(--foreground)] text-white"
                                            : "border-[var(--card-border)] hover:border-[var(--foreground-muted)]"
                                    )}
                                >
                                    {selectedOrders.size === printableOrders.length && (
                                        <CheckSquare className="w-4 h-4" />
                                    )}
                                </button>
                                <span className="text-sm text-muted">
                                    Select all ({printableOrders.length} orders)
                                </span>
                            </div>
                        )}

                        <StaggerContainer className="space-y-3">
                            {printableOrders.length === 0 ? (
                                <div className="pastel-card p-12 text-center">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--pastel-green)] flex items-center justify-center">
                                        <CheckCircle className="h-8 w-8 text-green-700" />
                                    </div>
                                    <p className="text-lg font-medium text-foreground mb-1">No orders to print</p>
                                    <p className="text-sm text-muted">Confirmed orders will appear here for printing</p>
                                </div>
                            ) : (
                                printableOrders.map((order) => (
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
                                                <div className={cn(
                                                    "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0",
                                                    selectedOrders.has(order.id)
                                                        ? "bg-[var(--foreground)] border-[var(--foreground)] text-white"
                                                        : "border-[var(--card-border)]"
                                                )}>
                                                    {selectedOrders.has(order.id) ? (
                                                        <CheckSquare className="w-4 h-4" />
                                                    ) : (
                                                        <Square className="w-4 h-4 text-transparent" />
                                                    )}
                                                </div>

                                                {/* Order ID Badge */}
                                                <div className="w-20 h-12 rounded-xl bg-[var(--pastel-green)] flex items-center justify-center flex-shrink-0">
                                                    <span className="font-mono font-bold text-green-900 text-sm">
                                                        #{order.order_id}
                                                    </span>
                                                </div>

                                                {/* Customer Info */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-foreground truncate">
                                                        {order.customer_name}
                                                    </p>
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
                                                        {order.items?.slice(0, 2).map((item, idx) => (
                                                            <span key={idx} className="px-2 py-1 bg-[var(--background)] rounded-lg text-sm">
                                                                {item.name} ×{item.quantity}
                                                            </span>
                                                        ))}
                                                        {(order.items?.length || 0) > 2 && (
                                                            <span className="text-xs text-muted self-center">
                                                                +{(order.items?.length || 0) - 2} more
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Price */}
                                                <div className="text-right min-w-[100px]">
                                                    <p className="text-lg font-bold text-foreground">
                                                        {formatIQD(Number(order.price))}
                                                    </p>
                                                    <p className="text-xs text-muted">
                                                        {formatDate(order.created_at)}
                                                    </p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </StaggerItem>
                                ))
                            )}
                        </StaggerContainer>
                    </motion.div>
                </div>
            </div>
        </PageTransition>
    );
}
