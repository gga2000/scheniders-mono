import { NextRequest, NextResponse } from "next/server";
import { sendTemplateMessage } from "@/lib/interakt";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Order } from "@/types/order";

// Service role client to bypass RLS for logging
const supabaseAdmin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json();
        const order = payload.order as Order;

        if (!order || !order.id || !order.phone) {
            return NextResponse.json(
                { success: false, error: "Invalid order data" },
                { status: 400 }
            );
        }

        // Send the template via Interakt
        const result = await sendTemplateMessage(order);

        // Log the outbound message to supabase
        try {
            await supabaseAdmin.from("whatsapp_logs").insert({
                order_id: order.order_id,
                order_uuid: order.id,
                phone: order.phone,
                template_name: "cod_order_confirm",
                direction: "outbound",
                status: result.success ? "sent" : "failed",
                interakt_message_id: result.messageId || null,
                payload: {
                    error: result.error,
                    statusCode: result.statusCode,
                },
            });
        } catch (logErr) {
            console.error("[Interakt Send API] Failed to log outbound message:", logErr);
        }

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error || "Failed to send template" },
                { status: 500 }
            );
        }

        // Auto-update order status to "contacted" on successful send
        try {
            const previousStatus = order.status || "new";

            // Only update if not already contacted or beyond
            if (previousStatus !== "contacted" && previousStatus !== "confirmed" && previousStatus !== "cancelled") {
                await supabaseAdmin
                    .from("orders")
                    .update({
                        status: "contacted",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", order.id);

                // Log status change in order_status_history
                await supabaseAdmin.from("order_status_history").insert({
                    order_id: order.id,
                    from_status: previousStatus,
                    to_status: "contacted",
                    changed_by: "whatsapp_bot",
                    notes: "تم إرسال رسالة التأكيد عبر واتساب — Auto-updated on WhatsApp template send",
                });

                console.log(`[Interakt Send API] ✅ Order ${order.order_id} status updated: ${previousStatus} → contacted`);
            }
        } catch (statusErr) {
            console.error("[Interakt Send API] Failed to update order status:", statusErr);
            // Don't fail the request — message was sent successfully
        }

        return NextResponse.json(
            { success: true, messageId: result.messageId, statusUpdated: true },
            { status: 200 }
        );
    } catch (error) {
        console.error("[Interakt Send API] Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}
