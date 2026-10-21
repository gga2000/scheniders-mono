import { supabase } from "@/lib/supabase";
import { ORDER_READ_COLUMNS } from "@/lib/repositories/order-columns";
import { mergeOrderItems } from "@/lib/merge-order-items";

// =============================================
// TYPES
// =============================================

export interface CustomerDataExport {
    exportedAt: string;
    phone: string;
    profile: {
        name: string;
        phone: string;
        secondaryPhone?: string;
        email?: string;
        city?: string;
        address?: string;
    };
    orders: OrderExport[];
    summary: {
        totalOrders: number;
        totalSpent: number;
        firstOrderDate: string | null;
        lastOrderDate: string | null;
        deliveredCount: number;
        cancelledCount: number;
    };
    blacklistStatus: {
        isBlacklisted: boolean;
        reason?: string;
        addedAt?: string;
    };
    activityLog: ActivityExport[];
}

interface OrderExport {
    orderId: string;
    createdAt: string;
    status: string;
    items: {
        name: string;
        quantity: number;
        price: number;
    }[];
    total: number;
    city: string;
    address?: string;
    notes?: string;
    deliveredAt?: string;
    cancelledAt?: string;
}

interface ActivityExport {
    action: string;
    timestamp: string;
    details?: Record<string, unknown>;
}

/**
 * What the customer paid for one order: `price` is the item subtotal with the
 * discount already applied, delivery is separate (lib/order-money). `orders`
 * has no `total` column; reading one made every exported total 0.
 */
function orderTotal(order: { price: unknown; delivery_fee: unknown }): number {
    return (Number(order.price) || 0) + (Number(order.delivery_fee) || 0);
}

// =============================================
// CUSTOMER DATA EXPORT SERVICE
// =============================================

class CustomerDataExportService {
    /**
     * Export all of `tenantId`'s data for a customer (GDPR-style). A phone can
     * be a customer of several tenants; each tenant exports only its own.
     */
    async exportCustomerData(tenantId: string, phone: string): Promise<CustomerDataExport> {
        const normalizedPhone = this.normalizePhone(phone);
        const exportedAt = new Date().toISOString();

        // Fetch all orders for this customer
        const { data: orders, error: ordersError } = await supabase
            .from("orders")
            .select(ORDER_READ_COLUMNS)
            .eq("tenant_id", tenantId)
            .or(`phone.eq.${normalizedPhone},secondary_phone.eq.${normalizedPhone}`)
            .order("created_at", { ascending: false });

        if (ordersError) {
            console.error("Error fetching orders:", ordersError);
            throw new Error("Failed to fetch customer orders");
        }

        // Check blacklist status
        const { data: blacklistEntry } = await supabase
            .from("blacklist")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("phone", normalizedPhone)
            .maybeSingle();

        // Fetch activity log entries for this customer's orders
        const orderIds = orders?.map(o => o.id) || [];
        let activityLog: ActivityExport[] = [];

        if (orderIds.length > 0) {
            const { data: activities } = await supabase
                .from("activity_log")
                .select("*")
                .in("entity_id", orderIds)
                .order("created_at", { ascending: false })
                .limit(100);

            activityLog = (activities || []).map(a => ({
                action: a.action,
                timestamp: a.created_at,
                details: a.details,
            }));
        }

        // Build customer profile from most recent order
        const latestOrder = orders?.[0];
        const profile = {
            name: latestOrder?.customer_name || "Unknown",
            phone: normalizedPhone,
            secondaryPhone: latestOrder?.secondary_phone || undefined,
            // `orders` has no email column; the field stays empty rather than
            // pretending to read one.
            email: undefined,
            city: latestOrder?.city || undefined,
            address: latestOrder?.address_details || undefined,
        };

        // Calculate summary
        const deliveredOrders = orders?.filter(o => o.status === "delivered" || o.status === "completed") || [];
        const cancelledOrders = orders?.filter(o => o.status === "cancelled") || [];
        const totalSpent = deliveredOrders.reduce((sum, o) => sum + orderTotal(o), 0);

        const summary = {
            totalOrders: orders?.length || 0,
            totalSpent,
            firstOrderDate: orders?.[orders.length - 1]?.created_at || null,
            lastOrderDate: orders?.[0]?.created_at || null,
            deliveredCount: deliveredOrders.length,
            cancelledCount: cancelledOrders.length,
        };

        // Format orders for export
        const formattedOrders: OrderExport[] = (orders || []).map(o => ({
            orderId: o.order_id,
            createdAt: o.created_at,
            status: o.status,
            items: mergeOrderItems<{ name: string; quantity: number; price: number }>(o.items || []).map((item) => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
            })),
            total: orderTotal(o),
            city: o.city || "",
            address: o.address_details,
            notes: o.notes,
            deliveredAt: o.delivered_at,
            cancelledAt: o.cancelled_at,
        }));

        return {
            exportedAt,
            phone: normalizedPhone,
            profile,
            orders: formattedOrders,
            summary,
            blacklistStatus: {
                isBlacklisted: !!blacklistEntry,
                reason: blacklistEntry?.reason,
                addedAt: blacklistEntry?.created_at,
            },
            activityLog,
        };
    }

    /**
     * Generate downloadable JSON file
     */
    async downloadAsJSON(tenantId: string, phone: string): Promise<void> {
        const data = await this.exportCustomerData(tenantId, phone);
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `customer-data-${phone}-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Generate downloadable CSV file with orders
     */
    async downloadAsCSV(tenantId: string, phone: string): Promise<void> {
        const data = await this.exportCustomerData(tenantId, phone);

        // CSV header
        const headers = [
            "Order ID",
            "Date",
            "Status",
            "Items",
            "Total",
            "City",
            "Address",
            "Notes",
        ];

        // CSV rows
        const rows = data.orders.map(o => [
            o.orderId,
            new Date(o.createdAt).toLocaleDateString(),
            o.status,
            o.items.map(i => `${i.name} x${i.quantity}`).join("; "),
            o.total.toString(),
            o.city,
            o.address || "",
            o.notes || "",
        ]);

        // Build CSV content
        const csvContent = [
            headers.join(","),
            ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")),
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `customer-orders-${phone}-${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /**
     * Request customer data deletion (soft delete / anonymize)
     */
    async requestDeletion(phone: string): Promise<{ success: boolean; message: string }> {
        const normalizedPhone = this.normalizePhone(phone);

        try {
            // Log the deletion request
            await supabase.from("activity_log").insert({
                user_id: null,
                user_email: null,
                action: "customer.deletion_request",
                entity_type: "customer",
                entity_id: normalizedPhone,
                details: {
                    requested_at: new Date().toISOString(),
                    phone: normalizedPhone,
                },
            });

            // Note: Actual deletion should be handled by admin review
            // This just logs the request

            return {
                success: true,
                message: "تم تسجيل طلب حذف البيانات. سيتم مراجعته خلال 30 يوم.",
            };
        } catch (err) {
            console.error("Error requesting deletion:", err);
            return {
                success: false,
                message: "حدث خطأ أثناء تسجيل الطلب",
            };
        }
    }

    private normalizePhone(phone: string): string {
        let normalized = phone.replace(/\D/g, "");
        if (normalized.startsWith("964")) normalized = normalized.slice(3);
        if (normalized.startsWith("0")) normalized = normalized.slice(1);
        return normalized;
    }
}

// Singleton instance
export const customerDataExport = new CustomerDataExportService();
