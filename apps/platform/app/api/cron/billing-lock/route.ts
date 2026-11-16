import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireCronAuth } from "@/lib/cron-auth";
import { CRON_MONITORS, withCronMonitor } from "@/lib/job-monitor";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** What settle_billing_lock returns (20261116014641_billing_lock_instead_of_suspend.sql). */
const settleResultSchema = z.object({
    success: z.boolean(),
    outcome: z.enum(["renewed", "plan_changed", "locked", "not_locked", "busy", "already_processed", "exempt", "on_hold", "error"]),
    error: z.string().optional(),
});

const dueSchema = z.array(z.object({ tenant_id: z.string().uuid() }));

/**
 * Cron: settle locked shops, hourly (handoff A1).
 *
 * A shop whose trial ended, or whose paid month could not be paid, is LOCKED,
 * never suspended. The lock is derived in the database (tenant_billing_lock),
 * so it holds the moment the date passes whether or not this job runs. This
 * job only tries to PAY: billing_lock_due lists locked shops that were never
 * billed (a trial that just ended) or that now have the month in the wallet,
 * and settle_billing_lock charges the month from the wallet and unlocks, or
 * leaves the lock with the subscription past_due. Each call is one
 * transaction with a per-period charge reference, so a retry never charges
 * twice. A wallet credit settles a shop at once; this job is the backstop.
 */
async function runScheduled(request: Request) {
    const denied = requireCronAuth(request);
    if (denied) return denied;

    const { data, error: dueError } = await supabaseAdmin().rpc("billing_lock_due");
    if (dueError) {
        console.error("[billing-lock] Error reading locked shops:", dueError);
        return NextResponse.json({ error: dueError.message }, { status: 500 });
    }
    const due = dueSchema.safeParse(data);
    if (!due.success) {
        console.error("[billing-lock] Unexpected billing_lock_due result", due.error.message);
        return NextResponse.json({ error: "Unexpected billing_lock_due result" }, { status: 500 });
    }

    const outcomes: Array<{ tenant_id: string; outcome: string; error?: string }> = [];
    for (const { tenant_id } of due.data) {
        const { data: result, error } = await supabaseAdmin().rpc("settle_billing_lock", {
            _tenant_id: tenant_id,
            _wait: true,
        });
        if (error) {
            outcomes.push({ tenant_id, outcome: "error", error: error.message });
            continue;
        }
        const parsed = settleResultSchema.safeParse(result);
        outcomes.push(
            parsed.success
                ? { tenant_id, outcome: parsed.data.outcome, error: parsed.data.error }
                : { tenant_id, outcome: "error", error: "Unexpected settle result" },
        );
    }

    const count = (o: string) => outcomes.filter((r) => r.outcome === o).length;
    const paid = count("renewed") + count("plan_changed");
    const errors = outcomes.filter((r) => r.outcome === "error");
    console.log(`[billing-lock] ${due.data.length} due: ${paid} paid, ${count("locked")} still locked, ${errors.length} error(s)`);
    if (errors.length > 0) console.error("[billing-lock] Errors:", errors);

    return NextResponse.json(
        { success: errors.length === 0, due: due.data.length, paid, locked: count("locked"), outcomes, ...(errors.length > 0 ? { error: errors[0].error } : {}) },
        { status: errors.length === 0 ? 200 : 500 },
    );
}

export const GET = withCronMonitor(CRON_MONITORS.billingLock, runScheduled);
