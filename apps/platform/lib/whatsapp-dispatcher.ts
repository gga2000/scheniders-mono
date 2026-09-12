/**
 * whatsapp-dispatcher.ts
 *
 * Dispatches WhatsApp template messages (confirmation / reminder / discount)
 * via Interakt for a given order.
 *
 * IMPORTANT: this runs the dispatch logic IN-PROCESS. It used to fire an
 * internal HTTP fetch to /api/webhooks/interakt/dispatch-event, but that
 * self-call depended on NEXT_PUBLIC_SITE_URL and broke silently whenever it
 * was missing (fell back to the protected VERCEL_URL → 401 → no send, no log).
 * Calling the logic directly removes that whole class of failure.
 */

import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { sendTemplateMessage, TEMPLATE_NAMES, type TemplateType } from "@/lib/interakt";
import { flagOrderForWhatsAppFailure, clearWhatsAppFailureFlags } from "@/lib/whatsapp-error-handler";
import type { Order } from "@/types/order";

let _admin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const admin = () => (_admin ??= createSupabaseServiceClient());

export interface DispatchWhatsAppParams {
    orderId: string;
    templateType?: TemplateType;
    overridePhone?: string;
}

export interface DispatchWhatsAppResult {
    success: boolean;
    /** Order id did not resolve to a row. */
    notFound?: boolean;
    /** Auto-send is disabled; nothing was attempted. */
    skipped?: boolean;
    error?: string;
    messageId?: string;
}

/**
 * Send a WhatsApp template for an order and record the outcome. Honors the
 * `whatsapp_auto_send` toggle, logs to `whatsapp_logs`, flags failures for
 * manual review, mirrors to the secondary phone, and advances the order to
 * "contacted". Never throws — always returns a structured result.
 */
export async function dispatchWhatsAppEvent({
    orderId,
    templateType = "confirmation",
    overridePhone,
}: DispatchWhatsAppParams): Promise<DispatchWhatsAppResult> {
    if (!orderId) return { success: false, error: "Missing orderId" };

    const supabaseAdmin = admin();

    // 1. Fetch the order details
    const { data: orderData, error: fetchError } = await supabaseAdmin
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

    if (fetchError || !orderData) {
        console.error("[WhatsApp Dispatcher] Failed to fetch order:", fetchError);
        return { success: false, notFound: true, error: "Order not found" };
    }

    const order = orderData as Order;

    // 2. Check if whatsapp_auto_send is enabled
    const { data: settings } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "whatsapp_auto_send")
        .single();

    const settingsValue = settings?.value as { enabled?: boolean } | null | undefined;
    if (settingsValue?.enabled !== true) {
        console.log(`[WhatsApp Dispatcher] Skipping order ${orderId} because whatsapp_auto_send is disabled.`);
        return { success: true, skipped: true };
    }

    // 3. Send the template
    const templateName = TEMPLATE_NAMES[templateType];
    console.log(`[WhatsApp Dispatcher] Sending ${templateType} for order ${orderId}...`);
    const result = await sendTemplateMessage(order, templateType, overridePhone);

    // 4. Log the action
    try {
        await supabaseAdmin.from("whatsapp_logs").insert({
            order_id: order.order_id,
            order_uuid: order.id,
            phone: overridePhone || order.phone,
            template_name: templateName,
            direction: "outbound",
            status: result.success ? "sent" : "failed",
            interakt_message_id: result.messageId || null,
            payload: {
                templateType,
                error: result.error,
                statusCode: result.statusCode,
                source: "dispatch-event",
            },
        });
    } catch (logErr) {
        console.error("[WhatsApp Dispatcher] Failed to log to whatsapp_logs:", logErr);
    }

    if (!result.success) {
        console.error(`[WhatsApp Dispatcher] Failed to send Interakt msg for order ${orderId}:`, result.error);
        await flagOrderForWhatsAppFailure(order.id, result, order.order_id, overridePhone || order.phone);
        return { success: false, error: result.error };
    }

    // 4b. Also send to secondary phone if present and different from primary
    if (order.secondary_phone && order.secondary_phone !== order.phone) {
        try {
            console.log(`[WhatsApp Dispatcher] Sending ${templateType} to secondary phone for order ${orderId}...`);
            const secondaryResult = await sendTemplateMessage(order, templateType, order.secondary_phone);

            await supabaseAdmin.from("whatsapp_logs").insert({
                order_id: order.order_id,
                order_uuid: order.id,
                phone: order.secondary_phone,
                template_name: templateName,
                direction: "outbound",
                status: secondaryResult.success ? "sent" : "failed",
                interakt_message_id: secondaryResult.messageId || null,
                payload: {
                    templateType,
                    error: secondaryResult.error,
                    statusCode: secondaryResult.statusCode,
                    source: "dispatch-event-secondary",
                },
            });

            if (!secondaryResult.success) {
                console.warn(`[WhatsApp Dispatcher] Failed to send to secondary phone for order ${orderId}:`, secondaryResult.error);
            }
        } catch (secErr) {
            console.error("[WhatsApp Dispatcher] Error sending to secondary phone:", secErr);
        }
    }

    // Clear any previous WhatsApp failure flags since primary send succeeded
    await clearWhatsAppFailureFlags(order.id);

    // 5. Auto-update order status + increment contact_count
    const previousStatus = order.status || "new";
    const newContactCount = (order.contact_count || 0) + 1;
    const shouldUpdateStatus = previousStatus !== "contacted" && previousStatus !== "confirmed" && previousStatus !== "cancelled";

    await supabaseAdmin
        .from("orders")
        .update({
            ...(shouldUpdateStatus ? { status: "contacted" } : {}),
            contact_count: newContactCount,
            last_contacted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            // Nothing reaches this function except automation — the LightFunnels
            // webhook's immediate confirmation and cart recovery. Recording it
            // under the same 'bot' sentinel the cron uses means the card can say
            // "the system already messaged this customer" instead of leaving a
            // blank where an agent looks for one.
            last_followup_by_name: "الإرسال التلقائي",
            last_followup_by_avatar: "bot",
            last_followup_at: new Date().toISOString(),
            last_followup_type: templateType,
        })
        .eq("id", order.id);

    if (shouldUpdateStatus) {
        await supabaseAdmin.from("order_status_history").insert({
            order_id: order.id,
            from_status: previousStatus,
            to_status: "contacted",
            changed_by: "whatsapp_bot",
            notes: `تم إرسال قالب التأكيد عبر واتساب تلقائياً`,
        });
    }

    console.log(`[WhatsApp Dispatcher] Successfully processed order ${orderId}.`);
    return { success: true, messageId: result.messageId };
}

/**
 * Fire the immediate order-confirmation send. Called from the LightFunnels
 * webhook right after an order is created. Runs in-process and never throws to
 * its caller — failures are logged so the webhook response is unaffected.
 */
export async function triggerImmediateConfirmation(orderId: string, phone?: string) {
    if (!orderId) return;

    console.log(`[WhatsApp Dispatcher] Dispatching confirmation in-process for order ${orderId}...`);

    try {
        const result = await dispatchWhatsAppEvent({
            orderId,
            templateType: "confirmation",
            overridePhone: phone,
        });

        if (!result.success && !result.skipped) {
            console.error(`[WhatsApp Dispatcher] In-process confirmation failed for order ${orderId}:`, result.error);
        }
    } catch (err) {
        console.error(`[WhatsApp Dispatcher] Failed to dispatch confirmation for order ${orderId}:`, err);
    }
}
