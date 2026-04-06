import { supabase } from "@/lib/supabase";
import type { ActivityAction, ActivityLogEntry, LogActivityParams } from "@/types/activity";

// Re-export types for backward compatibility
export type { ActivityAction, ActivityLogEntry, LogActivityParams };

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

    private async getCachedSession(): Promise<{ userId: string | null; userEmail: string | null }> {
        try {
            const { data: session } = await supabase.auth.getSession();
            const userId = session?.session?.user?.id;
            const userEmail = session?.session?.user?.email;

            return { userId: userId || null, userEmail: userEmail || null };
        } catch {
            return { userId: null, userEmail: null };
        }
    }

    /**
     * Log an activity to the database (fire-and-forget, non-blocking)
     */
    async log(params: LogActivityParams, tenantId?: string | null): Promise<{ success: boolean; error?: string }> {
        try {
            const { userId, userEmail } = await this.getCachedSession();

            // Skip logging if no user (can't satisfy NOT NULL constraint)
            if (!userId) {
                return { success: false, error: "No user session" };
            }

            const { error } = await supabase.from("activity_logs").insert({
                user_id: userId,
                user_email: userEmail,
                action: params.action,
                entity_type: params.entityType || null,
                entity_id: params.entityId || null,
                details: params.details || {},
                user_agent: this.getUserAgent(),
                tenant_id: tenantId ?? null,
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
     * Log order status change (fire-and-forget, non-blocking)
     */
    logStatusChange(
        orderId: string,
        orderDisplayId: string,
        fromStatus: string,
        toStatus: string,
        reason?: string,
        tenantId?: string | null
    ): void {
        this.log({
            action: "order.status_change",
            entityType: "order",
            entityId: orderId,
            details: {
                order_id: orderDisplayId,
                from_status: fromStatus,
                to_status: toStatus,
                reason: reason || null,
            },
        }, tenantId).catch(err => console.warn("[ActivityLogger] Background log failed:", err));
    }

    /**
     * Log order creation (fire-and-forget, non-blocking)
     */
    logOrderCreate(orderId: string, orderDisplayId: string, source?: string, tenantId?: string | null): void {
        this.log({
            action: "order.create",
            entityType: "order",
            entityId: orderId,
            details: {
                order_id: orderDisplayId,
                source: source || "manual",
            },
        }, tenantId).catch(err => console.warn("[ActivityLogger] Background log failed:", err));
    }

    /**
     * Log order edit (fire-and-forget, non-blocking)
     */
    logOrderEdit(
        orderId: string,
        orderDisplayId: string,
        changes: Record<string, { from: unknown; to: unknown }>,
        tenantId?: string | null
    ): void {
        this.log({
            action: "order.edit",
            entityType: "order",
            entityId: orderId,
            details: {
                order_id: orderDisplayId,
                changes,
            },
        }, tenantId).catch(err => console.warn("[ActivityLogger] Background log failed:", err));
    }

    /**
     * Log order assignment (fire-and-forget, non-blocking)
     */
    logOrderAssign(
        orderId: string,
        orderDisplayId: string,
        assignedToId: string,
        assignedToName: string,
        tenantId?: string | null
    ): void {
        this.log({
            action: "order.assign",
            entityType: "order",
            entityId: orderId,
            details: {
                order_id: orderDisplayId,
                assigned_to_id: assignedToId,
                assigned_to_name: assignedToName,
            },
        }, tenantId).catch(err => console.warn("[ActivityLogger] Background log failed:", err));
    }

    /**
     * Log print action (fire-and-forget, non-blocking)
     */
    logPrint(orderIds: string[], orderDisplayIds: string[], batchId?: string, tenantId?: string | null): void {
        this.log({
            action: "order.print",
            entityType: "order",
            entityId: batchId || orderIds[0],
            details: {
                order_ids: orderDisplayIds,
                count: orderIds.length,
                batch_id: batchId,
            },
        }, tenantId).catch(err => console.warn("[ActivityLogger] Background log failed:", err));
    }

    /**
     * Log blacklist action (fire-and-forget, non-blocking)
     */
    logBlacklist(phone: string, reason: string, tenantId?: string | null): void {
        this.log({
            action: "customer.blacklist",
            entityType: "customer",
            entityId: phone,
            details: {
                phone,
                reason,
            },
        }, tenantId).catch(err => console.warn("[ActivityLogger] Background log failed:", err));
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
                .from("activity_logs")
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
