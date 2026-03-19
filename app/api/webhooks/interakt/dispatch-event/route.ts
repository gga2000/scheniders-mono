import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTemplateMessage, TEMPLATE_NAMES } from "@/lib/interakt";
import { Order } from "@/types/order";
import { flagOrderForWhatsAppFailure } from "@/lib/whatsapp-error-handler";

// This endpoint receives an order ID, fetches it from the DB,
// and sends a WhatsApp template. It allows the dispatcher to be decoupled
// from having the entire order object payload.
export async function POST(request: NextRequest) {
    try {
        const payload = await request.json();
        const orderId = payload.orderId as string;
        const overridePhone = payload.overridePhone as string | undefined;
        const templateType = (payload.templateType as 'confirmation' | 'reminder' | 'discount') || 'confirmation';

        if (!orderId) {
            return NextResponse.json({ success: false, error: "Missing orderId" }, { status: 400 });
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // 1. Fetch the order details
        const { data: orderData, error: fetchError } = await supabaseAdmin
            .from("orders")
            .select("*")
            .eq("id", orderId)
            .single();

        if (fetchError || !orderData) {
            console.error("[WhatsApp Dispatcher] Failed to fetch order:", fetchError);
            return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
        }

        const order = orderData as Order;

        // 2. Check if whatsapp_auto_send is enabled
        const { data: settings } = await supabaseAdmin
            .from("app_settings")
            .select("value")
            .eq("key", "whatsapp_auto_send")
            .single();

        const autoSendEnabled = settings?.value?.enabled === true;

        if (!autoSendEnabled) {
            console.log(`[WhatsApp Dispatcher] Skipping order ${orderId} because whatsapp_auto_send is disabled.`);
            return NextResponse.json({ success: true, message: "Skipped (disabled)" });
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

            // Flag order for manual review
            await flagOrderForWhatsAppFailure(order.id, result, order.order_id, overridePhone || order.phone);

            return NextResponse.json({ success: false, error: result.error }, { status: 500 });
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
        return NextResponse.json({ success: true });

    } catch (err: unknown) {
        console.error("[WhatsApp Dispatcher] Critical error:", err);
        return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}
