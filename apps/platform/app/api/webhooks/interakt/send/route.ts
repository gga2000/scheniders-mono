import { NextRequest, NextResponse } from "next/server";
import { sendTemplateMessage, TEMPLATE_NAMES, type TemplateType } from "@/lib/interakt";
import type { Order } from "@/types/order";
import { flagOrderForWhatsAppFailure, clearWhatsAppFailureFlags } from "@/lib/whatsapp-error-handler";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { resolveCallerTenant } from "@/lib/auth/require-caller";
import { normalizePhoneForSearch } from "@/lib/order-utils";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

export async function POST(request: NextRequest) {
    try {
        const payload = await request.json();
        const overridePhone = payload.overridePhone as string | undefined;
        const templateType = (payload.templateType as TemplateType) || 'confirmation';
        const discountPercent = payload.discountPercent as number | undefined;
        const customPrice = payload.customPrice as number | undefined;

        const submittedOrder = payload.order as Order | undefined;
        if (!submittedOrder?.id) {
            return NextResponse.json(
                { success: false, error: "Invalid order data" },
                { status: 400 }
            );
        }

        // This route sends WhatsApp messages with the service-role key. It sits
        // under /api, which the middleware excludes, so without this check it was
        // an open relay: anyone could POST an arbitrary order body — any phone
        // number, any message variables — and have it sent on the tenant's
        // account. Establish the caller from their session cookie, which the
        // client cannot forge, unlike the request body.
        let callerTenantId: string;
        try {
            const { tenantId } = await resolveCallerTenant();
            callerTenantId = tenantId;
        } catch {
            return NextResponse.json(
                { success: false, error: "Not authorized" },
                { status: 401 }
            );
        }

        // Re-read the order from the database rather than trusting the body. The
        // submitted object decides the recipient phone and the template variables,
        // so taking it at face value would let a member of one tenant message
        // anyone at all.
        const { data: storedOrder, error: orderErr } = await supabaseAdmin()
            .from("orders")
            .select("*")
            .eq("id", submittedOrder.id)
            .eq("tenant_id", callerTenantId)
            .single();

        if (orderErr || !storedOrder) {
            return NextResponse.json(
                { success: false, error: "Order not found" },
                { status: 404 }
            );
        }

        const order = storedOrder as Order;
        if (!order.phone) {
            return NextResponse.json(
                { success: false, error: "Order has no phone number" },
                { status: 400 }
            );
        }

        // An override may only redirect the message to one of the order's own
        // numbers (the panel uses it to reach the secondary line). Left open, an
        // authenticated user could send the tenant's templates to any number.
        if (overridePhone) {
            const allowed = [order.phone, order.secondary_phone]
                .filter(Boolean)
                .map(p => normalizePhoneForSearch(p as string));
            if (!allowed.includes(normalizePhoneForSearch(overridePhone))) {
                return NextResponse.json(
                    { success: false, error: "Phone does not belong to this order" },
                    { status: 400 }
                );
            }
        }

        const templateName = TEMPLATE_NAMES[templateType];

        // Send the template via Interakt
        const result = await sendTemplateMessage(order, templateType, overridePhone, discountPercent, customPrice);

        // Log the outbound message to supabase
        try {
            await supabaseAdmin().from("whatsapp_logs").insert({
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
            // Flag order for manual review
            await flagOrderForWhatsAppFailure(order.id, result, order.order_id, overridePhone || order.phone);

            return NextResponse.json(
                { success: false, error: result.error || "Failed to send template" },
                { status: 500 }
            );
        }

        // Clear any previous WhatsApp failure flags since this send succeeded
        await clearWhatsAppFailureFlags(order.id);

        // Auto-update order status + increment contact_count atomically
        try {
            const previousStatus = order.status || "new";
            const newContactCount = (order.contact_count || 0) + 1;

            // Update status to "contacted" if not already beyond that stage
            const shouldUpdateStatus = previousStatus !== "contacted" && previousStatus !== "confirmed" && previousStatus !== "cancelled";

            await supabaseAdmin()
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
                await supabaseAdmin().from("order_status_history").insert({
                    order_id: order.id,
                    from_status: previousStatus,
                    to_status: "contacted",
                    changed_by: "whatsapp_bot",
                    notes: `تم إرسال قالب ${templateType === 'confirmation' ? 'التأكيد' : templateType === 'reminder' ? 'التذكير' : 'العرض الخاص'} عبر واتساب`,
                });
            }

            console.log(`[Interakt Send API] Order ${order.order_id}: contact_count → ${newContactCount}${shouldUpdateStatus ? `, status: ${previousStatus} → contacted` : ''}`);

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
