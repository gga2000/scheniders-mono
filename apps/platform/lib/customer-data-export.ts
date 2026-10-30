import type { Database } from "@scheniders/supabase/database.types";
import { supabase } from "@/lib/supabase";
import { mergeOrderItems } from "@/lib/merge-order-items";
import { normalizePhoneForSearch } from "@/lib/order-utils";

type OrderHistoryRow = Database["public"]["Functions"]["get_customer_order_history"]["Returns"][number];
type ReliabilityRow = Database["public"]["Functions"]["get_customer_reliability"]["Returns"][number];
type ExportItem = { name: string; quantity: number; price: number };

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
        const normalizedPhone = normalizePhoneForSearch(phone);
        const exportedAt = new Date().toISOString();

        // The same reads as the profile page: this customer's own live orders
        // in the active store (any stored phone shape; deleted, archived and
        // test orders left out) and the page's totals. Orders where this
        // number is only another buyer's alternate phone are not theirs.
        const [historyRes, reliabilityRes] = await Promise.all([
            supabase.rpc("get_customer_order_history", { p_phone: normalizedPhone })
                .order("created_at", { ascending: false }),
            supabase.rpc("get_customer_reliability", { p_phone: normalizedPhone }),
        ]);
        if (historyRes.error) throw historyRes.error;
        if (reliabilityRes.error) throw reliabilityRes.error;
        const orders = (historyRes.data ?? []) as OrderHistoryRow[];
        const reliability = ((reliabilityRes.data ?? []) as ReliabilityRow[])[0];

        // Check blacklist status
        const { data: blacklistEntry } = await supabase
            .from("blacklist")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("phone", normalizedPhone)
            .maybeSingle();

        // Fetch activity log entries for this customer's orders
        const orderIds = orders.map(o => o.id);
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

        // Profile from the most recent purchase (not a refund or replacement row).
        const purchases = orders.filter((o) => !o.is_return);
        const latestOrder = purchases[0] ?? orders[0];
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

        const summary = {
            totalOrders: Number(reliability?.total_orders ?? 0),
            totalSpent: Number(reliability?.total_spent ?? 0),
            firstOrderDate: purchases[purchases.length - 1]?.created_at ?? null,
            lastOrderDate: purchases[0]?.created_at ?? null,
            deliveredCount: Number(reliability?.completed_count ?? 0),
            cancelledCount: Number(reliability?.cancelled_count ?? 0),
        };

        // Format orders for export
        const formattedOrders: OrderExport[] = orders.map(o => ({
            orderId: o.order_id,
            createdAt: o.created_at,
            status: o.status,
            // `items` is a jsonb array of order lines.
            items: mergeOrderItems((Array.isArray(o.items) ? o.items : []) as ExportItem[]).map((item) => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
            })),
            total: orderTotal(o),
            city: o.city || "",
            address: o.address_details,
            notes: o.notes ?? undefined,
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
        const normalizedPhone = normalizePhoneForSearch(phone);

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
}

// Singleton instance
export const customerDataExport = new CustomerDataExportService();
