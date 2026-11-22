import type { createAdminClient } from "@/lib/admin-supabase";
import { CUSTOMER_SHOP_EMBEDDED } from "@/lib/customer-shops";
import { everyRow } from "@/lib/every-row";

/**
 * The renewal job (the platform's /api/cron/subscription-renew) runs once a
 * day at 03:00 UTC, so an end it should have reached is at most a day old when
 * it runs. A month or trial still open 25 hours after its end was missed: an
 * hour of slack for the run itself.
 */
export const MISSED_AFTER_MS = 25 * 60 * 60 * 1000;

/** Ali's own store is never billed, by its own plan or its subscription's. */
const EXEMPT_PLAN = "internal";

export type MissedBilling = { tenant_id: string; business_name: string | null; due: string };

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
  const cutoff = new Date(nowMs - MISSED_AFTER_MS).toISOString();

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

  const missed = (status: string): MissedBilling[] =>
    overdue
      .filter((s) => s.status === status)
      .map((s) => {
        const shop = Array.isArray(s.tenants) ? s.tenants[0] : s.tenants;
        return { tenant_id: s.tenant_id, business_name: shop?.business_name ?? null, due: s.current_period_end };
      });

  return { trialsNotBilled: missed("trialing"), renewalsMissed: missed("active") };
}
