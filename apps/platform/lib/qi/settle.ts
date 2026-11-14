import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getQiPaymentStatus, type QiConfig } from "./client";

const settleResultSchema = z.object({
    success: z.boolean(),
    status: z.enum(["created", "success", "failed", "canceled"]).optional(),
    error: z.string().optional(),
    duplicate: z.boolean().optional(),
});
export type QiSettleResult = z.infer<typeof settleResultSchema>;

export interface QiPaymentRow {
    id: string;
    tenant_id: string;
    qi_payment_id: string | null;
    status: "created" | "success" | "failed" | "canceled";
}

/**
 * Ask Qi for a payment's status and record it (settle_qi_payment). A paid
 * payment credits the shop's wallet once; calling this again, from the webhook
 * and from the shop's return page at the same time, is safe.
 */
export async function settleQiPayment(config: QiConfig, row: QiPaymentRow): Promise<QiSettleResult> {
    if (row.status !== "created") return { success: true, status: row.status, duplicate: true };
    if (!row.qi_payment_id) return { success: false, error: "not_opened" };

    const payment = await getQiPaymentStatus(config, row.qi_payment_id);
    if (payment.requestId !== row.id || payment.currency !== "IQD") {
        return { success: false, error: "payment_mismatch" };
    }

    const { data, error } = await createSupabaseServiceClient().rpc("settle_qi_payment", {
        _id: row.id,
        _qi_payment_id: payment.paymentId,
        _qi_status: payment.status,
        _amount: payment.amount,
        _canceled: payment.canceled,
        _masked_pan: payment.details?.maskedPan ?? "",
    });
    if (error) throw error;
    return settleResultSchema.parse(data);
}
