import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCronAuth } from "@/lib/cron-auth";
import { CRON_MONITORS, withCronMonitor } from "@/lib/job-monitor";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { QiApiError, chargeQiToken, qiConfigFromEnv, type QiConfig } from "@/lib/qi/client";
import { QI_PAYMENT_COLUMNS, qiPaymentRowSchema, settleQiPayment, type QiPaymentRow } from "@/lib/qi/settle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const dueSchema = z.array(
    z.object({ tenant_id: z.string().uuid(), token: z.string(), amount_iqd: z.number().int(), requested_by: z.string().uuid() }),
);

type Outcome = "success" | "failed" | "canceled" | "created" | "busy" | "error";

type Admin = ReturnType<typeof createSupabaseServiceClient>;

const failResultSchema = z.object({ success: z.boolean(), status: z.string().optional(), error: z.string().optional() });

/** Close a refill Qi never opened a payment for, counting it as a failed charge. */
async function failUnopened(admin: Admin, id: string): Promise<void> {
    const { data, error } = await admin.rpc("fail_qi_auto_refill", { _id: id });
    if (error) throw error;
    const result = failResultSchema.parse(data);
    if (!result.success) throw new Error(`fail_qi_auto_refill: ${result.error}`);
}

/** Qi's code for wrong merchant credentials: our fault, never the shop's card. */
const QI_BAD_CREDENTIALS = 27;

/** Qi turned the charge down (4xx) for a reason that belongs to the card, so no payment was opened. */
function isRefusal(err: QiApiError): boolean {
    return err.status >= 400 && err.status < 500 && err.status !== 401 && err.code !== QI_BAD_CREDENTIALS;
}

/**
 * Charge one refill row and settle it from Qi's status API (never from the
 * charge answer). When Qi refuses the request (4xx), no payment exists and the
 * row is closed as failed. Any other failure leaves the row open: Qi may have
 * charged, so only its webhook or the recovery pass may close it.
 */
async function charge(admin: Admin, config: QiConfig, origin: string, row: QiPaymentRow, token: string): Promise<Outcome> {
    let paymentId: string;
    try {
        const payment = await chargeQiToken(config, {
            requestId: row.id,
            amountIqd: row.amount_iqd,
            token,
            finishPaymentUrl: `${origin}/settings?section=billing`,
            notificationUrl: `${origin}/api/webhooks/qi`,
        });
        paymentId = payment.paymentId;
    } catch (err) {
        if (err instanceof QiApiError && isRefusal(err)) {
            console.error("[qi-auto-refill] charge refused", { tenant: row.tenant_id, status: err.status, code: err.code, message: err.message });
            await failUnopened(admin, row.id);
            return "failed";
        }
        console.error("[qi-auto-refill] charge outcome unknown, left open", { tenant: row.tenant_id, error: String(err) });
        return "error";
    }

    const { error: updateError } = await admin.from("qi_payments").update({ qi_payment_id: paymentId }).eq("id", row.id).is("qi_payment_id", null);
    if (updateError) throw updateError;
    try {
        const result = await settleQiPayment(config, { ...row, qi_payment_id: paymentId });
        return result.success ? (result.status ?? "error") : "error";
    } catch (err) {
        // The charge exists at Qi; the webhook or the next recovery pass settles it.
        console.error("[qi-auto-refill] settle deferred", { tenant: row.tenant_id, error: String(err) });
        return "error";
    }
}

const openRefillSchema = qiPaymentRowSchema.extend({ created_at: z.string() });

/** How long a refill without a Qi payment id may stay open before it counts as failed. */
const UNOPENED_GIVE_UP_MS = 24 * 60 * 60 * 1000;

/**
 * Settle refills a missed webhook left open, so a store is never stuck: one
 * open refill blocks the next. A refill whose charge request never returned a
 * payment id is closed as failed after a day, by when Qi's webhook (which
 * repeats until answered) would have attached it.
 */
async function recoverOpenRefills(admin: Admin, config: QiConfig): Promise<number> {
    const { data, error } = await admin
        .from("qi_payments")
        .select(`${QI_PAYMENT_COLUMNS}, created_at`)
        .eq("kind", "auto_refill")
        .eq("status", "created")
        .lt("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .limit(50);
    if (error) throw error;
    let settled = 0;
    for (const open of data ?? []) {
        const row = openRefillSchema.parse(open);
        if (row.qi_payment_id) {
            try {
                const result = await settleQiPayment(config, row);
                if (result.success && result.status !== "created") settled += 1;
            } catch (err) {
                console.error("[qi-auto-refill] recovery settle failed", { id: row.id, error: String(err) });
            }
        } else if (Date.parse(row.created_at) < Date.now() - UNOPENED_GIVE_UP_MS) {
            console.error("[qi-auto-refill] refill never opened at Qi, closing as failed", { id: row.id, tenant: row.tenant_id });
            await failUnopened(admin, row.id);
            settled += 1;
        }
    }
    return settled;
}

/**
 * Cron, every 10 minutes: charge the saved Qi card of every store whose wallet
 * is low, or cannot cover the monthly fee due within a day (qi_auto_refill_due
 * decides who and how much). Each charge is a qi_payments row (kind
 * auto_refill) settled exactly like a top-up the shop pays itself: the wallet
 * is credited only from Qi's status, once. A failed charge is counted; 3 in a
 * row switch auto refill off and tell the store.
 */
async function runScheduled(request: Request) {
    const denied = requireCronAuth(request);
    if (denied) return denied;

    const config = qiConfigFromEnv();
    if (!config) return NextResponse.json({ success: true, skipped: "qi_not_configured" });

    const admin = createSupabaseServiceClient();
    const { data, error } = await admin.rpc("qi_auto_refill_due");
    if (error) throw error;
    const due = dueSchema.parse(data ?? []);

    const origin = new URL(request.url).origin;
    const results: { tenant_id: string; amount: number; outcome: Outcome }[] = [];

    for (const store of due) {
        const { data: inserted, error: insertError } = await admin
            .from("qi_payments")
            .insert({ tenant_id: store.tenant_id, requested_by: store.requested_by, amount_iqd: store.amount_iqd, kind: "auto_refill" })
            .select(QI_PAYMENT_COLUMNS)
            .single();
        if (insertError?.message === "qi_payment_open_limit") {
            results.push({ tenant_id: store.tenant_id, amount: store.amount_iqd, outcome: "busy" });
            continue;
        }
        if (insertError) throw insertError;
        const row = qiPaymentRowSchema.parse(inserted);
        results.push({ tenant_id: store.tenant_id, amount: row.amount_iqd, outcome: await charge(admin, config, origin, row, store.token) });
    }

    const recovered = await recoverOpenRefills(admin, config);

    const errors = results.filter((r) => r.outcome === "error").length;
    console.log(`[qi-auto-refill] ${due.length} due: ${results.map((r) => r.outcome).join(", ") || "none"}; recovered ${recovered}`);
    return NextResponse.json({ success: errors === 0, due: due.length, results, recovered }, { status: errors === 0 ? 200 : 500 });
}

export const GET = withCronMonitor(CRON_MONITORS.qiAutoRefill, runScheduled);
