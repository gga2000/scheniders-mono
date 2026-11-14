import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { withFailureReport } from "@/lib/job-monitor";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { qiConfigFromEnv } from "@/lib/qi/client";
import { QI_PAYMENT_COLUMNS, qiPaymentRowSchema, settleQiPayment } from "@/lib/qi/settle";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/qi/:id
 * The shop is back from Qi's page: ask Qi for the payment's status and credit
 * the wallet if it is paid. Same outcome as the webhook, whichever comes first.
 */
async function handlePOST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const id = z.string().uuid().safeParse((await params).id);
    if (!id.success) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const config = qiConfigFromEnv();
    if (!config) return NextResponse.json({ error: "qi_not_configured" }, { status: 503 });

    const { data: row, error } = await createSupabaseServiceClient()
        .from("qi_payments")
        .select(QI_PAYMENT_COLUMNS)
        .eq("id", id.data)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const result = await settleQiPayment(config, qiPaymentRowSchema.parse(row));
    if (!result.success) {
        console.error("[qi] settle refused", { id: row.id, error: result.error });
        return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ status: result.status, amount: row.amount_iqd });
}

export const POST = withFailureReport("api/billing/qi/[id] POST", handlePOST);
