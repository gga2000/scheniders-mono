import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireCronAuth } from "@/lib/cron-auth";
import { getPrimeClient } from "@/lib/prime/client";
import { syncPrimeTenant, type PrimeSyncOutcome } from "@/lib/prime/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/prime-sync — every 15 minutes (vercel.json).
 *
 * For each tenant with an active Prime link, reads the status of its open
 * shipments and applies it (lib/prime/sync). One tenant failing does not stop
 * the others; its error is kept on its prime_connections row.
 */
export async function GET(request: NextRequest) {
    const denied = requireCronAuth(request);
    if (denied) return denied;

    const client = getPrimeClient();
    if (!client) return NextResponse.json({ success: true, message: "Prime is not configured", tenants: 0 });

    const db = createSupabaseServiceClient();
    const { data: connections, error } = await db.from("prime_connections").select("tenant_id").eq("is_active", true);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (connections.length === 0) return NextResponse.json({ success: true, tenants: 0 });

    // Step names only label the stored step; a failed read must not stop the delivery sync.
    let stepNames = new Map<string, string>();
    try {
        stepNames = await client.stepNames();
    } catch (err) {
        Sentry.captureException(err, { extra: { job: "prime-sync", step: "stepNames" } });
    }
    const results: Record<string, PrimeSyncOutcome | { error: string }> = {};
    for (const { tenant_id: tenantId } of connections) {
        try {
            const outcome = await syncPrimeTenant(db, client, tenantId, stepNames);
            results[tenantId] = outcome;
            await stamp(db, tenantId, { last_synced_at: new Date().toISOString(), last_error: null });
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            Sentry.captureException(err, { extra: { tenantId, job: "prime-sync" } });
            results[tenantId] = { error: message };
            await stamp(db, tenantId, { last_error: message.slice(0, 500) });
        }
    }
    return NextResponse.json({ success: true, tenants: connections.length, results });
}

/** Keep the run's result on the tenant's link row; a failed stamp is reported, never fatal to the run. */
async function stamp(
    db: ReturnType<typeof createSupabaseServiceClient>,
    tenantId: string,
    fields: { last_synced_at?: string; last_error: string | null },
): Promise<void> {
    const { error } = await db.from("prime_connections").update({ ...fields, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
    if (error) Sentry.captureException(new Error(`prime_connections stamp failed: ${error.message}`), { extra: { tenantId } });
}
