import { NextRequest, NextResponse } from "next/server";
import { sendTemplateMessage, TEMPLATE_NAMES, type TemplateType } from "@/lib/interakt";
import type { Order } from "@/types/order";
import { flagOrderForWhatsAppFailure, clearWhatsAppFailureFlags } from "@/lib/whatsapp-error-handler";
import { createSupabaseServiceClient, createSupabaseServerClientWithToken, verifyAccessToken } from "@/lib/supabase-server";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import { followUpStamp, senderDisplayName } from "@/lib/follow-up-state";
import { ORDER_READ_COLUMNS } from "@/lib/repositories/order-columns";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

/**
 * Sends a WhatsApp template for one order.
 *
 * This had no authentication at all, and the middleware matcher excludes
 * `/api`, so nothing else was checking. Anyone who knew the URL could POST an
 * arbitrary `order` with an arbitrary `overridePhone` and make the merchant's
 * verified WhatsApp sender deliver a template to any number in the world, billed
 * to their Interakt account and logged as if staff had sent it.
 *
 * Three things close that, and all three are needed:
 *
 *  1. The caller must be signed in.
 *  2. The order is re-read from the database under that caller's own RLS, using
 *     only the id from the payload. A signed-in user from one tenant could
 *     otherwise post another tenant's order — or an order that never existed —
 *     and the route would have taken the body's word for it.
 *  3. `overridePhone` must be a number already on that order. Without this the
 *     endpoint stays an open relay for anyone with a login, which is a smaller
 *     hole but the same hole.
 */
export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get("Authorization")?.replace("Bearer ", "");
        if (!token) {
            return NextResponse.json({ success: false, error: "Missing Authorization header" }, { status: 401 });
        }
        const { user, error: authError } = await verifyAccessToken(token);
        if (authError || !user) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const payload = await request.json();
        const requestedOrderId = (payload.order as Order | undefined)?.id;
        const overridePhone = payload.overridePhone as string | undefined;
        const templateType = (payload.templateType as TemplateType) || 'confirmation';
        const discountPercent = payload.discountPercent as number | undefined;
        const customPrice = payload.customPrice as number | undefined;

        if (!requestedOrderId) {
            return NextResponse.json(
                { success: false, error: "Invalid order data" },
                { status: 400 }
            );
        }

        // Read under the caller's RLS, so tenant scoping is enforced by the same
        // policy the rest of the app uses rather than re-implemented here.
        const { data: order, error: orderError } = await createSupabaseServerClientWithToken(token)
            .from("orders")
            .select(ORDER_READ_COLUMNS)
            .eq("id", requestedOrderId)
            .maybeSingle<Order>();

        if (orderError || !order || !order.phone) {
            return NextResponse.json(
                { success: false, error: "Order not found" },
                { status: 404 }
            );
        }

        if (overridePhone) {
            const allowed = [order.phone, order.secondary_phone]
                .filter(Boolean)
                .map((p) => normalizePhoneForSearch(p as string));
            if (!allowed.includes(normalizePhoneForSearch(overridePhone))) {
                return NextResponse.json(
                    { success: false, error: "overridePhone must be a number on this order" },
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
                    // Which path sent it, and on whose behalf: without these the
                    // log cannot tell an agent's send from an automatic one.
                    source: "interakt-send",
                    sentByUserId: user.id,
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

            // Who sent it, from the verified token rather than the request body,
            // so the card's sender avatar cannot be forged. Read under the
            // caller's own RLS: a profile they cannot see is not theirs to claim.
            const { data: senderProfile, error: profileError } = await createSupabaseServerClientWithToken(token)
                .from("user_profiles")
                .select("display_name, avatar_url")
                .eq("id", user.id)
                .maybeSingle<{ display_name: string | null; avatar_url: string | null }>();
            if (profileError) {
                // Still attributed — under the account email instead of the display name.
                console.error("[Interakt Send API] Failed to read sender profile:", profileError);
            }
            const senderName = senderDisplayName(senderProfile, user.email);

            await supabaseAdmin()
                .from("orders")
                .update({
                    ...(shouldUpdateStatus ? { status: "contacted" } : {}),
                    contact_count: newContactCount,
                    last_contacted_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    ...(senderName
                        ? followUpStamp({ name: senderName, avatar: senderProfile?.avatar_url }, templateType)
                        : {}),
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
