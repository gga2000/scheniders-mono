"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase, Order, OrderFilters, PrintBatch } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { exportOrdersToPrimeCSV, exportOrdersToWaseetXLSX, cleanPhoneForExport } from "@/lib/export-utils";
import { mergeOrderItems } from "@/lib/merge-order-items";

// =============================================
// TYPES
// =============================================

// PrintBatch interface moved to lib/supabase.ts

export interface LabelSettings {
    size: "4x6" | "3x2" | "a5" | "a6" | "compact" | "80x120";
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

// =============================================
// HOOK
// =============================================

export function usePrinting(orders: Order[]) {
    const { tenantId } = useAuth();
    // State
    const [batches, setBatches] = useState<PrintBatch[]>([]);
    const [loading, setLoading] = useState(false);
    // No date window by default: a confirmed order from yesterday still needs to ship.
    const [filters, setFilters] = useState<PrintingFilters>({ status: "confirmed" });
    const [labelSettings, setLabelSettings] = useState<LabelSettings>({
        size: "80x120",
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
                // Only confirmed orders (includes regular orders and refunds that are still confirmed)
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

                // Date range filter - use local timezone
                if (filters.dateFrom) {
                    const orderDate = new Date(order.created_at);
                    // Parse as local date at start of day (midnight local time)
                    const [year, month, day] = filters.dateFrom.split('-').map(Number);
                    const fromDate = new Date(year, month - 1, day, 0, 0, 0, 0);
                    if (orderDate < fromDate) return false;
                }
                if (filters.dateTo) {
                    const orderDate = new Date(order.created_at);
                    // Parse as local date at end of day (23:59:59.999 local time)
                    const [year, month, day] = filters.dateTo.split('-').map(Number);
                    const toDate = new Date(year, month - 1, day, 23, 59, 59, 999);
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

    /**
     * Record a print run in one transaction: history rows, print counters and the
     * batch row. The store comes from the session on the server, never from here.
     */
    async function recordPrint(
        orderIds: string[],
        printType: "label" | "invoice",
        labelSize: string,
        batchName: string,
        invoiceTemplate: string
    ): Promise<{ success: true; batchId: string } | { success: false; error: string }> {
        const { data, error } = await supabase.rpc("record_print_run", {
            p_order_ids: orderIds,
            p_print_type: printType,
            p_label_size: labelSize,
            p_batch_name: batchName,
            p_invoice_template: invoiceTemplate,
        });
        if (error || !data) {
            return { success: false, error: error?.message ?? "Print run was not recorded" };
        }
        await fetchBatches();
        return { success: true, batchId: data };
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
                    // RLS only admits rows stamped with one of the member's stores.
                    tenant_id: tenantId,
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
            mergeOrderItems(order.items).map((i) => `${i.name} x${i.quantity}`).join("; ") || "",
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

    // Helper to clean phone numbers for export (remove 964 prefix and leading 0s)
    // Now imported from shared utility

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
            cleanPhoneForExport(order.phone),
            order.city || "",
            order.address_details || "",
            mergeOrderItems(order.items).map((i) => `${i.name} x${i.quantity}`).join("; ") || "",
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

    /**
     * Export orders to Prime delivery company XLSX format
     * Matches the exact column structure of PrimeUploadSample.xlsx
     */
    /**
     * Export orders to Prime delivery company XLSX format
     * Matches the exact column structure of PrimeUploadSample.xlsx
     */
    async function exportToPrimeCSV(orderIds: string[], ordersData: Order[]) {
        return exportOrdersToPrimeCSV(orderIds, ordersData);
    }

    async function exportToWaseetCSV(orderIds: string[], ordersData: Order[]) {
        return exportOrdersToWaseetXLSX(orderIds, ordersData);
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

        // Export
        exportToCSV,
        exportToExcel,
        exportToPrimeCSV,
        exportToWaseetCSV,

        // State
        loading,
    };
}
