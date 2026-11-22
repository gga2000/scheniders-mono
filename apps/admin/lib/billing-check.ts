import { z } from "zod";
import type { createAdminClient } from "@/lib/admin-supabase";
import { CUSTOMER_SHOP_EMBEDDED } from "@/lib/customer-shops";
import { everyRow } from "@/lib/every-row";

const HOUR_MS = 60 * 60 * 1000;

/**
 * The renewal job (the platform's /api/cron/subscription-renew) runs once a
 * day at 03:00 UTC. renew_subscription_core's carry-on window is the same day
 * (a month renewed less than a day after its end continues from that end);
 * lib/billing-check.test.ts holds the two together against the newest SQL.
 */
export const RENEWAL_RUN_EVERY_MS = 24 * HOUR_MS;

/**
 * An end the job should have reached is at most a run's period old when it
 * runs. A month or trial still open an hour after that (the run's own slack)
 * was missed.
 */
const MISSED_AFTER_MS = RENEWAL_RUN_EVERY_MS + HOUR_MS;

/**
 * lift_ended_pauses (:21) lifts a pause whose end has passed within the hour.
 * The platform's own lift of an ended pause (on a storefront visit) writes no
 * log row, so a timed pause counts as lifted an hour after its end.
 */
const LIFT_WITHIN_MS = HOUR_MS;

/** Ali's own store is never billed, by its own plan or its subscription's. */
const EXEMPT_PLAN = "internal";

/** Statuses the job answers on_hold for: it reaches the month and leaves it open. */
const STOPPED = new Set(["limited", "suspended", "cancelled"]);
const RUNNING = new Set(["trial", "active"]);

export type MissedBilling = { tenant_id: string; business_name: string | null; due: string };

const logRowSchema = z.object({
  tenant_id: z.string(),
  action: z.enum(["pause_tenant", "unpause_tenant", "status_change"]),
  created_at: z.string(),
  details: z
    .object({
      status: z.string().nullish(),
      previous_status: z.string().nullish(),
      restrictions: z.object({ paused_until: z.string().nullish() }).nullish(),
    })
    .nullable(),
});
type LogRow = z.infer<typeof logRowSchema>;

/**
 * When each shop last came back from a pause or a hold, from the staff log:
 * a lift (unpause_tenant, staff's or the hourly job's), a hold or a cancel
 * undone (status_change back to trial or active), or a timed pause's end when
 * no lift row came before it (the platform's lift writes none).
 */
function lastBackAt(rows: LogRow[], nowMs: number): Map<string, number> {
  const back = new Map<string, number>();
  const note = (tenant: string, at: number) => {
    if (Number.isFinite(at) && at <= nowMs) back.set(tenant, Math.max(back.get(tenant) ?? at, at));
  };
  for (const row of rows) {
    const at = Date.parse(row.created_at);
    if (row.action === "unpause_tenant") note(row.tenant_id, at);
    if (
      row.action === "status_change" &&
      STOPPED.has(row.details?.previous_status ?? "") &&
      RUNNING.has(row.details?.status ?? "")
    ) {
      note(row.tenant_id, at);
    }
    const until = Date.parse(row.details?.restrictions?.paused_until ?? "");
    if (row.action !== "pause_tenant" || !Number.isFinite(until) || until > nowMs) continue;
    const liftedEarly = rows.some(
      (lift) =>
        lift.tenant_id === row.tenant_id &&
        lift.action === "unpause_tenant" &&
        Date.parse(lift.created_at) >= at &&
        Date.parse(lift.created_at) <= until,
    );
    if (!liftedEarly) note(row.tenant_id, Math.min(until + LIFT_WITHIN_MS, nowMs));
  }
  return back;
}

/**
 * Shops the daily renewal job should have handled and did not. The job takes
 * every subscription still trialing or active after its end, on a shop that
 * is open (trial or active) and not on the internal plan, and either bills
 * the next month, or marks it past_due, which locks the shop (also when staff
 * turned renewal off). So one still trialing or active 25 hours after its end
 * is one the job never reached: a run Vercel skipped, or one cut off before
 * its loop got there. Since #1533 such a month starts again only when it is
 * paid, so the Paying page and the weekly count drop the shop meanwhile.
 *
 * A month that ended while the shop was paused or on hold is reached on
 * purpose: the job answers on_hold and leaves it open until the first run
 * after the shop comes back. So the 25 hours count from the later of the end
 * and the shop's return (round 21, structure new 4, data new 5).
 *
 * An unpaid ended trial is not here: the job made it past_due and the shop
 * keeps "trial", locked on purpose. The demo store and a lead's store stay
 * out, as everywhere in the console.
 *
 * Read by the staff bell (/api/billing-check) and sent to Sentry by the
 * scheduled check (/api/cron/hourly-jobs). A failed read throws.
 */
export async function checkBilling(
  supabase: ReturnType<typeof createAdminClient>,
  nowMs: number,
): Promise<{ trialsNotBilled: MissedBilling[]; renewalsMissed: MissedBilling[] }> {
  const cutoffMs = nowMs - MISSED_AFTER_MS;
  const cutoff = new Date(cutoffMs).toISOString();

  // Every overdue subscription with its shop, a page at a time.
  const overdue = await everyRow((from, to) =>
    supabase
      .from("subscriptions")
      .select("id, tenant_id, status, current_period_end, tenants!inner(business_name, status, plan)")
      .in("status", ["trialing", "active"])
      .neq("plan", EXEMPT_PLAN)
      .lte("current_period_end", cutoff)
      .in("tenants.status", ["trial", "active"])
      .neq("tenants.plan", EXEMPT_PLAN)
      .match(CUSTOMER_SHOP_EMBEDDED)
      .order("id", { ascending: true })
      .range(from, to),
  );

  // Their pauses, lifts and holds undone. Usually no shop is overdue, and then nothing is read.
  const ids = [...new Set(overdue.map((s) => s.tenant_id))];
  const logs =
    ids.length === 0
      ? []
      : await everyRow((from, to) =>
          supabase
            .from("admin_activity_logs")
            .select("id, tenant_id, action, created_at, details")
            .in("tenant_id", ids)
            .in("action", ["pause_tenant", "unpause_tenant", "status_change"])
            .order("id", { ascending: true })
            .range(from, to),
        );
  const backAt = lastBackAt(z.array(logRowSchema).parse(logs), nowMs);

  const missed = (status: string): MissedBilling[] =>
    overdue
      .filter((s) => s.status === status && (backAt.get(s.tenant_id) ?? -Infinity) <= cutoffMs)
      .map((s) => {
        const shop = Array.isArray(s.tenants) ? s.tenants[0] : s.tenants;
        return { tenant_id: s.tenant_id, business_name: shop?.business_name ?? null, due: s.current_period_end };
      });

  return { trialsNotBilled: missed("trialing"), renewalsMissed: missed("active") };
}
