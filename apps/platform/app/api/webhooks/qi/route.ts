import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { withFailureReport } from "@/lib/job-monitor";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { qiConfigFromEnv, qiWebhookSchema, verifyQiSignature } from "@/lib/qi/client";
import { settleQiPayment, type QiPaymentRow } from "@/lib/qi/settle";

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

    const { data: row, error } = await createSupabaseServiceClient()
        .from("qi_payments")
        .select("id, tenant_id, qi_payment_id, status")
        .eq("id", id.data)
        .eq("qi_payment_id", parsed.data.paymentId)
        .maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ ok: true, ignored: "not_ours" });

    const result = await settleQiPayment(config, row as QiPaymentRow);
    if (!result.success) {
        console.error("[qi] webhook settle refused", { id: row.id, error: result.error });
        return NextResponse.json({ ok: true, ignored: result.error });
    }
    return NextResponse.json({ ok: true, status: result.status });
}

export const POST = withFailureReport("api/webhooks/qi POST", handlePOST);
