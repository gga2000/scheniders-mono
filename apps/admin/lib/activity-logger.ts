import * as Sentry from "@sentry/nextjs";
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
  // "system" names an actor-less write only. A real admin (uuid and/or email)
  // must not be labelled "system": the Activity page shows admin_label before
  // actor_email, so the fallback would hide who did it.
  const hasActor = uuid !== null || Boolean(actorEmail);
  return {
    admin_user_id: uuid,
    admin_label: adminLabel ?? label ?? (hasActor ? null : "system"),
    actor_email: actorEmail ?? null,
    tenant_id: tenantId,
    action,
    details,
    ip_address: ipAddress ?? null,
    user_agent: userAgent ?? null,
  };
}

/**
 * A log row that was not written is reported, never thrown. The action it
 * records has already happened: an error here would answer 500 and invite a
 * second click on a top-up or an extension. Sentry gets the miss, so an action
 * with no trace does not pass in silence.
 */
function reportLogFailure(action: string, error: unknown) {
  console.error("[Admin Activity Logger] Failed to log:", error);
  const reason = error instanceof Error ? error.message : JSON.stringify(error);
  Sentry.captureException(new Error(`Admin audit log row not written for "${action}": ${reason}`));
}

/** Insert log rows; a refused insert and a failed request are both reported. */
async function writeRows(action: string, rows: ReturnType<typeof buildRow> | ReturnType<typeof buildRow>[]) {
  try {
    const { error } = await createAdminClient().from("admin_activity_logs").insert(rows);
    if (error) reportLogFailure(action, error);
  } catch (error) {
    reportLogFailure(action, error);
  }
}

export async function logAdminActivity(params: LogParams) {
  await writeRows(params.action, buildRow(params, params.tenantId ?? null));
}

/** The admin who made a request, as the route guards return it. */
type Actor = { user: { id: string; email?: string | null } };

/**
 * Log one action under the admin who made the request. Every changing route
 * calls this (app/api/route-audit-log.test.ts checks it), so the actor is
 * always the signed-in admin and never a value from the request body.
 */
export function logAdminAction(
  admin: Actor,
  action: string,
  entry: { tenantId?: string | null; details?: Record<string, unknown> } = {},
) {
  return logAdminActivity({
    adminUserId: admin.user.id,
    actorEmail: admin.user.email ?? null,
    tenantId: entry.tenantId ?? null,
    action,
    details: entry.details,
  });
}

/** How long the database keeps a send's id (support_staff_requests prunes after 2 days). */
const REQUEST_ID_KEPT_MS = 2 * 24 * 60 * 60 * 1000;

/** Whether this admin's row for this send is already on record. */
async function sendLogged(adminId: string, action: string, requestId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("admin_activity_logs")
    .select("id")
    .eq("admin_user_id", adminId)
    .eq("action", action)
    .eq("details->>request_id", requestId)
    .gte("created_at", new Date(Date.now() - REQUEST_ID_KEPT_MS).toISOString())
    .limit(1);
  // A check that could not answer writes the row: two rows for one send beat none.
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

/**
 * Log a send that carries a request id once per id (round 23). The row keeps
 * the id. A first send logs. A repeat (the database did nothing new) logs only
 * when no row for that id is on record, so a row the first send failed to write
 * is written on the retry instead of never.
 */
export async function logAdminActionOnce(
  admin: Actor,
  action: string,
  send: { requestId: string; repeat: boolean },
  entry: { tenantId?: string | null; details?: Record<string, unknown> } = {},
) {
  if (send.repeat && (await sendLogged(admin.user.id, action, send.requestId))) return;
  await logAdminAction(admin, action, { ...entry, details: { ...entry.details, request_id: send.requestId } });
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

  await writeRows(envelope.action, tenantIds.map((tenantId) => buildRow(envelope, tenantId)));
}
