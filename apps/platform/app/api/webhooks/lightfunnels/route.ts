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
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for webhook processing");
}
const supabaseAdmin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
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
        // 1. Verify webhook secret — mandatory.
        // A misconfigured deployment that's missing LIGHTFUNNELS_WEBHOOK_SECRET
        // must fail loudly, not silently accept anonymous webhooks.
        const expectedSecret = env.LIGHTFUNNELS_WEBHOOK_SECRET;
        if (!expectedSecret) {
            console.error("[Webhook] LIGHTFUNNELS_WEBHOOK_SECRET not configured");
            return NextResponse.json(
                { error: "Webhook receiver not configured" },
                { status: 503 },
            );
        }
        const secret = request.headers.get("x-webhook-secret");
        if (!secret || secret !== expectedSecret) {
            console.error("[Webhook] Webhook secret missing or mismatch");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Parse request body
        const payload = await request.json();

        // DIAGNOSTIC LOGGING - Always log to debug order import issues
        console.log("=========== WEBHOOK RECEIVED ===========");
        console.log("[Webhook] Payload keys:", Object.keys(payload).join(', '));
        if (payload.node) {
            console.log("[Webhook] Node type:", typeof payload.node);
            if (typeof payload.node === 'object') {
                console.log("[Webhook] Node.__typename:", payload.node.__typename);
                console.log("[Webhook] Node.id:", payload.node.id);
                console.log("[Webhook] Node._id:", payload.node._id);
                console.log("[Webhook] Node keys:", Object.keys(payload.node).slice(0, 20).join(', '));
                console.log("[Webhook] Has items:", !!payload.node.items);
                console.log("[Webhook] Has variants:", !!payload.node.variants);
                console.log("[Webhook] Has customer:", !!payload.node.customer);
            } else {
                console.log("[Webhook] Node value:", String(payload.node));
            }
        }
        console.log("========================================");

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
