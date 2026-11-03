import type { Order } from "@/types/order";

/** Attribution and reason fields that ride along with a status change. */
export type StatusUpdateContext = {
    rejectionReason?: string;
    rejectionReasonId?: string;
    changedByName?: string;
    changedByAvatar?: string;
};

/**
 * The column set a status change writes: the status, its timestamps, the
 * rejection reason (cleared when moving to a non-rejecting status) and the
 * actor. Shared by the single-order and batched paths so they cannot drift.
 */
export function buildStatusUpdate(status: Order["status"], ctx: StatusUpdateContext): Partial<Order> {
    const updateData: Partial<Order> = { status };
    const loose = updateData as Record<string, unknown>;
    if (ctx.rejectionReason) {
        updateData.rejection_reason = ctx.rejectionReason;
    } else if (status !== "cancelled" && status !== "rejected") {
        loose.rejection_reason = null;
    }
    if (ctx.rejectionReasonId !== undefined) {
        loose.reason_id = ctx.rejectionReasonId || null;
    } else if (status !== "cancelled" && status !== "rejected") {
        loose.reason_id = null;
    }
    if (status === "delivered") updateData.delivered_at = new Date().toISOString();
    if (status === "cancelled") updateData.cancelled_at = new Date().toISOString();
    if (ctx.changedByName) updateData.last_status_changed_by_name = ctx.changedByName;
    if (ctx.changedByAvatar) updateData.last_status_changed_by_avatar = ctx.changedByAvatar;
    return updateData;
}
