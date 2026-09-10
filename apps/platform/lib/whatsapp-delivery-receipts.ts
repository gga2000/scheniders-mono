import { createSupabaseServiceClient } from "@/lib/supabase-server";

/**
 * Recording Interakt delivery receipts against the message they belong to.
 *
 * OBS-3. "WhatsApp delivery rate" was filed as unanswerable because the
 * integration did not record outcomes. Checked against live data, the real
 * shape was worse and more specific:
 *
 *   1. The send path read the provider's message id as `data.message_id`, a
 *      shape Interakt does not send — it returns `id` at the top level. So
 *      `interakt_message_id` was NULL on all 8,862 rows of `whatsapp_logs`,
 *      and no send could ever be matched to its receipt.
 *   2. The receipt handler on the per-tenant endpoint answered
 *      `{"message":"Status ... logged"}` and wrote nothing at all. Receipts
 *      stop dead at 2026-06-01 in the data — 170 messages sent since, with
 *      zero delivered/read/failed of any kind — which is when traffic moved to
 *      that endpoint.
 *   3. The receipt handler on the shared endpoint did write a row, but stamped
 *      every one with `template_name: "cod_order_confirm"` regardless of which
 *      template it was actually about, and recorded no message id, so its rows
 *      could only ever be counted, never joined.
 *
 * Both endpoints now call this. The receipt carries the same id the send
 * returned (`data.message.id`), so the original row supplies the tenant, the
 * order and the real template name.
 */

/** Interakt webhook type → the status we store. */
export const INTERAKT_DELIVERY_STATUSES: Record<string, string> = {
    message_api_sent: "sent",
    message_api_delivered: "delivered",
    message_api_read: "read",
    message_api_failed: "failed",
};

type ReceiptPayload = {
    data?: {
        message?: {
            id?: unknown;
            meta_data?: { source_data?: { callback_data?: unknown } };
            context?: { callback_data?: unknown };
        };
        customer?: { phone_number?: unknown };
        callbackData?: unknown;
    };
    callbackData?: unknown;
    endCustomerPhone?: unknown;
};

const asString = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;

export function extractReceiptMessageId(payload: ReceiptPayload): string | null {
    return asString(payload?.data?.message?.id);
}

/**
 * Write one delivery receipt, correlated to the send it belongs to.
 *
 * `tenantId` is the tenant of the endpoint that received it, where the endpoint
 * knows one. It is only a fallback: the tenant recorded on the original send is
 * preferred, because that is the tenant the message was actually sent for.
 *
 * Never throws. A receipt that cannot be stored must not make the webhook fail,
 * or Interakt will retry a message we have already acted on.
 */
export async function recordWhatsAppDeliveryReceipt(
    payload: ReceiptPayload,
    status: string,
    tenantId?: string,
): Promise<void> {
    try {
        const supabaseAdmin = createSupabaseServiceClient();
        const messageId = extractReceiptMessageId(payload);

        // The send row, if we can find it. This is the whole point of the id.
        let origin: {
            tenant_id: string | null;
            order_id: string | null;
            order_uuid: string | null;
            template_name: string | null;
        } | null = null;

        if (messageId) {
            const { data } = await supabaseAdmin
                .from("whatsapp_logs")
                .select("tenant_id, order_id, order_uuid, template_name")
                .eq("interakt_message_id", messageId)
                .eq("direction", "outbound")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            origin = data;
        }

        const callbackData =
            asString(payload?.data?.message?.context?.callback_data) ??
            asString(payload?.data?.message?.meta_data?.source_data?.callback_data) ??
            asString(payload?.data?.callbackData) ??
            asString(payload?.callbackData);

        const phone =
            asString(payload?.data?.customer?.phone_number) ??
            asString(payload?.endCustomerPhone) ??
            "unknown";

        await supabaseAdmin.from("whatsapp_logs").insert({
            // Prefer what the send recorded; fall back to the callback, which is
            // what the old handler used on its own and is often prefixed
            // ("staff_alert:<uuid>") rather than an order number.
            order_id: origin?.order_id ?? callbackData ?? "unknown",
            order_uuid: origin?.order_uuid ?? null,
            tenant_id: origin?.tenant_id ?? tenantId ?? null,
            phone,
            // Was hardcoded to "cod_order_confirm" on every receipt, including
            // receipts for staff alerts.
            template_name: origin?.template_name ?? null,
            direction: "status_update",
            status,
            interakt_message_id: messageId,
            payload: payload as unknown as Record<string, unknown>,
        });
    } catch (err) {
        console.warn("[Interakt Webhook] Failed to record delivery receipt:", err);
    }
}
