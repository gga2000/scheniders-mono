import { createAdminClient } from "./admin-supabase";

interface LogParams {
  adminUserId: string | null;
  adminLabel?: string | null;
  actorEmail?: string | null;
  tenantId?: string | null;
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeAdminId(value: string | null): {
  uuid: string | null;
  label: string | null;
} {
  if (!value) return { uuid: null, label: null };
  if (UUID_RE.test(value)) return { uuid: value, label: null };
  return { uuid: null, label: value };
}

export async function logAdminActivity({
  adminUserId,
  adminLabel,
  actorEmail,
  tenantId,
  action,
  details = {},
  ipAddress,
  userAgent,
}: LogParams) {
  const supabase = createAdminClient();
  const { uuid, label } = normalizeAdminId(adminUserId);

  const { error } = await supabase.from("admin_activity_logs").insert({
    admin_user_id: uuid,
    admin_label: adminLabel ?? label ?? "system",
    actor_email: actorEmail ?? null,
    tenant_id: tenantId ?? null,
    action,
    details,
    ip_address: ipAddress ?? null,
    user_agent: userAgent ?? null,
  });

  if (error) {
    console.error("[Admin Activity Logger] Failed to log:", error);
  }
}
