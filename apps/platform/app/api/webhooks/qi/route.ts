import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { withFailureReport } from "@/lib/job-monitor";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getQiPaymentStatus, qiConfigFromEnv, qiWebhookSchema, verifyQiSignature, type QiPayment } from "@/lib/qi/client";
import { QI_PAYMENT_COLUMNS, attachQiPaymentId, qiMoneyAlarm, qiPaymentRowSchema, settleQiPayment } from "@/lib/qi/settle";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/qi — Qi's payment message.
 *
 * The body is only a hint about which payment changed. We never act on its
 * status: settleQiPayment asks Qi's status API with our own credentials and
 * credits the wallet from that answer. When QI_WEBHOOK_PUBLIC_KEY is set, a
 * message without Qi's valid signature is refused before anything else.
 *
 * Qi repeats a message until it gets a 200, so known-final and unknown
 * payments answer 200; only our own failures answer 5xx to get a retry.
 */
async function handlePOST(request: NextRequest) {
    const config = qiConfigFromEnv();
    if (!config) return NextResponse.json({ error: "qi_not_configured" }, { status: 503 });

    const parsed = qiWebhookSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "bad_body" }, { status: 400 });

    if (env.QI_WEBHOOK_PUBLIC_KEY) {
        const signature = request.headers.get("x-signature") ?? "";
        if (!verifyQiSignature(parsed.data, signature, env.QI_WEBHOOK_PUBLIC_KEY)) {
            console.error("[qi] webhook signature refused", { paymentId: parsed.data.paymentId });
            return NextResponse.json({ error: "bad_signature" }, { status: 401 });
        }
    }

    const id = z.string().uuid().safeParse(parsed.data.requestId);
    if (!id.success) return NextResponse.json({ ok: true, ignored: "not_ours" });

    const admin = createSupabaseServiceClient();
    const { data: found, error } = await admin.from("qi_payments").select(QI_PAYMENT_COLUMNS).eq("id", id.data).maybeSingle();
    if (error) throw error;
    if (!found) return NextResponse.json({ ok: true, ignored: "not_ours" });
    let row = qiPaymentRowSchema.parse(found);

    if (row.status !== "created") {
        // Closed here. If Qi took the money anyway (a charge we closed as never
        // opened), the wallet was not credited: a person must look.
        if (row.status !== "success") {
            const qi = await getQiPaymentStatus(config, row.qi_payment_id ?? parsed.data.paymentId);
            if (qi.requestId === row.id && qi.status === "SUCCESS" && !qi.canceled) {
                qiMoneyAlarm("Qi took a payment we had closed as not paid", { id: row.id, paymentId: qi.paymentId, amount: qi.amount, closedAs: row.status });
            }
        }
        return NextResponse.json({ ok: true, status: row.status, duplicate: true });
    }

    let known: QiPayment | undefined;
    if (row.qi_payment_id === null) {
        // We never got Qi's answer to opening this payment, so we do not know
        // its id. Attach it only when Qi's own status API says this payment
        // was opened for this row.
        known = await getQiPaymentStatus(config, parsed.data.paymentId);
        if (known.requestId !== row.id) return NextResponse.json({ ok: true, ignored: "not_ours" });
        row = await attachQiPaymentId(admin, row, known.paymentId);
    }
    if (row.qi_payment_id !== parsed.data.paymentId) return NextResponse.json({ ok: true, ignored: "not_ours" });

    const result = await settleQiPayment(config, row, known);
    if (!result.success) return NextResponse.json({ ok: true, ignored: result.error });
    return NextResponse.json({ ok: true, status: result.status });
}

export const POST = withFailureReport("api/webhooks/qi POST", handlePOST);
