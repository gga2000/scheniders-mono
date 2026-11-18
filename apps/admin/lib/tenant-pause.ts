import { HOURLY_RUN_MS } from "./hourly-jobs";

/** What pause_tenant and lift_pause_and_settle answer with: the shop as the call left it. */
export interface PausedShop {
  id: string;
  status: string;
  restrictions: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The one row the database function answers with, or null when it answered
 * with none: the shop does not exist, or (lifting) it is not paused.
 * Anything else is not an answer of these functions, and throws.
 */
export function pausedShop(rows: unknown): PausedShop | null {
  if (!Array.isArray(rows)) throw new Error("Unexpected answer from the pause function");
  if (rows.length === 0) return null;
  const [row] = rows;
  if (
    rows.length !== 1 ||
    !isRecord(row) ||
    typeof row.id !== "string" ||
    typeof row.status !== "string" ||
    !isRecord(row.restrictions)
  ) {
    throw new Error("Unexpected answer from the pause function");
  }
  return { id: row.id, status: row.status, restrictions: row.restrictions };
}

/**
 * lift_ended_pauses lifts every ended pause once an hour (pg_cron
 * lift-ended-pauses), so an ended pause is lifted within the hour. Later than
 * that, the hourly lift failed for this shop: it keeps the pause, the
 * database logs a warning and tries again each hour, the staff bell names the
 * shop, and a super admin lifts it by hand.
 */
export function pauseLiftOverdue(pausedUntil: string, nowMs: number): boolean {
  return nowMs - Date.parse(pausedUntil) > HOURLY_RUN_MS;
}
