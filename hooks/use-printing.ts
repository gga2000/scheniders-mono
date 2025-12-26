"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase, Order, OrderFilters } from "@/lib/supabase";

// =============================================
// TYPES
// =============================================

export interface PrintBatch {
    id: string;
    name: string;
    created_at: string;
    order_count: number;
    total_value: number;
    cities: string[];
    order_ids: string[];
    invoice_template?: string;
    print_type?: string;
    pdf_url?: string;
}

export interface PrintHistoryEntry {
    id: string;
    order_id: string;
    batch_id?: string;
    printed_at: string;
    print_type: "label" | "invoice";
    label_size?: string;
    printed_by?: string;
}

export interface LabelSettings {
    size: "4x6" | "3x2" | "a5" | "a6" | "compact";
    showQrCode: boolean;
    showBarcode: boolean;
    showPrice: boolean;
    isGift: boolean;
    showDeliveryLogo: boolean;
    showCompanyLogo: boolean;
    companyLogoUrl?: string;
    deliveryLogoUrl?: string;
}

export interface PrintingFilters extends OrderFilters {
    // Additional printing-specific filters
    isPrinted?: boolean;
    batchId?: string;
}

export interface PrintStats {
    todayPrinted: number;
    todayPending: number;
    totalPrinted: number;
    cityDistribution: Array<{ city: string; count: number; percentage: number }>;
}

// =============================================
// HOOK
// =============================================

export function usePrinting(orders: Order[]) {
    // State
    const [batches, setBatches] = useState<PrintBatch[]>([]);
    const [printHistory, setPrintHistory] = useState<PrintHistoryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState<PrintingFilters>({ status: "confirmed" });
    const [labelSettings, setLabelSettings] = useState<LabelSettings>({
        size: "4x6",
        showQrCode: true,
        showBarcode: true,
        showPrice: true,
        isGift: false,
        showDeliveryLogo: true,
        showCompanyLogo: true,
    });

    // Load company logo from localStorage on mount
    useEffect(() => {
        const savedLogo = localStorage.getItem("schneiders_company_logo");
        if (savedLogo) {
            setLabelSettings(prev => ({ ...prev, companyLogoUrl: savedLogo }));
        }
    }, []);

    // =============================================
    // FILTERING
    // =============================================

    const applyFilters = useCallback(
        (ordersToFilter: Order[]): Order[] => {
            return ordersToFilter.filter((order) => {
                // Only confirmed orders by default
                if (order.status !== "confirmed") return false;

                // Search query
                if (filters.searchQuery) {
                    const query = filters.searchQuery.toLowerCase();
                    const matchesName = order.customer_name.toLowerCase().includes(query);
                    const matchesPhone = order.phone.includes(query);
                    const matchesOrderId = order.order_id?.toLowerCase().includes(query);
                    if (!matchesName && !matchesPhone && !matchesOrderId) return false;
                }

                // City filter
                if (filters.city && order.city !== filters.city) return false;

                // Date range filter
                if (filters.dateFrom) {
                    const orderDate = new Date(order.created_at);
                    const fromDate = new Date(filters.dateFrom);
                    if (orderDate < fromDate) return false;
                }
                if (filters.dateTo) {
                    const orderDate = new Date(order.created_at);
                    const toDate = new Date(filters.dateTo);
                    toDate.setHours(23, 59, 59, 999);
                    if (orderDate > toDate) return false;
                }

                // Priority filter
                if (filters.priority && order.priority !== filters.priority) return false;

                // Printed filter
                if (filters.isPrinted !== undefined) {
                    const isPrinted = (order.print_count || 0) > 0;
                    if (filters.isPrinted !== isPrinted) return false;
                }

                return true;
            });
        },
        [filters]
    );

    // Filtered and sorted printable orders
    const printableOrders = useMemo(() => {
        const filtered = applyFilters(orders);

        // Sort: urgent/high priority first, then by date
        return filtered.sort((a, b) => {
            // Priority order: urgent > high > normal
            const priorityOrder = { urgent: 0, high: 1, normal: 2 };
            const aPriority = priorityOrder[a.priority || "normal"];
            const bPriority = priorityOrder[b.priority || "normal"];

            if (aPriority !== bPriority) return aPriority - bPriority;

            // Then by date (oldest first for FIFO processing)
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
    }, [orders, applyFilters]);

    // Get unique cities from printable orders
    const availableCities = useMemo(() => {
        return [...new Set(printableOrders.map((o) => o.city).filter(Boolean))] as string[];
    }, [printableOrders]);

    // =============================================
    // PRINT HISTORY
    // =============================================

    async function fetchPrintHistory() {
        try {
            const { data, error } = await supabase
                .from("print_history")
                .select("*")
                .order("printed_at", { ascending: false })
                .limit(100);

            if (error) throw error;
            setPrintHistory(data || []);
        } catch (err) {
            console.error("Error fetching print history:", err);
        }
    }

    async function recordPrint(
        orderIds: string[],
        printType: "label" | "invoice",
        batchId?: string,
        labelSize?: string
    ) {
        try {
            // Create history entries
            const entries = orderIds.map((orderId) => ({
                order_id: orderId,
                batch_id: batchId,
                print_type: printType,
                label_size: labelSize,
            }));

            const { error: historyError } = await supabase
                .from("print_history")
                .insert(entries);

            if (historyError) throw historyError;

            // Update orders with print count and timestamp
            for (const orderId of orderIds) {
                const order = orders.find((o) => o.id === orderId);
                const newCount = (order?.print_count || 0) + 1;

                await supabase
                    .from("orders")
                    .update({
                        printed_at: new Date().toISOString(),
                        print_count: newCount,
                        last_batch_id: batchId,
                    })
                    .eq("id", orderId);
            }

            return { success: true };
        } catch (err) {
            console.error("Error recording print:", err);
            return { success: false, error: err instanceof Error ? err.message : "Failed to record print" };
        }
    }

    function isReprintOrder(orderId: string): boolean {
        const order = orders.find((o) => o.id === orderId);
        return (order?.print_count || 0) > 0;
    }

    function getOrderPrintCount(orderId: string): number {
        const order = orders.find((o) => o.id === orderId);
        return order?.print_count || 0;
    }

    // =============================================
    // BATCH MANAGEMENT
    // =============================================

    async function fetchBatches() {
        try {
            const { data, error } = await supabase
                .from("print_batches")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(50);

            if (error) throw error;
            setBatches(data || []);
        } catch (err) {
            console.error("Error fetching batches:", err);
        }
    }

    async function createBatch(
        name: string,
        orderIds: string[],
        ordersData: Order[],
        invoiceTemplate: string = "prime",
        printType: string = "invoice"
    ): Promise<{ success: boolean; batch?: PrintBatch; error?: string }> {
        try {
            setLoading(true);

            const selectedOrders = ordersData.filter((o) => orderIds.includes(o.id));
            const totalValue = selectedOrders.reduce((sum, o) => sum + Number(o.price || 0), 0);
            const cities = [...new Set(selectedOrders.map((o) => o.city).filter(Boolean))] as string[];

            const { data, error } = await supabase
                .from("print_batches")
                .insert({
                    name,
                    order_count: orderIds.length,
                    total_value: totalValue,
                    cities,
                    order_ids: orderIds,
                    invoice_template: invoiceTemplate,
                    print_type: printType,
                })
                .select()
                .single();

            if (error) throw error;

            setBatches((prev) => [data, ...prev]);
            return { success: true, batch: data };
        } catch (err) {
            console.error("Error creating batch:", err);
            return { success: false, error: err instanceof Error ? err.message : "Failed to create batch" };
        } finally {
            setLoading(false);
        }
    }

    // Add orders to an existing batch
    async function addOrdersToBatch(
        batchId: string,
        newOrderIds: string[],
        ordersData: Order[]
    ): Promise<{ success: boolean; error?: string }> {
        try {
            // Get current batch
            const { data: batch, error: fetchError } = await supabase
                .from("print_batches")
                .select("*")
                .eq("id", batchId)
                .single();

            if (fetchError) throw fetchError;

            const updatedOrderIds = [...new Set([...(batch.order_ids || []), ...newOrderIds])];
            const allOrders = ordersData.filter((o) => updatedOrderIds.includes(o.id));
            const totalValue = allOrders.reduce((sum, o) => sum + Number(o.price || 0), 0);
            const cities = [...new Set(allOrders.map((o) => o.city).filter(Boolean))] as string[];

            const { error } = await supabase
                .from("print_batches")
                .update({
                    order_ids: updatedOrderIds,
                    order_count: updatedOrderIds.length,
                    total_value: totalValue,
                    cities,
                })
                .eq("id", batchId);

            if (error) throw error;

            // Refresh batches
            await fetchBatches();
            return { success: true };
        } catch (err) {
            console.error("Error adding orders to batch:", err);
            return { success: false, error: err instanceof Error ? err.message : "Failed to add orders" };
        }
    }

    // Remove orders from a batch
    async function removeOrdersFromBatch(
        batchId: string,
        orderIdsToRemove: string[],
        ordersData: Order[]
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const { data: batch, error: fetchError } = await supabase
                .from("print_batches")
                .select("*")
                .eq("id", batchId)
                .single();

            if (fetchError) throw fetchError;

            const updatedOrderIds = (batch.order_ids || []).filter(
                (id: string) => !orderIdsToRemove.includes(id)
            );
            const allOrders = ordersData.filter((o) => updatedOrderIds.includes(o.id));
            const totalValue = allOrders.reduce((sum, o) => sum + Number(o.price || 0), 0);
            const cities = [...new Set(allOrders.map((o) => o.city).filter(Boolean))] as string[];

            const { error } = await supabase
                .from("print_batches")
                .update({
                    order_ids: updatedOrderIds,
                    order_count: updatedOrderIds.length,
                    total_value: totalValue,
                    cities,
                })
                .eq("id", batchId);

            if (error) throw error;

            await fetchBatches();
            return { success: true };
        } catch (err) {
            console.error("Error removing orders from batch:", err);
            return { success: false, error: err instanceof Error ? err.message : "Failed to remove orders" };
        }
    }

    // Update batch name
    async function updateBatchName(
        batchId: string,
        newName: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase
                .from("print_batches")
                .update({ name: newName })
                .eq("id", batchId);

            if (error) throw error;

            setBatches((prev) =>
                prev.map((b) => (b.id === batchId ? { ...b, name: newName } : b))
            );
            return { success: true };
        } catch (err) {
            console.error("Error updating batch name:", err);
            return { success: false, error: err instanceof Error ? err.message : "Failed to update name" };
        }
    }

    // Delete a batch
    async function deleteBatch(batchId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase
                .from("print_batches")
                .delete()
                .eq("id", batchId);

            if (error) throw error;

            setBatches((prev) => prev.filter((b) => b.id !== batchId));
            return { success: true };
        } catch (err) {
            console.error("Error deleting batch:", err);
            return { success: false, error: err instanceof Error ? err.message : "Failed to delete batch" };
        }
    }

    // Get batch by ID with full details
    async function getBatchById(batchId: string): Promise<PrintBatch | null> {
        try {
            const { data, error } = await supabase
                .from("print_batches")
                .select("*")
                .eq("id", batchId)
                .single();

            if (error) throw error;
            return data;
        } catch (err) {
            console.error("Error fetching batch:", err);
            return null;
        }
    }

    // =============================================
    // CUSTOMER ORDER COUNT (for labels)
    // =============================================

    async function getCustomerOrderCount(phone: string): Promise<number> {
        try {
            const { count, error } = await supabase
                .from("orders")
                .select("*", { count: "exact", head: true })
                .eq("phone", phone)
                .in("status", ["confirmed", "delivered", "in_transit"]);

            if (error) throw error;
            return count || 1;
        } catch (err) {
            console.error("Error getting customer order count:", err);
            return 1;
        }
    }

    // =============================================
    // STATISTICS
    // =============================================

    const stats = useMemo((): PrintStats => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const confirmedOrders = orders.filter((o) => o.status === "confirmed");

        // Today's printed
        const todayPrinted = confirmedOrders.filter((o) => {
            if (!o.printed_at) return false;
            const printedDate = new Date(o.printed_at);
            return printedDate >= today;
        }).length;

        // Today's pending (confirmed but not printed today)
        const todayPending = confirmedOrders.filter((o) => {
            if (!o.printed_at) return true;
            const printedDate = new Date(o.printed_at);
            return printedDate < today;
        }).length;

        // Total printed
        const totalPrinted = orders.filter((o) => (o.print_count || 0) > 0).length;

        // City distribution
        const cityCount: Record<string, number> = {};
        confirmedOrders.forEach((o) => {
            const city = o.city || "Unknown";
            cityCount[city] = (cityCount[city] || 0) + 1;
        });

        const totalOrders = confirmedOrders.length || 1;
        const cityDistribution = Object.entries(cityCount)
            .map(([city, count]) => ({
                city,
                count,
                percentage: Math.round((count / totalOrders) * 100),
            }))
            .sort((a, b) => b.count - a.count);

        return {
            todayPrinted,
            todayPending,
            totalPrinted,
            cityDistribution,
        };
    }, [orders]);

    // =============================================
    // EXPORT
    // =============================================

    function exportToCSV(orderIds: string[], ordersData: Order[]) {
        const selectedOrders = ordersData.filter((o) => orderIds.includes(o.id));

        const headers = [
            "Order ID",
            "Customer Name",
            "Phone",
            "City",
            "Address",
            "Items",
            "Total",
            "Payment Status",
            "Created At",
        ];

        const rows = selectedOrders.map((order) => [
            order.order_id,
            order.customer_name,
            order.phone,
            order.city || "",
            order.address_details || "",
            order.items?.map((i) => `${i.name} x${i.quantity}`).join("; ") || "",
            order.price,
            order.payment_status,
            new Date(order.created_at).toLocaleDateString(),
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `print_queue_${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        return { success: true, count: selectedOrders.length };
    }

    function exportToExcel(orderIds: string[], ordersData: Order[]) {
        // For Excel, we use CSV with a different extension
        // A proper implementation would use xlsx library
        const selectedOrders = ordersData.filter((o) => orderIds.includes(o.id));

        const headers = [
            "Order ID",
            "Customer Name",
            "Phone",
            "City",
            "Address",
            "Items",
            "Total",
            "Payment Status",
            "Created At",
        ];

        const rows = selectedOrders.map((order) => [
            order.order_id,
            order.customer_name,
            order.phone,
            order.city || "",
            order.address_details || "",
            order.items?.map((i) => `${i.name} x${i.quantity}`).join("; ") || "",
            order.price,
            order.payment_status,
            new Date(order.created_at).toLocaleDateString(),
        ]);

        // Tab-separated for Excel compatibility
        const tsvContent = [
            headers.join("\t"),
            ...rows.map((row) => row.map((cell) => `${cell}`).join("\t")),
        ].join("\n");

        const blob = new Blob([tsvContent], { type: "application/vnd.ms-excel;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `print_queue_${new Date().toISOString().split("T")[0]}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        return { success: true, count: selectedOrders.length };
    }

    // =============================================
    // RETURN
    // =============================================

    return {
        // Filtered orders
        printableOrders,
        availableCities,

        // Filters
        filters,
        setFilters,
        clearFilters: () => setFilters({ status: "confirmed" }),

        // Label settings
        labelSettings,
        setLabelSettings,

        // Print history
        printHistory,
        fetchPrintHistory,
        recordPrint,
        isReprintOrder,
        getOrderPrintCount,

        // Batches
        batches,
        fetchBatches,
        createBatch,
        addOrdersToBatch,
        removeOrdersFromBatch,
        updateBatchName,
        deleteBatch,
        getBatchById,

        // Customer data
        getCustomerOrderCount,

        // Stats
        stats,

        // Export
        exportToCSV,
        exportToExcel,

        // State
        loading,
    };
}
