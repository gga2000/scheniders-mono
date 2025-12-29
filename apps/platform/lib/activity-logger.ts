import { supabase } from "@/lib/supabase";

// =============================================
// TYPES
// =============================================

export type ActivityAction =
    | "order.create"
    | "order.status_change"
    | "order.edit"
    | "order.delete"
    | "order.assign"
    | "order.print"
    | "product.create"
    | "product.edit"
    | "product.delete"
    | "customer.blacklist"
    | "customer.unblacklist"
    | "settings.update"
    | "user.login"
    | "user.logout"
    | "user.create"
    | "user.role_change";

export interface ActivityLogEntry {
    id: string;
    user_id: string | null;
    user_email: string | null;
    action: ActivityAction;
    entity_type: string | null;
    entity_id: string | null;
    details: Record<string, unknown>;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
}

export interface LogActivityParams {
    action: ActivityAction;
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
}

// =============================================
// ACTIVITY LOGGER
// =============================================

class ActivityLogger {
    private getUserAgent(): string | null {
        if (typeof window !== "undefined") {
            return window.navigator.userAgent;
        }
        return null;
    }

    /**
     * Log an activity to the database
     */
    async log(params: LogActivityParams): Promise<{ success: boolean; error?: string }> {
        try {
            const { data: session } = await supabase.auth.getSession();
            const userId = session?.session?.user?.id;
            const userEmail = session?.session?.user?.email;

            const { error } = await supabase.from("activity_log").insert({
                user_id: userId || null,
                user_email: userEmail || null,
                action: params.action,
                entity_type: params.entityType || null,
                entity_id: params.entityId || null,
                details: params.details || {},
                user_agent: this.getUserAgent(),
            });

            if (error) {
                console.error("[ActivityLogger] Error logging activity:", error);
                return { success: false, error: error.message };
            }

            return { success: true };
        } catch (err) {
            console.error("[ActivityLogger] Exception:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Unknown error",
            };
        }
    }

    /**
     * Log order status change
     */
    async logStatusChange(
        orderId: string,
        orderDisplayId: string,
        fromStatus: string,
        toStatus: string,
        reason?: string
    ) {
        return this.log({
            action: "order.status_change",
            entityType: "order",
            entityId: orderId,
            details: {
                order_id: orderDisplayId,
                from_status: fromStatus,
                to_status: toStatus,
                reason: reason || null,
            },
        });
    }

    /**
     * Log order creation
     */
    async logOrderCreate(orderId: string, orderDisplayId: string, source?: string) {
        return this.log({
            action: "order.create",
            entityType: "order",
            entityId: orderId,
            details: {
                order_id: orderDisplayId,
                source: source || "manual",
            },
        });
    }

    /**
     * Log order edit
     */
    async logOrderEdit(
        orderId: string,
        orderDisplayId: string,
        changes: Record<string, { from: unknown; to: unknown }>
    ) {
        return this.log({
            action: "order.edit",
            entityType: "order",
            entityId: orderId,
            details: {
                order_id: orderDisplayId,
                changes,
            },
        });
    }

    /**
     * Log order assignment
     */
    async logOrderAssign(
        orderId: string,
        orderDisplayId: string,
        assignedToId: string,
        assignedToName: string
    ) {
        return this.log({
            action: "order.assign",
            entityType: "order",
            entityId: orderId,
            details: {
                order_id: orderDisplayId,
                assigned_to_id: assignedToId,
                assigned_to_name: assignedToName,
            },
        });
    }

    /**
     * Log print action
     */
    async logPrint(orderIds: string[], orderDisplayIds: string[], batchId?: string) {
        return this.log({
            action: "order.print",
            entityType: "order",
            entityId: batchId || orderIds[0],
            details: {
                order_ids: orderDisplayIds,
                count: orderIds.length,
                batch_id: batchId,
            },
        });
    }

    /**
     * Log blacklist action
     */
    async logBlacklist(phone: string, reason: string) {
        return this.log({
            action: "customer.blacklist",
            entityType: "customer",
            entityId: phone,
            details: {
                phone,
                reason,
            },
        });
    }

    /**
     * Fetch activity logs with filtering
     */
    async getActivityLogs(options: {
        limit?: number;
        offset?: number;
        action?: ActivityAction;
        entityType?: string;
        entityId?: string;
        userId?: string;
        dateFrom?: string;
        dateTo?: string;
    }): Promise<{ data: ActivityLogEntry[]; count: number; error?: string }> {
        try {
            let query = supabase
                .from("activity_log")
                .select("*", { count: "exact" })
                .order("created_at", { ascending: false });

            if (options.action) {
                query = query.eq("action", options.action);
            }
            if (options.entityType) {
                query = query.eq("entity_type", options.entityType);
            }
            if (options.entityId) {
                query = query.eq("entity_id", options.entityId);
            }
            if (options.userId) {
                query = query.eq("user_id", options.userId);
            }
            if (options.dateFrom) {
                query = query.gte("created_at", options.dateFrom);
            }
            if (options.dateTo) {
                query = query.lte("created_at", options.dateTo);
            }

            // Apply pagination
            const limit = options.limit || 50;
            const offset = options.offset || 0;
            query = query.range(offset, offset + limit - 1);

            const { data, count, error } = await query;

            if (error) {
                return { data: [], count: 0, error: error.message };
            }

            return { data: data as ActivityLogEntry[], count: count || 0 };
        } catch (err) {
            return {
                data: [],
                count: 0,
                error: err instanceof Error ? err.message : "Unknown error",
            };
        }
    }
}

// Singleton instance
export const activityLogger = new ActivityLogger();
