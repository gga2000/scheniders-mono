import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { withFailureReport } from "@/lib/job-monitor";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { classifyQiFailure, createQiPayment, findQiPaymentByRequest, qiConfigFromEnv } from "@/lib/qi/client";
import { closeUnopenedQiPayment } from "@/lib/qi/settle";
import { qiTokenKeyFromEnv } from "@/lib/qi/token-seal";

export const dynamic = "force-dynamic";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

/**
 * GET /api/billing/qi
 * Whether shops can pay by Qi card right now (the terminal is configured),
 * and whether they can save the card (the token sealing key is set too).
 */
async function handleGET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "member");
    if (!caller.ok) return caller.response;
    const enabled = qiConfigFromEnv() !== null;
    return NextResponse.json({ enabled, saveCard: enabled && qiTokenKeyFromEnv() !== null });
}

const bodySchema = z.object({
    amount: z.number().int().min(1_000).max(10_000_000),
    locale: z.enum(["ar", "en"]).default("ar"),
    /** Keep the card for auto refill (Qi issues a token once the payment is paid). */
    saveCard: z.boolean().default(false),
});

/**
 * POST /api/billing/qi  { amount, locale, saveCard }
 * Opens a Qi card payment for the caller's store (store admins only) and
 * returns Qi's payment page. The wallet is credited later, only after Qi's
 * status API says the payment succeeded (webhook or the return check).
 */
async function handlePOST(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const config = qiConfigFromEnv();
    if (!config) return NextResponse.json({ error: "qi_not_configured" }, { status: 503 });

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    if (parsed.data.saveCard && !qiTokenKeyFromEnv()) return NextResponse.json({ error: "save_card_unavailable" }, { status: 409 });

    const { data: row, error: insertError } = await supabaseAdmin()
        .from("qi_payments")
        .insert({
            tenant_id: caller.tenantId,
            requested_by: caller.userId,
            amount_iqd: parsed.data.amount,
            save_card: parsed.data.saveCard,
        })
        .select("id")
        .single();
    if (insertError?.message === "qi_payment_open_limit") {
        return NextResponse.json({ error: "too_many_open" }, { status: 429 });
    }
    if (insertError) throw insertError;

    const origin = new URL(request.url).origin;
    let payment;
    try {
        payment = await createQiPayment(config, {
            requestId: row.id,
            amountIqd: parsed.data.amount,
            finishPaymentUrl: `${origin}/settings?section=billing&qi=${row.id}`,
            notificationUrl: `${origin}/api/webhooks/qi`,
            locale: parsed.data.locale === "ar" ? "ar_IQ" : "en_US",
            saveCard: parsed.data.saveCard,
        });
    } catch (err) {
        const failure = classifyQiFailure(err);
        console.error("[qi] create payment not accepted", { failure, error: String(err) });
        // Qi answered with an error and holds no payment for this request:
        // close the row now so it does not count as open. Otherwise the cron
        // finds out from Qi and closes or cancels it.
        if (failure !== "unknown" && (await findQiPaymentByRequest(config, row.id)) === null) {
            await closeUnopenedQiPayment(supabaseAdmin(), row.id, "not_opened");
        }
        return NextResponse.json({ error: "qi_refused" }, { status: 502 });
    }

    const { error: updateError } = await supabaseAdmin()
        .from("qi_payments")
        .update({ qi_payment_id: payment.paymentId })
        .eq("id", row.id)
        .eq("tenant_id", caller.tenantId);
    if (updateError) throw updateError;

    return NextResponse.json({ id: row.id, formUrl: payment.formUrl });
}

export const GET = withFailureReport("api/billing/qi GET", handleGET);
export const POST = withFailureReport("api/billing/qi POST", handlePOST);
