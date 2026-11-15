import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCronAuth } from "@/lib/cron-auth";
import { CRON_MONITORS, withCronMonitor } from "@/lib/job-monitor";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { chargeQiToken, classifyQiFailure, findQiPaymentByRequest, qiConfigFromEnv, type QiConfig } from "@/lib/qi/client";
import {
    QI_PAYMENT_COLUMNS,
    QI_RECHECK_AFTER_MS,
    attachQiPaymentId,
    closeUnopenedQiPayment,
    qiMoneyAlarm,
    qiPaymentRowSchema,
    reconcileQiPayment,
    settleQiPayment,
    type QiPaymentRow,
    type QiSettleResult,
} from "@/lib/qi/settle";
import { QiTokenSealError, openQiToken, qiTokenKeyFromEnv } from "@/lib/qi/token-seal";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Stop starting new work after this: one refill makes at most 3 Qi calls of up to 20 s, so a run ends inside maxDuration. */
const BUDGET_MS = 45_000;
/** Open payments are re-checked for this long; by then every one has been settled or canceled. */
const RECHECK_FOR_MS = 7 * 24 * 60 * 60_000;

const dueSchema = z.array(z.object({ tenant_id: z.string().uuid() }));
const startSchema = z.union([
    z.object({ success: z.literal(true), row: qiPaymentRowSchema, token: z.string() }),
    z.object({ success: z.literal(false), error: z.string() }),
]);

type Outcome = "success" | "failed" | "canceled" | "created" | "card_dead" | "busy" | "not_due" | "error";
type Admin = ReturnType<typeof createSupabaseServiceClient>;

const outcomeOf = (result: QiSettleResult): Outcome => (result.success ? (result.status ?? "error") : "error");

/**
 * Charge one refill and settle it from Qi's status API (never from the charge
 * answer). When Qi answers the charge with an error, its lookup by our request
 * id must confirm no payment exists before the row is closed: declined counts
 * against the card, a dead card is removed, our own setup error counts
 * nothing. No answer at all leaves the row open: Qi may have charged, and
 * reconcileQiPayment decides from Qi's records once it is surely finished.
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
        const failure = classifyQiFailure(err);
        console.error("[qi-auto-refill] charge not accepted", { tenant: row.tenant_id, failure, error: String(err) });
        if (failure === "unknown") return "error";
        const opened = await findQiPaymentByRequest(config, row.id);
        if (opened) return outcomeOf(await settleQiPayment(config, await attachQiPaymentId(admin, row, opened.paymentId), opened));
        if (failure === "ours") {
            await closeUnopenedQiPayment(admin, row.id, "not_opened");
            return "error";
        }
        await closeUnopenedQiPayment(admin, row.id, failure === "card_dead" ? "card_dead" : "declined");
        return failure === "card_dead" ? "card_dead" : "failed";
    }
    return outcomeOf(await settleQiPayment(config, await attachQiPaymentId(admin, row, paymentId)));
}

/**
 * Open and charge one store's refill. start_qi_auto_refill re-checks that the
 * store is still due under a lock on its card, so overlapping runs charge once.
 */
async function refill(admin: Admin, config: QiConfig, key: Buffer, origin: string, tenantId: string): Promise<Outcome> {
    const { data, error } = await admin.rpc("start_qi_auto_refill", { _tenant_id: tenantId });
    if (error) throw error;
    const started = startSchema.parse(data);
    if (!started.success) return started.error === "busy" ? "busy" : "not_due";

    let token: string;
    try {
        token = openQiToken(started.token, tenantId, key);
    } catch (err) {
        if (!(err instanceof QiTokenSealError)) throw err;
        qiMoneyAlarm("saved card token does not open (QI_TOKEN_KEY changed?)", { tenant: tenantId });
        await closeUnopenedQiPayment(admin, started.row.id, "not_opened");
        return "error";
    }
    try {
        return await charge(admin, config, origin, started.row, token);
    } catch (err) {
        // The row stays open; reconcileQiPayment finishes it from Qi's records.
        console.error("[qi-auto-refill] refill left open", { tenant: tenantId, error: String(err) });
        return "error";
    }
}

/** Every open payment older than a few minutes, oldest first, brought to its final state from Qi's records. */
async function reconcileOpen(admin: Admin, config: QiConfig, deadline: number): Promise<{ recovered: number; errors: number }> {
    const now = Date.now();
    const { data, error } = await admin
        .from("qi_payments")
        .select(QI_PAYMENT_COLUMNS)
        .eq("status", "created")
        .lt("created_at", new Date(now - QI_RECHECK_AFTER_MS).toISOString())
        .gt("created_at", new Date(now - RECHECK_FOR_MS).toISOString())
        .order("created_at", { ascending: true })
        .limit(100);
    if (error) throw error;
    let recovered = 0;
    let errors = 0;
    for (const open of data ?? []) {
        if (Date.now() > deadline) break;
        const row = qiPaymentRowSchema.parse(open);
        try {
            if ((await reconcileQiPayment(admin, config, row)) !== "waiting") recovered += 1;
        } catch (err) {
            errors += 1;
            console.error("[qi-auto-refill] re-check failed", { id: row.id, error: String(err) });
        }
    }
    return { recovered, errors };
}

/**
 * Cron, every 10 minutes: charge the saved Qi card of every store whose wallet
 * is low, or cannot cover the monthly fee due within a day (qi_auto_refill_due
 * decides who and how much). Each charge is a qi_payments row (kind
 * auto_refill) settled exactly like a top-up the shop pays itself: the wallet
 * is credited only from Qi's status, once. A failed charge is counted; 3 in a
 * row switch auto refill off and tell the store. Each run then brings every
 * open payment, top-ups included, to its final state from Qi's records.
 */
async function runScheduled(request: Request) {
    const denied = requireCronAuth(request);
    if (denied) return denied;

    const config = qiConfigFromEnv();
    if (!config) return NextResponse.json({ success: true, skipped: "qi_not_configured" });
    const deadline = Date.now() + BUDGET_MS;

    const admin = createSupabaseServiceClient();
    const { data, error } = await admin.rpc("qi_auto_refill_due");
    if (error) throw error;
    const due = dueSchema.parse(data ?? []);

    const key = qiTokenKeyFromEnv();
    if (due.length > 0 && !key) qiMoneyAlarm("saved cards are due but QI_TOKEN_KEY is missing", { due: due.length });

    const origin = new URL(request.url).origin;
    const results: { tenant_id: string; outcome: Outcome }[] = [];
    for (const store of due) {
        if (!key || Date.now() > deadline) break;
        results.push({ tenant_id: store.tenant_id, outcome: await refill(admin, config, key, origin, store.tenant_id) });
    }

    const { recovered, errors: recheckErrors } = await reconcileOpen(admin, config, deadline);

    const errors = results.filter((r) => r.outcome === "error").length + recheckErrors + (due.length > 0 && !key ? 1 : 0);
    console.log(`[qi-auto-refill] ${due.length} due: ${results.map((r) => r.outcome).join(", ") || "none"}; recovered ${recovered}`);
    return NextResponse.json({ success: errors === 0, due: due.length, results, recovered }, { status: errors === 0 ? 200 : 500 });
}

export const GET = withCronMonitor(CRON_MONITORS.qiAutoRefill, runScheduled);
