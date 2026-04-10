import { createAdminClient } from "./admin-supabase";

interface LogParams {
  adminUserId: string;
  tenantId?: string;
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAdminActivity({
  adminUserId,
  tenantId,
  action,
  details = {},
  ipAddress,
}: LogParams) {
  const supabase = createAdminClient();

  const { error } = await supabase.from("admin_activity_logs").insert({
    admin_user_id: adminUserId,
    tenant_id: tenantId ?? null,
    action,
    details,
    ip_address: ipAddress ?? null,
  });

  if (error) {
    console.error("[Admin Activity Logger] Failed to log:", error);
  }
}
