import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getPrimeClient } from "@/lib/prime/client";
import { loadPrimeConnection } from "@/lib/prime/connection";
import { syncPrimeTenant } from "@/lib/prime/sync";
import { withFailureReport } from "@/lib/job-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** A store may press «حدّث الآن» this often: Prime's status read is a call per open parcel. */
const REFRESH_LIMIT = 3;
const REFRESH_WINDOW_SECONDS = 60;

/**
 * POST /api/prime/refresh — read Prime's status of the caller's open parcels
 * now, instead of waiting for the 15-minute read (the same read the cron
 * does, lib/prime/sync). Only the caller's own tenant, never one from the
 * body. Answers `{ success: true, connected, checked }`.
 */
async function handlePOST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;

    const limit = await consumeRateLimit(`prime-refresh:${caller.tenantId}`, REFRESH_LIMIT, REFRESH_WINDOW_SECONDS);
    if (!limit.allowed) {
        return NextResponse.json(
            { success: false, error: "Too many refreshes. Wait a minute." },
            { status: 429, headers: rateLimitHeaders(limit, REFRESH_LIMIT) },
        );
    }

    const client = getPrimeClient();
    const db = createSupabaseServiceClient();
    const connection = client ? await loadPrimeConnection(db, caller.tenantId) : null;
    if (!client || !connection) return NextResponse.json({ success: true, connected: false });

    // Step names only label the stored step; a failed read must not stop the status read.
    let stepNames = new Map<string, string>();
    try {
        stepNames = await client.stepNames();
    } catch (err) {
        Sentry.captureException(err, { extra: { job: "prime-refresh", step: "stepNames" } });
    }
    try {
        const outcome = await syncPrimeTenant(db, client, caller.tenantId, stepNames);
        const { error } = await db
            .from("prime_connections")
            .update({ last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
            .eq("tenant_id", caller.tenantId);
        if (error) Sentry.captureException(new Error(`prime_connections stamp failed: ${error.message}`), { extra: { tenantId: caller.tenantId } });
        return NextResponse.json({ success: true, connected: true, checked: outcome.checked });
    } catch (err) {
        Sentry.captureException(err, { extra: { job: "prime-refresh", tenantId: caller.tenantId } });
        return NextResponse.json({ success: false, error: "Prime did not answer." }, { status: 502 });
    }
}

export const POST = withFailureReport("api/prime/refresh POST", handlePOST);
