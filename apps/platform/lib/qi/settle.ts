import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { blockQiToken, getQiPaymentStatus, type QiConfig, type QiPayment } from "./client";

const settleResultSchema = z.object({
    success: z.boolean(),
    status: z.enum(["created", "success", "failed", "canceled"]).optional(),
    error: z.string().optional(),
    duplicate: z.boolean().optional(),
});
export type QiSettleResult = z.infer<typeof settleResultSchema>;

const saveCardResultSchema = z.object({
    success: z.boolean(),
    error: z.string().optional(),
    replaced_token: z.string().nullable().optional(),
});

/** The qi_payments columns settling needs. */
export const QI_PAYMENT_COLUMNS = "id, tenant_id, qi_payment_id, status, amount_iqd, save_card, kind";
export const qiPaymentRowSchema = z.object({
    id: z.string().uuid(),
    tenant_id: z.string().uuid(),
    qi_payment_id: z.string().nullable(),
    status: z.enum(["created", "success", "failed", "canceled"]),
    amount_iqd: z.number(),
    save_card: z.boolean(),
    kind: z.enum(["topup", "auto_refill"]),
});
export type QiPaymentRow = z.infer<typeof qiPaymentRowSchema>;

/** Qi's validTo has no time zone; it is UTC. */
function utc(validTo: string | undefined): string | null {
    if (!validTo) return null;
    const when = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(validTo) ? validTo : `${validTo}Z`);
    return Number.isNaN(when.getTime()) ? null : when.toISOString();
}

/** Keep the card of a paid "save my card" top-up, and block the card it replaces. */
async function keepCard(config: QiConfig, row: QiPaymentRow, payment: QiPayment): Promise<void> {
    if (!row.save_card || !payment.paymentToken) return;
    const validTo = utc(payment.paymentToken.validTo);
    const { data, error } = await createSupabaseServiceClient().rpc("save_qi_card", {
        _payment_row_id: row.id,
        _token: payment.paymentToken.token,
        _token_type: payment.paymentToken.type,
        ...(validTo ? { _valid_to: validTo } : {}),
        _masked_pan: payment.details?.maskedPan ?? "",
    });
    if (error) throw error;
    const saved = saveCardResultSchema.parse(data);
    if (!saved.success) throw new Error(`save_qi_card: ${saved.error}`);
    if (saved.replaced_token) await blockQiToken(config, saved.replaced_token, crypto.randomUUID());
}

/**
 * Record what Qi says about a payment (settle_qi_payment), reading the status
 * from Qi's API with our credentials, or from `known` when the caller has just
 * read it. A paid payment credits the shop's wallet once; calling this again,
 * from the webhook and from the shop's return page at the same time, is safe.
 */
export async function settleQiPayment(config: QiConfig, row: QiPaymentRow, known?: QiPayment): Promise<QiSettleResult> {
    if (row.status !== "created") return { success: true, status: row.status, duplicate: true };
    if (!row.qi_payment_id) return { success: false, error: "not_opened" };

    const payment = known ?? (await getQiPaymentStatus(config, row.qi_payment_id));
    if (payment.paymentId !== row.qi_payment_id || payment.requestId !== row.id || payment.currency !== "IQD") {
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
    const result = settleResultSchema.parse(data);
    if (result.success && result.status === "success" && !result.duplicate) await keepCard(config, row, payment);
    return result;
}
