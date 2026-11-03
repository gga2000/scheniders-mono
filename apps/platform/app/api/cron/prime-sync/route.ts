import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireCronAuth } from "@/lib/cron-auth";
import { getPrimeClient } from "@/lib/prime/client";
import { pushPrimeChanges, type PrimePushOutcome } from "@/lib/prime/push";
import { syncPrimeTenant, type PrimeSyncOutcome } from "@/lib/prime/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Prime's status is read this often; staff edits go out on every run (5 minutes). */
const STATUS_EVERY_MS = 15 * 60 * 1000;
/** Slack for cron start jitter, so a 15-minute rhythm does not slip to 20. */
const STATUS_JITTER_MS = 60 * 1000;

type TenantResult = { push?: PrimePushOutcome; sync?: PrimeSyncOutcome; error?: string };

/**
 * GET /api/cron/prime-sync — every 5 minutes (vercel.json).
 *
 * For each tenant with an active Prime link: sends staff edits and
 * cancellations to Prime (lib/prime/push), and every 15 minutes reads the
 * status of its open shipments and applies it (lib/prime/sync), so Prime
 * gets no more status reads than before. One tenant failing does not stop
 * the others; its error is kept on its prime_connections row.
 */
export async function GET(request: NextRequest) {
    const denied = requireCronAuth(request);
    if (denied) return denied;

    const client = getPrimeClient();
    if (!client) return NextResponse.json({ success: true, message: "Prime is not configured", tenants: 0 });

    const db = createSupabaseServiceClient();
    const { data: connections, error } = await db
        .from("prime_connections")
        .select("tenant_id, merchant_login_id, shop_id, last_synced_at")
        .eq("is_active", true);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (connections.length === 0) return NextResponse.json({ success: true, tenants: 0 });

    // Step names only label the stored step; a failed read must not stop the delivery sync.
    let stepNames = new Map<string, string>();
    try {
        stepNames = await client.stepNames();
    } catch (err) {
        Sentry.captureException(err, { extra: { job: "prime-sync", step: "stepNames" } });
    }
    const results: Record<string, TenantResult> = {};
    for (const connection of connections) {
        const tenantId = connection.tenant_id as string;
        const merchant = { merchantLoginId: connection.merchant_login_id as string, shopId: Number(connection.shop_id) };
        const result: TenantResult = {};
        results[tenantId] = result;
        const errors: string[] = [];
        // Edits and the status read are independent: one failing does not hold back the other.
        try {
            result.push = await pushPrimeChanges(db, client, tenantId, merchant);
        } catch (err) {
            errors.push(report(err, tenantId, "push"));
        }
        const lastSynced = connection.last_synced_at ? Date.parse(connection.last_synced_at as string) : 0;
        const statusDue = Date.now() - lastSynced >= STATUS_EVERY_MS - STATUS_JITTER_MS;
        if (statusDue) {
            try {
                result.sync = await syncPrimeTenant(db, client, tenantId, stepNames);
            } catch (err) {
                errors.push(report(err, tenantId, "sync"));
            }
        }
        if (errors.length > 0) result.error = errors.join("; ");
        if (statusDue || result.error) {
            await stamp(db, tenantId, {
                ...(result.sync ? { last_synced_at: new Date().toISOString() } : {}),
                last_error: result.error ? result.error.slice(0, 500) : null,
            });
        }
    }
    return NextResponse.json({ success: true, tenants: connections.length, results });
}

function report(err: unknown, tenantId: string, step: "push" | "sync"): string {
    Sentry.captureException(err, { extra: { tenantId, job: "prime-sync", step } });
    return `${step}: ${err instanceof Error ? err.message : String(err)}`;
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
