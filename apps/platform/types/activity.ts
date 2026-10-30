// =============================================
// ACTIVITY / AUDIT LOG TYPES
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
    | "user.role_change"
    | "mcp.tool_call";

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
