import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireCronAuth } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { getPrimeClient, primeConfigFromEnv, type PrimeClient } from "@/lib/prime/client";
import { pushPrimeChanges, type PrimePushOutcome } from "@/lib/prime/push";
import { announcePrimeDeliveries, syncPrimeTenant, type PrimeSyncOutcome } from "@/lib/prime/sync";
import { ensurePrimeWebhook } from "@/lib/prime/webhook";
import { sendPrimeDaily, watchPrimePayments, type PrimePaymentsOutcome } from "@/lib/prime/money-watch";
import { sendPrimeFailedNotices, type PrimeFailedNoticeOutcome } from "@/lib/prime/failed-notice";
import { recheckPrimeLinkRequests, type PrimeLinkRecheckOutcome } from "@/lib/prime/self-link";
import { CRON_MONITORS, withCronMonitor } from "@/lib/job-monitor";
import { reportDeferredStores, storeBudget } from "@/lib/cron-budget";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Prime's status is read this often; staff edits go out on every run (5 minutes). */
const STATUS_EVERY_MS = 15 * 60 * 1000;
/** Slack for cron start jitter, so a 15-minute rhythm does not slip to 20. */
const STATUS_JITTER_MS = 60 * 1000;
/** Prime's webhook setting is checked this often per warm instance (one read; a save only when it differs). */
const WEBHOOK_CHECK_EVERY_MS = 60 * 60 * 1000;
let webhookCheckedAt = 0;

type TenantResult = {
    push?: PrimePushOutcome;
    sync?: PrimeSyncOutcome;
    announced?: number;
    payments?: PrimePaymentsOutcome;
    daily?: boolean;
    failedNotices?: PrimeFailedNoticeOutcome;
    error?: string;
};
type WebhookResult = "unchanged" | "saved" | "not_production" | "not_due" | "failed";

/**
 * GET /api/cron/prime-sync — every 5 minutes (vercel.json).
 *
 * For each tenant with an active Prime link: sends staff edits and
 * cancellations to Prime (lib/prime/push), and every 15 minutes reads the
 * status of its open shipments and applies it (lib/prime/sync), so Prime
 * gets no more status reads than before. With the status read it also
 * looks for new Prime payments and, from 21:00 Baghdad, sends the evening
 * summary (lib/prime/money-watch). Every run announces what was delivered
 * since the last run, through the read or Prime's webhook, as one line. On
 * Production it also keeps Prime's webhook pointed at us (lib/prime/webhook),
 * once a store's link is on. One tenant failing does not stop the others;
 * its error is kept on its prime_connections row. First, stores waiting for
 * Prime to link their account are looked at again (lib/prime/self-link).
 * Stores go least recently stamped first, and no new store starts after half
 * of maxDuration: the rest are first next run (lib/cron-budget).
 */
async function runScheduled(request: NextRequest) {
    const denied = requireCronAuth(request);
    if (denied) return denied;
    const spent = storeBudget(maxDuration);

    const client = getPrimeClient();
    if (!client) return NextResponse.json({ success: true, message: "Prime is not configured", tenants: 0 });

    const db = createSupabaseServiceClient();
    const links = await recheckLinks(db, client);
    const { data: connections, error } = await db
        .from("prime_connections")
        .select("tenant_id, merchant_login_id, shop_id, branch_name, last_synced_at, last_payment_id, daily_sent_on")
        .eq("is_active", true)
        // A status read or an error stamps updated_at, so a store that keeps
        // failing slowly goes to the back instead of taking every run's time.
        .order("updated_at", { ascending: true, nullsFirst: true });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (connections.length === 0) return NextResponse.json({ success: true, tenants: 0, links });
    const webhook = await keepWebhook(client);

    // Step names only label the stored step; a failed read must not stop the delivery sync.
    let stepNames = new Map<string, string>();
    try {
        stepNames = await client.stepNames();
    } catch (err) {
        Sentry.captureException(err, { extra: { job: "prime-sync", step: "stepNames" } });
    }
    const results: Record<string, TenantResult> = {};
    let deferred = 0;
    for (const [index, connection] of connections.entries()) {
        if (spent()) {
            deferred = connections.length - index;
            break;
        }
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
            try {
                const lastPaymentId = connection.last_payment_id === null ? null : Number(connection.last_payment_id);
                result.payments = await watchPrimePayments(db, client, tenantId, { ...merchant, branchName: (connection.branch_name as string | null) ?? null }, lastPaymentId);
            } catch (err) {
                errors.push(report(err, tenantId, "payments"));
            }
            try {
                result.daily = await sendPrimeDaily(db, tenantId, (connection.daily_sent_on as string | null) ?? null, Date.now());
            } catch (err) {
                errors.push(report(err, tenantId, "daily"));
            }
        }
        try {
            result.announced = await announcePrimeDeliveries(db, tenantId, new Date().toISOString());
        } catch (err) {
            errors.push(report(err, tenantId, "announce"));
        }
        // After the status read, so a failure Prime just reported is messaged in the same run.
        try {
            result.failedNotices = await sendPrimeFailedNotices(db, tenantId, Date.now());
        } catch (err) {
            errors.push(report(err, tenantId, "failed-notice"));
        }
        if (errors.length > 0) result.error = errors.join("; ");
        if (statusDue || result.error) {
            await stamp(db, tenantId, {
                ...(result.sync ? { last_synced_at: new Date().toISOString() } : {}),
                last_error: result.error ? result.error.slice(0, 500) : null,
            });
        }
    }
    reportDeferredStores("prime-sync", deferred, connections.length);
    return NextResponse.json({ success: true, tenants: connections.length, deferred, webhook, links, results });
}

/**
 * Stores waiting for Prime to link their account (Fermi A3) are looked at
 * again here, so a store links itself as soon as Prime has done its part.
 * A failure is reported and never stops the shipments' run.
 */
async function recheckLinks(db: ReturnType<typeof createSupabaseServiceClient>, client: PrimeClient): Promise<PrimeLinkRecheckOutcome | "failed"> {
    try {
        return await recheckPrimeLinkRequests(db, client, Date.now(), (err, requestId) => {
            Sentry.captureException(err, { extra: { job: "prime-sync", step: "link-requests", requestId } });
        });
    } catch (err) {
        Sentry.captureException(err, { extra: { job: "prime-sync", step: "link-requests" } });
        return "failed";
    }
}

/**
 * Points Prime's webhooks (status changes, and new messages in tickets) at
 * this deployment's production domain. Only
 * Production does it, so a preview or a laptop never takes Prime's calls
 * away from the live app. A failure is reported and tried again next run;
 * the 15-minute read keeps orders moving meanwhile.
 */
async function keepWebhook(client: PrimeClient): Promise<WebhookResult> {
    const config = primeConfigFromEnv();
    if (!config || env.VERCEL_ENV !== "production" || !env.VERCEL_PROJECT_PRODUCTION_URL) return "not_production";
    if (Date.now() - webhookCheckedAt < WEBHOOK_CHECK_EVERY_MS) return "not_due";
    try {
        const origin = `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
        const status = await ensurePrimeWebhook(client, config, origin, "UPDATE_STATUS");
        const tickets = await ensurePrimeWebhook(client, config, origin, "TICKET_NEW_CHAT_MESSAGE");
        webhookCheckedAt = Date.now();
        return status === "saved" || tickets === "saved" ? "saved" : "unchanged";
    } catch (err) {
        Sentry.captureException(err, { extra: { job: "prime-sync", step: "webhook" } });
        return "failed";
    }
}

function report(err: unknown, tenantId: string, step: "push" | "sync" | "announce" | "payments" | "daily" | "failed-notice"): string {
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

export const GET = withCronMonitor(CRON_MONITORS.primeSync, runScheduled);
