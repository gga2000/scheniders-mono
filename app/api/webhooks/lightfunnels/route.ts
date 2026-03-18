import { NextRequest, NextResponse } from "next/server";
import {
    parseLightFunnelsPayload,
    createOrderFromWebhook,
    logWebhookRequest,
} from "@/lib/webhook-handler";
import { env } from "@/lib/env";
import { createClient } from "@supabase/supabase-js";
import { scheduleCheckoutProcessing } from "@/lib/qstash";
import { triggerImmediateConfirmation } from "@/lib/whatsapp-dispatcher";

// Service role client to bypass RLS when writing to checkout_queue
const supabaseAdmin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// How long to wait before importing (gives customer time to finish filling form)
const CHECKOUT_DELAY_MINUTES = 2;

/**
 * LightFunnels Webhook Endpoint
 *
 * URL: POST /api/webhooks/lightfunnels
 */

export async function POST(request: NextRequest) {
    try {
        // 1. Verify webhook secret for security (optional - Lightfunnels may not send one)
        const secret = request.headers.get("x-webhook-secret");
        const expectedSecret = env.LIGHTFUNNELS_WEBHOOK_SECRET;

        // TEMPORARILY DISABLED: Accept all webhooks to get orders flowing
        // Only reject if secret is sent AND doesn't match
        // TODO: Re-enable strict checking once custom headers are configured in Lightfunnels
        if (expectedSecret && secret && secret !== expectedSecret) {
            console.error("[Webhook] Webhook secret mismatch");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!secret && expectedSecret) {
            console.warn("[Webhook] No webhook secret provided in request - accepting anyway (security risk)");
        }

        // 2. Parse request body
        const payload = await request.json();

        // Log raw payload for debugging (only when logging is enabled)
        if (env.WEBHOOK_LOGGING_ENABLED === "true") {
            console.log("[Webhook] Raw payload keys:", Object.keys(payload).join(', '));
            if (payload.node) {
                console.log("[Webhook] Node type:", typeof payload.node, "Node keys:", typeof payload.node === 'object' ? Object.keys(payload.node).join(', ') : String(payload.node));
            }
        }

        // 3. Validate payload structure
        let webhookData;
        try {
            webhookData = parseLightFunnelsPayload(payload);
        } catch (error) {
            // Handle Lightfunnels "Dummy" verification request
            if (error instanceof Error && error.message === "is_test_payload") {
                return NextResponse.json(
                    { success: true, message: "Webhook connection verified" },
                    { status: 200 }
                );
            }

            // Handle checkout webhook — queue for delayed import
            // Lightfunnels fires checkout/created while the customer is still filling the form.
            // We queue it and process after a delay to ensure complete data.
            if (error instanceof Error && error.message.startsWith("fetch_checkout:")) {
                const checkoutId = error.message.replace("fetch_checkout:", "");
                const processAfter = new Date(Date.now() + CHECKOUT_DELAY_MINUTES * 60 * 1000).toISOString();

                const { error: queueErr } = await supabaseAdmin
                    .from('checkout_queue')
                    .upsert(
                        { checkout_id: checkoutId, process_after: processAfter, queued_at: new Date().toISOString() },
                        { onConflict: 'checkout_id', ignoreDuplicates: false }
                    );

                if (queueErr) {
                    console.error("[Webhook] Failed to queue checkout:", checkoutId, queueErr);
                } else {
                    console.log(`[Webhook] Checkout queued for import in ${CHECKOUT_DELAY_MINUTES}min:`, checkoutId);

                    // Schedule QStash delayed callback to trigger processing
                    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
                        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
                    if (baseUrl) {
                        await scheduleCheckoutProcessing(
                            CHECKOUT_DELAY_MINUTES * 60 + 30, // +30s buffer past process_after
                            baseUrl
                        );
                    } else {
                        console.warn("[Webhook] No NEXT_PUBLIC_SITE_URL or VERCEL_URL set, cannot schedule QStash callback");
                    }
                }

                return NextResponse.json(
                    { success: true, message: "Checkout queued for import" },
                    { status: 200 }
                );
            } else {
                return NextResponse.json(
                    { error: error instanceof Error ? error.message : "Invalid payload format" },
                    { status: 400 }
                );
            }
        }

        if (!webhookData) {
            return NextResponse.json(
                { error: "Invalid payload format (unknown error)" },
                { status: 400 }
            );
        }

        // 4. Create order from webhook
        const result = await createOrderFromWebhook(webhookData);

        // 5. Log request (for debugging)
        if (env.WEBHOOK_LOGGING_ENABLED === "true") {
            logWebhookRequest(payload, result);
        }

        // 6. Handle result
        if (!result.success) {
            // Check if it's a duplicate (not really an error)
            if (result.duplicate) {
                return NextResponse.json(
                    {
                        success: true,
                        message: "Order already exists",
                        duplicate: true,
                    },
                    { status: 200 }
                );
            }

            // Check if blacklisted
            if (result.error === "Customer is blacklisted") {
                return NextResponse.json(
                    {
                        success: false,
                        error: "Customer is blacklisted",
                        reason: result.reason,
                    },
                    { status: 403 }
                );
            }

            // Other errors
            return NextResponse.json(
                {
                    success: false,
                    error: result.error,
                },
                { status: 500 }
            );
        }

        // Trigger WhatsApp confirmation immediately in the background
        if (result.order && result.order.id) {
            await triggerImmediateConfirmation(result.order.id, result.order.phone);
        }

        // 7. Success response
        return NextResponse.json(
            {
                success: true,
                message: "Order created successfully",
                order_id: result.order?.order_id,
                order_data: result.order,
            },
            { status: 201 }
        );

    } catch (error) {
        console.error("Webhook error:", error);
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
 * Handle non-POST requests
 */
export async function GET() {
    return NextResponse.json(
        {
            message: "LightFunnels Webhook Endpoint",
            method: "POST only",
            status: "active",
        },
        { status: 200 }
    );
}
