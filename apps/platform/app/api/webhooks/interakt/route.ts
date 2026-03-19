import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { formatPhoneToStandard } from "@/lib/order-utils";

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

// Service role client to bypass RLS
const supabaseAdmin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// =============================================
// TYPES
// =============================================

interface InteraktWebhookPayload {
    type?: string; // "message_received" | "message_api_clicked"
    data?: {
        customer?: {
            phone_number?: string;
            country_code?: string;
            id?: string;
            traits?: {
                name?: string;
                [key: string]: unknown;
            };
        };
        message?: {
            id?: string;
            type?: string; // "text" | "button_reply" | "interactive_reply"
            text?: string;
            button_reply?: {
                id?: string;
                title?: string;
            };
            interactive_reply?: {
                id?: string;
                title?: string;
            };
            context?: {
                callback_data?: string;
                [key: string]: unknown;
            };
            [key: string]: unknown;
        };
    };
}

// Button text patterns to match (normalized)
const CONFIRM_PATTERNS = ["تأكيد", "تاكيد", "confirm", "تأكيد ✅"];
const CANCEL_PATTERNS = ["إلغاء", "الغاء", "cancel", "إلغاء ❌"];

// =============================================
// HELPERS
// =============================================

/**
 * Extract the button text or message text from the webhook payload.
 * Interakt uses varying payload structures depending on webhook type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractResponseText(data: any): string | null {
    if (!data) return null;

    const msg = data.message || data.msg || {};

    // Quick reply button tap (standard format)
    if (msg.button_reply?.title) {
        return msg.button_reply.title.trim();
    }

    // Interactive reply (list select, etc.)
    if (msg.interactive_reply?.title) {
        return msg.interactive_reply.title.trim();
    }

    // Interakt "button_text" field (used in message_api_clicked)
    if (msg.button_text) {
        return msg.button_text.trim();
    }

    // Interakt "button" field
    if (msg.button?.text) {
        return msg.button.text.trim();
    }

    // Interakt "button_title" field
    if (msg.button_title) {
        return msg.button_title.trim();
    }

    // Check data-level fields (some Interakt events put button info at data level)
    if (data.button_text) {
        return data.button_text.trim();
    }

    if (data.button_reply?.title) {
        return data.button_reply.title.trim();
    }

    // Plain text reply
    if (msg.text && typeof msg.text === "string") {
        return msg.text.trim();
    }

    // Last resort: check message_status or any text-like field in message
    if (msg.message && typeof msg.message === "string" && !msg.message.startsWith("[")) {
        return msg.message.trim();
    }

    console.warn("[Interakt Webhook] Could not extract response text from payload:", JSON.stringify(data, null, 2));
    return null;
}

/**
 * Extract callback_data (order UUID) from the webhook payload
 */
function extractCallbackData(message: InteraktWebhookPayload["data"]): string | null {
    return message?.message?.context?.callback_data || null;
}

/**
 * Extract customer phone from the webhook payload
 */
function extractPhone(customer: InteraktWebhookPayload["data"]): string | null {
    const c = customer?.customer;
    if (!c?.phone_number) return null;

    let phone = c.phone_number.replace(/\D/g, "");

    // Ensure it has country code
    if (c.country_code) {
        const cc = c.country_code.replace(/\D/g, "");
        if (!phone.startsWith(cc)) {
            phone = cc + phone;
        }
    }

    return phone || null;
}

/**
 * Match response text against known patterns
 */
function matchResponse(text: string): "confirmed" | "cancelled" | null {
    const normalized = text.replace(/\s+/g, " ").trim().toLowerCase();

    for (const pattern of CONFIRM_PATTERNS) {
        if (normalized.includes(pattern.toLowerCase())) {
            return "confirmed";
        }
    }

    for (const pattern of CANCEL_PATTERNS) {
        if (normalized.includes(pattern.toLowerCase())) {
            return "cancelled";
        }
    }

    return null;
}

/**
 * Find the order by UUID (from callback_data) or by phone number
 */
async function findOrder(
    callbackData: string | null,
    phone: string | null
): Promise<{ id: string; order_id: string; status: string } | null> {
    // Strategy 1: Direct lookup by UUID from callback_data
    if (callbackData) {
        const { data, error } = await supabaseAdmin
            .from("orders")
            .select("id, order_id, status")
            .eq("id", callbackData)
            .single();

        if (!error && data) {
            return data;
        }
        console.warn(`[Interakt Webhook] callback_data UUID not found: ${callbackData}`);
    }

    // Strategy 2: Find the most recent "contacted" order for this phone
    if (phone) {
        // Normalize the phone for matching
        const standardPhone = formatPhoneToStandard(phone);

        const { data, error } = await supabaseAdmin
            .from("orders")
            .select("id, order_id, status")
            .eq("status", "contacted")
            .or(`phone.eq.${standardPhone},phone.eq.${phone}`)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (!error && data) {
            return data;
        }
        console.warn(`[Interakt Webhook] No contacted order found for phone: ${phone}`);
    }

    return null;
}

/**
 * Update order status and log the WhatsApp interaction
 */
async function updateOrderStatus(
    orderId: string,
    orderIdDisplay: string,
    newStatus: "confirmed" | "cancelled",
    phone: string | null,
    payload: InteraktWebhookPayload
): Promise<{ success: boolean; error?: string }> {
    // Update the order status
    const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update({
            status: newStatus,
            updated_at: new Date().toISOString(),
            ...(newStatus === "cancelled" ? { cancelled_at: new Date().toISOString() } : {}),
        })
        .eq("id", orderId);

    if (updateError) {
        console.error(`[Interakt Webhook] Failed to update order ${orderIdDisplay}:`, updateError);
        return { success: false, error: updateError.message };
    }

    // Log status change in order_status_history
    await supabaseAdmin.from("order_status_history").insert({
        order_id: orderId,
        from_status: "contacted",
        to_status: newStatus,
        changed_by: "whatsapp_bot",
        notes: `Customer responded via WhatsApp: ${newStatus === "confirmed" ? "تأكيد" : "إلغاء"}`,
    });

    // Log to whatsapp_logs (non-critical — don't fail if logging fails)
    try {
        await supabaseAdmin.from("whatsapp_logs").insert({
            order_id: orderIdDisplay,
            order_uuid: orderId,
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

    return { success: true };
}

// =============================================
// ROUTE HANDLERS
// =============================================

export async function POST(request: NextRequest) {
    try {
        // 1. Optional: Verify webhook secret
        const webhookSecret = env.INTERAKT_WEBHOOK_SECRET;
        if (webhookSecret) {
            const providedSecret =
                request.headers.get("x-webhook-secret") ||
                request.headers.get("x-interakt-secret");

            if (providedSecret && providedSecret !== webhookSecret) {
                console.error("[Interakt Webhook] Secret mismatch logging headers:", {
                    providedSecretPrefix: providedSecret ? providedSecret.substring(0, 3) + "***" : "none",
                    hasWebhookSecret: !!request.headers.get("x-webhook-secret"),
                    hasInteraktSecret: !!request.headers.get("x-interakt-secret"),
                    allHeaders: Array.from(request.headers.keys()),
                });
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        // 2. Parse payload
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = (await request.json()) as any;

        // Log ALL webhook payloads for debugging to DB
        try {
            await supabaseAdmin.from("whatsapp_logs").insert({
                order_id: "debug_all_raw",
                phone: payload.data?.customer?.phone_number || "unknown",
                template_name: "cod_order_confirm",
                direction: "inbound",
                status: "received",
                payload: payload as unknown as Record<string, unknown>,
            });
            console.error("[Interakt Webhook] Inserted raw payload to whatsapp_logs DB");
        } catch (e) {
            console.error("[Interakt Webhook] Failed to insert raw payload", e);
        }

        // 3. Handle delivery status webhooks
        const webhookType = payload.type || payload.eventType || "";

        // Interakt's exact webhook type names for template messages sent via API
        const DELIVERY_STATUS_TYPES: Record<string, string> = {
            "message_api_sent": "sent",
            "message_api_delivered": "delivered",
            "message_api_read": "read",
            "message_api_failed": "failed",
            // Button click from template
            "message_api_clicked": "button_clicked",
        };

        const mappedStatus = DELIVERY_STATUS_TYPES[webhookType];

        // If it's a delivery status event, log it to whatsapp_logs
        if (mappedStatus && webhookType !== "message_api_clicked") {
            try {
                const phone = payload.data?.customer?.phone_number ||
                    payload.endCustomerPhone ||
                    "unknown";
                const callbackData = payload.data?.message?.context?.callback_data ||
                    payload.data?.callbackData ||
                    payload.callbackData;

                // Log to whatsapp_logs
                await supabaseAdmin.from("whatsapp_logs").insert({
                    order_id: callbackData || "unknown",
                    phone: phone,
                    template_name: "cod_order_confirm",
                    direction: "status_update",
                    status: mappedStatus,
                    payload: payload as unknown as Record<string, unknown>,
                });

                console.log(`[Interakt Webhook] 📊 Delivery status: ${mappedStatus} for phone ${phone}`);
            } catch (logErr) {
                console.warn("[Interakt Webhook] Failed to log delivery status:", logErr);
            }

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
            // Log unrecognized types to database for debugging
            try {
                await supabaseAdmin.from("whatsapp_logs").insert({
                    order_id: "debug",
                    phone: payload.data?.customer?.phone_number || "unknown",
                    template_name: "cod_order_confirm",
                    direction: "webhook_debug",
                    status: webhookType || "unknown_type",
                    payload: payload as unknown as Record<string, unknown>,
                });
            } catch (_) { /* ignore logging errors */ }

            return NextResponse.json(
                { success: true, message: `Webhook type "${webhookType}" acknowledged` },
                { status: 200 }
            );
        }

        // 4. Extract response text
        const responseText = extractResponseText(payload.data);
        console.error(`[Interakt Webhook] 🔍 Step 4 - Extracted response text: "${responseText}"`);

        if (!responseText) {
            console.error(`[Interakt Webhook] ⚠️ No response text found in payload`);
            return NextResponse.json(
                { success: true, message: "No actionable text in message" },
                { status: 200 }
            );
        }

        // 5. Match response to action
        const action = matchResponse(responseText);
        console.error(`[Interakt Webhook] 🔍 Step 5 - Matched action: ${action || 'none'} (from text: "${responseText}")`);

        if (!action) {
            // Customer sent something other than confirm/cancel
            // Leave for team to handle manually
            console.error(
                `[Interakt Webhook] ⚠️ Unmatched response: "${responseText}" from ${payload.data?.customer?.phone_number}`
            );
            return NextResponse.json(
                { success: true, message: "Response does not match confirm/cancel — manual handling required" },
                { status: 200 }
            );
        }

        // 6. Find the order
        const callbackData = extractCallbackData(payload.data);
        const phone = extractPhone(payload.data);
        console.error(`[Interakt Webhook] 🔍 Step 6 - Looking for order with callback_data: "${callbackData}", phone: "${phone}"`);

        const order = await findOrder(callbackData, phone);

        if (!order) {
            console.warn(
                `[Interakt Webhook] ❌ No matching order found. callback_data: ${callbackData}, phone: ${phone}`
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
export async function GET() {
    return NextResponse.json(
        {
            message: "Interakt WhatsApp Webhook Endpoint",
            method: "POST only",
            status: "active",
        },
        { status: 200 }
    );
}
