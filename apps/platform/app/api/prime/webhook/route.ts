import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getPrimeClient, primeConfigFromEnv } from "@/lib/prime/client";
import { syncPrimeCases } from "@/lib/prime/sync";
import { isPrimeWebhookCall, parsePrimeWebhookBody, PRIME_WEBHOOK_HEADER, primeUpdateNotes, primeWebhookSecret } from "@/lib/prime/webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/prime/webhook: Prime says a parcel's status changed.
 *
 * Only Prime holds the header secret (lib/prime/webhook). The call is a nudge:
 * the cases it names are read back from Prime and applied like the 15-minute
 * read, so a forged or out-of-order call cannot set a status by itself.
 * Prime's return or postponement reason, which only the call carries, is
 * kept on the shipment. A case we do not track is acknowledged and dropped;
 * a failure answers 500 so Prime tries again, and the 15-minute read catches
 * up either way.
 */
export async function POST(request: NextRequest) {
    const config = primeConfigFromEnv();
    const client = getPrimeClient();
    if (!config || !client) return NextResponse.json({ success: false, error: "Prime is not configured" }, { status: 503 });
    if (!isPrimeWebhookCall(request.headers.get(PRIME_WEBHOOK_HEADER), primeWebhookSecret(config))) {
        return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: "bad body" }, { status: 400 });
    }
    const updates = parsePrimeWebhookBody(body);
    if (!updates) return NextResponse.json({ success: false, error: "bad body" }, { status: 400 });
    if (updates.length === 0) return NextResponse.json({ success: true, matched: 0 });

    const db = createSupabaseServiceClient();
    try {
        const caseIds = [...new Set(updates.map((u) => u.caseId))];
        const { data: shipments, error } = await db.from("prime_shipments").select("id, tenant_id, case_id").in("case_id", caseIds);
        if (error) throw new Error(error.message);
        if (!shipments || shipments.length === 0) return NextResponse.json({ success: true, matched: 0 });

        const tenantIds = [...new Set(shipments.map((s) => String(s.tenant_id)))];
        const { data: links, error: linkError } = await db.from("prime_connections").select("tenant_id").eq("is_active", true).in("tenant_id", tenantIds);
        if (linkError) throw new Error(linkError.message);
        const active = new Set((links ?? []).map((l) => String(l.tenant_id)));
        const tracked = shipments.filter((s) => active.has(String(s.tenant_id)));

        for (const update of updates) {
            const notes = primeUpdateNotes(update);
            if (Object.keys(notes).length === 0) continue;
            for (const shipment of tracked.filter((s) => Number(s.case_id) === update.caseId)) {
                const { error: noteError } = await db.from("prime_shipments").update(notes).eq("id", shipment.id);
                if (noteError) throw new Error(noteError.message);
            }
        }

        const stepNames = await client.stepNames().catch((err: unknown) => {
            // Step names only label the stored step; a failed read must not hold back the status.
            Sentry.captureException(err, { extra: { job: "prime-webhook", step: "stepNames" } });
            return new Map<string, string>();
        });
        let delivered = 0;
        let flagged = 0;
        for (const tenantId of active) {
            const cases = tracked.filter((s) => String(s.tenant_id) === tenantId).map((s) => Number(s.case_id));
            const counts = await syncPrimeCases(db, client, tenantId, cases, stepNames);
            delivered += counts.delivered;
            flagged += counts.flagged;
        }
        return NextResponse.json({ success: true, matched: tracked.length, delivered, flagged });
    } catch (err) {
        Sentry.captureException(err, { extra: { job: "prime-webhook" } });
        return NextResponse.json({ success: false, error: "failed" }, { status: 500 });
    }
}
