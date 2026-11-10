import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest } from "@/lib/api-auth";

/**
 * The daily billing jobs run once a day (renewals 03:00, trial pause 06:00
 * UTC), so anything more than 26 hours past its date was missed by a job.
 */
const MISSED_AFTER_MS = 26 * 60 * 60 * 1000;

/** Ali's own store is never billed or paused. */
const EXEMPT_PLAN = "internal";

interface Missed {
  tenant_id: string;
  business_name: string | null;
  due: string;
}

/**
 * GET /api/billing-check — shops the daily billing jobs should have handled
 * and did not: a trial that ended but the shop is still open, or a paid month
 * that ended without being renewed or marked unpaid. Empty lists mean billing
 * is running as it should. The admin bell shows a red row when either is not.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();
    const cutoff = new Date(Date.now() - MISSED_AFTER_MS).toISOString();

    const [trials, lapsed] = await Promise.all([
      supabase
        .from("tenants")
        .select("id, business_name, trial_ends_at")
        .eq("status", "trial")
        .neq("plan", EXEMPT_PLAN)
        .lt("trial_ends_at", cutoff)
        .limit(50),
      supabase
        .from("subscriptions")
        .select("tenant_id, current_period_end")
        .eq("status", "active")
        .lt("current_period_end", cutoff)
        .limit(200),
    ]);
    if (trials.error) throw trials.error;
    if (lapsed.error) throw lapsed.error;

    // A lapsed month only counts while the shop is still open on a billed plan.
    const lapsedRows = lapsed.data ?? [];
    let renewalsMissed: Missed[] = [];
    if (lapsedRows.length > 0) {
      const { data: open, error } = await supabase
        .from("tenants")
        .select("id, business_name")
        .in("id", lapsedRows.map((s) => s.tenant_id))
        .eq("status", "active")
        .neq("plan", EXEMPT_PLAN);
      if (error) throw error;
      const nameById = new Map((open ?? []).map((t) => [t.id, t.business_name]));
      renewalsMissed = lapsedRows
        .filter((s) => nameById.has(s.tenant_id))
        .map((s) => ({ tenant_id: s.tenant_id, business_name: nameById.get(s.tenant_id) ?? null, due: s.current_period_end }));
    }

    const trialsNotPaused: Missed[] = (trials.data ?? []).map((t) => ({
      tenant_id: t.id,
      business_name: t.business_name,
      due: t.trial_ends_at ?? "",
    }));
    return NextResponse.json({ trialsNotPaused, renewalsMissed });
  } catch (error) {
    console.error("Billing check API error:", error);
    return NextResponse.json({ error: "Failed to check billing" }, { status: 500 });
  }
}
