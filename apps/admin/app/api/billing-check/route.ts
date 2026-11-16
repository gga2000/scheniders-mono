import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";
import { everyRow } from "@/lib/every-row";

/**
 * The renewal job runs once a day (03:00 UTC), so a paid month or a trial
 * more than 26 hours past its end was missed by it.
 */
const MISSED_AFTER_MS = 26 * 60 * 60 * 1000;

/** Ali's own store is never billed. */
const EXEMPT_PLAN = "internal";

interface Missed {
  tenant_id: string;
  business_name: string | null;
  due: string;
}

/**
 * GET /api/billing-check: shops the daily renewal job should have handled and
 * did not. The job takes every subscription whose period has ended, on a shop
 * that is open (trial or active) and not on the internal plan, and either
 * bills the next month or marks it past_due, which locks the shop. So a
 * subscription still `trialing` or `active` more than 26 hours after its end
 * is one the job never reached. Empty lists mean billing is running.
 *
 * An unpaid ended trial is not on this list: it is locked by rule (handoff
 * A1) and keeps status "trial". This route used to call every one of them a
 * missed job, so the bell's red row would have stayed on for good.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const cutoff = new Date(Date.now() - MISSED_AFTER_MS).toISOString();

    // Every overdue subscription with its shop, a page at a time.
    const overdue = await everyRow((from, to) =>
      supabase
        .from("subscriptions")
        .select("id, tenant_id, status, current_period_end, tenants!inner(business_name, status, plan)")
        .in("status", ["trialing", "active"])
        .neq("plan", EXEMPT_PLAN)
        .lt("current_period_end", cutoff)
        .in("tenants.status", ["trial", "active"])
        .neq("tenants.plan", EXEMPT_PLAN)
        .order("id", { ascending: true })
        .range(from, to),
    );

    const missed = (status: string): Missed[] =>
      overdue
        .filter((s) => s.status === status)
        .map((s) => {
          const shop = Array.isArray(s.tenants) ? s.tenants[0] : s.tenants;
          return { tenant_id: s.tenant_id, business_name: shop?.business_name ?? null, due: s.current_period_end };
        });

    return NextResponse.json({ trialsNotBilled: missed("trialing"), renewalsMissed: missed("active") });
  } catch (error) {
    console.error("Billing check API error:", error);
    return NextResponse.json({ error: "Failed to check billing" }, { status: 500 });
  }
}
