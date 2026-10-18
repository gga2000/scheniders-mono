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

/**
 * Build one audit row. Every writer goes through this so the column names live
 * in exactly one place — three call sites previously inserted `admin_id`, which
 * does not exist on the table, so no admin action was ever recorded.
 */
function buildRow(
  { adminUserId, adminLabel, actorEmail, action, details = {}, ipAddress, userAgent }: LogParams,
  tenantId: string | null
) {
  const { uuid, label } = normalizeAdminId(adminUserId);
  return {
    admin_user_id: uuid,
    admin_label: adminLabel ?? label ?? "system",
    actor_email: actorEmail ?? null,
    tenant_id: tenantId,
    action,
    details,
    ip_address: ipAddress ?? null,
    user_agent: userAgent ?? null,
  };
}

export async function logAdminActivity(params: LogParams) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("admin_activity_logs")
    .insert(buildRow(params, params.tenantId ?? null));

  if (error) {
    console.error("[Admin Activity Logger] Failed to log:", error);
  }
}

/**
 * Log one row per tenant for a bulk action, in a single insert. The envelope
 * (actor, action, details) is shared; only `tenant_id` varies.
 */
export async function logAdminActivityBatch(
  params: Omit<LogParams, "tenantId"> & { tenantIds: string[] }
) {
  const { tenantIds, ...envelope } = params;
  if (tenantIds.length === 0) return;

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("admin_activity_logs")
    .insert(tenantIds.map((tenantId) => buildRow(envelope, tenantId)));

  if (error) {
    console.error("[Admin Activity Logger] Failed to log batch:", error);
  }
}
