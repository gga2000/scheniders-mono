import { NextRequest, NextResponse } from "next/server";
import {
    INTERAKT_DELIVERY_STATUSES,
    recordWhatsAppDeliveryReceipt,
} from "@/lib/whatsapp-delivery-receipts";
import { maskIraqiMobile } from "@scheniders/shared";
import { formatPhoneToStandard } from "@/lib/order-utils";
import { env } from "@/lib/env";
import { constantTimeEqual } from "@/lib/webhook-auth";
import { sharedSenderAllows } from "@/lib/interakt";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
    extractCallbackData,
    extractPhone,
    extractResponseText,
    matchResponse,
    parseInteraktInbound,
    type InteraktInbound,
} from "@/lib/interakt-inbound";
import { withFailureReport } from "@/lib/job-monitor";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

/**
 * Interakt Inbound Webhook Endpoint
 *
 * Handles incoming webhooks from Interakt when customers interact
 * with WhatsApp template messages (button clicks, text replies).
 *
 * URL: POST /api/webhooks/interakt
 *
 * Webhook Types:
 * - "message_received"    → Customer sent a text or tapped a quick reply
 * - "message_api_clicked" → Customer tapped a button from a template sent via API
 *
 * Flow:
 * 1. Customer taps "تأكيد ✅"  → Order status → confirmed
 * 2. Customer taps "إلغاء ❌"  → Order status → cancelled
 * 3. Any other reply            → No status change (team handles manually)
 */


/**
 * Find the order by UUID (from callback_data) or by phone number
 */
async function findOrder(
    callbackData: string | null,
    phone: string | null
): Promise<{ id: string; order_id: string; status: string; tenant_id: string | null } | null> {
    // Strategy 1: Direct lookup by UUID from callback_data
    if (callbackData) {
        const { data, error } = await supabaseAdmin()
            .from("orders")
            .select("id, order_id, status, tenant_id")
            .eq("id", callbackData)
            .single();

        // Only stores allowed on the shared WhatsApp number send from it, so a
        // reply to it can only concern their orders.
        if (!error && data && sharedSenderAllows(data.tenant_id)) {
            return data;
        }
        console.warn(`[Interakt Webhook] callback_data UUID not found: ${callbackData}`);
    }

    // Strategy 2: Find the most recent "contacted" order for this phone.
    //
    // This route carries no tenant in its URL and runs under the service role,
    // so this lookup spans EVERY tenant. "Most recent contacted order for this
    // phone" is only a safe answer while exactly one merchant is waiting on that
    // number; with two, a customer replying "نعم" to one merchant could confirm
    // the other merchant's order. 160 phone numbers already exist under more
    // than one tenant, though none currently has a `contacted` order in more
    // than one — so this is a latent hazard, not a live one.
    //
    // It cannot be tenant-scoped here, because the tenant is genuinely unknown:
    // that is what /api/webhooks/interakt/[tenantId] is for. What it CAN do is
    // refuse to guess. Ambiguity resolves to "no match", which leaves the order
    // for a human, instead of silently confirming the wrong merchant's.
    if (phone) {
        // Normalize the phone for matching
        const standardPhone = formatPhoneToStandard(phone);

        const { data, error } = await supabaseAdmin()
            .from("orders")
            .select("id, order_id, status, tenant_id")
            .eq("status", "contacted")
            .or(`phone.eq.${standardPhone},phone.eq.${phone}`)
            .order("created_at", { ascending: false })
            .limit(5);

        const mine = (data ?? []).filter((o) => sharedSenderAllows(o.tenant_id));
        if (!error && mine.length > 0) {
            const tenants = new Set(mine.map(o => o.tenant_id));
            if (tenants.size > 1) {
                console.error(
                    `[Interakt Webhook] Refusing to guess: phone ${maskIraqiMobile(phone) ?? "unknown"} has contacted orders in ${tenants.size} tenants`,
                );
                return null;
            }
            return mine[0];
        }
        console.warn(`[Interakt Webhook] No contacted order found for phone: ${maskIraqiMobile(phone) ?? "unknown"}`);
    }

    return null;
}

/**
 * Update order status and log the WhatsApp interaction
 */
async function updateOrderStatus(
    orderId: string,
    orderIdDisplay: string,
    tenantId: string,
    newStatus: "confirmed" | "cancelled",
    phone: string | null,
    payload: InteraktInbound
): Promise<{ success: true; updated: boolean } | { success: false; error: string }> {
    // Only while the order is still `contacted`: a second tap, or staff moving the
    // order on since it was read, must not be overwritten by this reply.
    const { data: moved, error: updateError } = await supabaseAdmin()
        .from("orders")
        .update({
            status: newStatus,
            updated_at: new Date().toISOString(),
            ...(newStatus === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}),
        })
        .eq("id", orderId)
        .eq("tenant_id", tenantId)
        .eq("status", "contacted")
        .select("id");

    if (updateError) {
        console.error(`[Interakt Webhook] Failed to update order ${orderIdDisplay}:`, updateError);
        return { success: false, error: updateError.message };
    }
    if (!moved || moved.length === 0) return { success: true, updated: false };

    // Log status change in order_status_history
    await supabaseAdmin().from("order_status_history").insert({
        order_id: orderId,
        from_status: "contacted",
        to_status: newStatus,
        changed_by: "whatsapp_bot",
        // Both history and whatsapp_logs are tenant-scoped by RLS: a row
        // without the order's tenant is invisible to the merchant (NEW-P1-17).
        tenant_id: tenantId,
        notes: `Customer responded via WhatsApp: ${newStatus === "confirmed" ? "تأكيد" : "إلغاء"}`,
    });

    // Log to whatsapp_logs (non-critical — don't fail if logging fails)
    try {
        await supabaseAdmin().from("whatsapp_logs").insert({
            order_id: orderIdDisplay,
            order_uuid: orderId,
            tenant_id: tenantId,
            phone: phone || "unknown",
            template_name: "cod_order_confirm",
            direction: "inbound",
            status: "received",
            payload: payload as unknown as Record<string, unknown>,
        });
    } catch (logErr) {
        console.warn("[Interakt Webhook] Failed to log to whatsapp_logs:", logErr);
    }

    console.log(
        `[Interakt Webhook] ✅ Order ${orderIdDisplay} status updated: contacted → ${newStatus}`
    );

    return { success: true, updated: true };
}

// =============================================
// ROUTE HANDLERS
// =============================================

async function handlePost(request: NextRequest) {
    try {
        // 1. Verify webhook secret — mandatory.
        const webhookSecret = env.INTERAKT_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error("[Interakt Webhook] INTERAKT_WEBHOOK_SECRET not configured");
            return NextResponse.json(
                { error: "Webhook receiver not configured" },
                { status: 503 },
            );
        }
        const providedSecret =
            request.headers.get("x-webhook-secret") ||
            request.headers.get("x-interakt-secret");
        if (!providedSecret || !constantTimeEqual(providedSecret, webhookSecret)) {
            console.error("[Interakt Webhook] Secret missing or mismatch:", {
                hasWebhookSecret: !!request.headers.get("x-webhook-secret"),
                hasInteraktSecret: !!request.headers.get("x-interakt-secret"),
            });
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Parse payload
        const payload = parseInteraktInbound(await request.json());

        // 3. Handle delivery status webhooks
        const webhookType = payload.type || payload.eventType || "";

        const mappedStatus = INTERAKT_DELIVERY_STATUSES[webhookType];

        // If it's a delivery status event, log it to whatsapp_logs. OBS-3: the
        // row written here used to carry no message id and a hardcoded template
        // name, so it could be counted but never joined to the send.
        if (mappedStatus) {
            await recordWhatsAppDeliveryReceipt(payload, mappedStatus);
            console.log(`[Interakt Webhook] 📊 Delivery status: ${mappedStatus}`);

            return NextResponse.json(
                { success: true, message: `Delivery status "${webhookType}" logged` },
                { status: 200 }
            );
        }

        // 4. Only process customer interaction types beyond this point
        if (
            webhookType !== "message_received" &&
            webhookType !== "message_api_clicked" &&
            !webhookType.toLowerCase().includes("button") &&
            !webhookType.toLowerCase().includes("click")
        ) {
            // Record that an unrecognised type arrived: its type only, never the
            // customer's phone, name or message.
            const { error: debugLogError } = await supabaseAdmin().from("whatsapp_logs").insert({
                order_id: "debug",
                phone: "unknown",
                template_name: "cod_order_confirm",
                direction: "webhook_debug",
                status: webhookType || "unknown_type",
                payload: { type: webhookType || null },
            });
            if (debugLogError) console.warn("[Interakt Webhook] Failed to log unrecognised type:", debugLogError.message);

            return NextResponse.json(
                { success: true, message: `Webhook type "${webhookType}" acknowledged` },
                { status: 200 }
            );
        }

        // 4. Extract response text
        const responseText = extractResponseText(payload.data);

        if (!responseText) {
            console.error(`[Interakt Webhook] ⚠️ No response text found in payload`);
            return NextResponse.json(
                { success: true, message: "No actionable text in message" },
                { status: 200 }
            );
        }

        // 5. Match response to action
        const action = matchResponse(responseText);
        console.log(`[Interakt Webhook] Matched action: ${action || "none"}`);

        if (!action) {
            // Customer sent something other than confirm/cancel
            // Leave for team to handle manually
            console.error(
                `[Interakt Webhook] Unmatched response from ${maskIraqiMobile(payload.data?.customer?.phone_number) ?? "unknown"}`
            );
            return NextResponse.json(
                { success: true, message: "Response does not match confirm/cancel — manual handling required" },
                { status: 200 }
            );
        }

        // 6. Find the order
        const callbackData = extractCallbackData(payload.data);
        const phone = extractPhone(payload.data);

        const order = await findOrder(callbackData, phone);

        if (!order || !order.tenant_id) {
            console.warn(
                `[Interakt Webhook] No matching order found. callback_data: ${callbackData}, phone: ${maskIraqiMobile(phone) ?? "unknown"}`
            );
            return NextResponse.json(
                { success: false, error: "No matching order found" },
                { status: 404 }
            );
        }

        console.log(`[Interakt Webhook] ✅ Found order: ${order.order_id} (UUID: ${order.id}, current status: ${order.status})`);

        // 7. Only update if order is in "contacted" status
        if (order.status !== "contacted") {
            console.log(
                `[Interakt Webhook] Order ${order.order_id} is already "${order.status}", skipping update`
            );
            return NextResponse.json(
                {
                    success: true,
                    message: `Order already in "${order.status}" status`,
                    order_id: order.order_id,
                },
                { status: 200 }
            );
        }

        // 8. Update order status
        const result = await updateOrderStatus(
            order.id,
            order.order_id,
            order.tenant_id,
            action,
            phone,
            payload
        );

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 500 }
            );
        }
        if (!result.updated) {
            return NextResponse.json(
                { success: true, message: "Order was already handled", order_id: order.order_id },
                { status: 200 }
            );
        }

        return NextResponse.json(
            {
                success: true,
                message: `Order ${order.order_id} updated to ${action}`,
                order_id: order.order_id,
                new_status: action,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("[Interakt Webhook] Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Internal server error",
            },
            { status: 500 }
        );
    }
}

/**
 * Health check / verification endpoint
 */
async function handleGet(_request: Request) {
    return NextResponse.json(
        {
            message: "Interakt WhatsApp Webhook Endpoint",
            method: "POST only",
            status: "active",
        },
        { status: 200 }
    );
}

export const GET = withFailureReport("webhook-interakt GET", handleGet);
export const POST = withFailureReport("webhook-interakt", handlePost);
