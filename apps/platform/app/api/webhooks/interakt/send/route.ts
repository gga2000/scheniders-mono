import { NextRequest, NextResponse } from "next/server";
import { sendTemplateMessage, TEMPLATE_NAMES, type TemplateType } from "@/lib/interakt";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { scheduleFollowUp, REMINDER_DELAY_HOURS, DISCOUNT_DELAY_HOURS } from "@/lib/qstash";
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
        const overridePhone = payload.overridePhone as string | undefined;
        const templateType = (payload.templateType as TemplateType) || 'confirmation';
        const discountPercent = payload.discountPercent as number | undefined;
        const customPrice = payload.customPrice as number | undefined;

        if (!order || !order.id || !order.phone) {
            return NextResponse.json(
                { success: false, error: "Invalid order data" },
                { status: 400 }
            );
        }

        const templateName = TEMPLATE_NAMES[templateType];

        // Send the template via Interakt
        const result = await sendTemplateMessage(order, templateType, overridePhone, discountPercent, customPrice);

        // Log the outbound message to supabase
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
                    discountPercent,
                    customPrice,
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

        // Auto-update order status + increment contact_count atomically
        try {
            const previousStatus = order.status || "new";
            const newContactCount = (order.contact_count || 0) + 1;

            // Update status to "contacted" if not already beyond that stage
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

            // Log status change in order_status_history (only if status changed)
            if (shouldUpdateStatus) {
                await supabaseAdmin.from("order_status_history").insert({
                    order_id: order.id,
                    from_status: previousStatus,
                    to_status: "contacted",
                    changed_by: "whatsapp_bot",
                    notes: `تم إرسال قالب ${templateType === 'confirmation' ? 'التأكيد' : templateType === 'reminder' ? 'التذكير' : 'العرض الخاص'} عبر واتساب`,
                });
            }

            console.log(`[Interakt Send API] Order ${order.order_id}: contact_count → ${newContactCount}${shouldUpdateStatus ? `, status: ${previousStatus} → contacted` : ''}`);

            // Schedule follow-up via QStash (only if auto-send is enabled)
            try {
                const { data: settings } = await supabaseAdmin
                    .from("app_settings")
                    .select("value")
                    .eq("key", "whatsapp_auto_send")
                    .single();

                const autoSendEnabled = settings?.value?.enabled === true;

                if (autoSendEnabled) {
                    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
                        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

                    if (baseUrl) {
                        if (templateType === 'confirmation') {
                            // Schedule reminder in 6 hours
                            await scheduleFollowUp(order.id, 'reminder', REMINDER_DELAY_HOURS * 3600, baseUrl);
                        } else if (templateType === 'reminder') {
                            // Schedule discount in 4 more hours (10h total from first contact)
                            const discountDelay = (DISCOUNT_DELAY_HOURS - REMINDER_DELAY_HOURS) * 3600;
                            await scheduleFollowUp(order.id, 'discount', discountDelay, baseUrl);
                        }
                    }
                }
            } catch (scheduleErr) {
                console.error("[Interakt Send API] Failed to schedule follow-up:", scheduleErr);
            }
        } catch (statusErr) {
            console.error("[Interakt Send API] Failed to update order status:", statusErr);
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
