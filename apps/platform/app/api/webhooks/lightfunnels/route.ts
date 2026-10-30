import { NextRequest, NextResponse } from "next/server";
import {
    parseLightFunnelsPayload,
    createOrderFromWebhook,
    logWebhookRequest,
} from "@/lib/webhook-handler";
import { env } from "@/lib/env";
import { scheduleCheckoutProcessing } from "@/lib/qstash";
import { triggerImmediateConfirmation } from "@/lib/whatsapp-dispatcher";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import {
    enforceWebhookAuth,
    resolveWebhookAuthMode,
    verifyWebhookAuth,
} from "@/lib/webhook-auth";

const ROUTE = "/api/webhooks/lightfunnels";

let _supabaseAdmin: ReturnType<typeof createSupabaseServiceClient> | null = null;
const supabaseAdmin = () => (_supabaseAdmin ??= createSupabaseServiceClient());

// How long to wait before importing (gives customer time to finish filling form)
const CHECKOUT_DELAY_MINUTES = 2;

/**
 * LightFunnels Webhook Endpoint
 *
 * URL: POST /api/webhooks/lightfunnels
 */

export async function POST(request: NextRequest) {
    try {
        // 1. Authenticate. Accepts a `lightfunnels-hmac` signature (only sent for
        // webhooks registered through the LightFunnels API), the shared secret in
        // `x-webhook-secret`, or the shared secret as `?token=` — the form a
        // dashboard automation can carry, since it has no header field. Missing
        // credentials, or no secret configured, are refused unless the
        // explicit monitor opt-out is set; a wrong one is always refused. See
        // lib/webhook-auth.ts.
        const rawBody = await request.text();
        const authResult = verifyWebhookAuth(
            { headers: request.headers, url: request.url, rawBody },
            {
                sharedSecret: env.LIGHTFUNNELS_WEBHOOK_SECRET,
                secretHeaders: ["x-webhook-secret"],
                hmac: {
                    header: "lightfunnels-hmac",
                    secret: env.LIGHTFUNNELS_APP_SECRET,
                    encoding: "base64",
                    acceptReserializedBody: true,
                },
            },
        );
        const authMode = resolveWebhookAuthMode(env.LIGHTFUNNELS_WEBHOOK_AUTH_MODE, env.WEBHOOK_AUTH_MODE);
        const denied = enforceWebhookAuth(ROUTE, request, authResult, authMode);
        if (denied) return denied;

        // 2. Parse request body
        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            return NextResponse.json({ error: "Body is not valid JSON" }, { status: 400 });
        }

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

                // checkout_queue is tenant-scoped: queue the row under the same
                // tenant the order webhook (step 4) and the queue processor use,
                // instead of leaving tenant_id NULL (487 such rows live).
                const queueTenantId = env.LIGHTFUNNELS_TENANT_ID;
                if (!queueTenantId) {
                    console.error("[Webhook] LIGHTFUNNELS_TENANT_ID not configured");
                    return NextResponse.json(
                        { error: "Webhook receiver not configured (missing LIGHTFUNNELS_TENANT_ID)" },
                        { status: 503 },
                    );
                }

                const { error: queueErr } = await supabaseAdmin()
                    .from('checkout_queue')
                    .upsert(
                        {
                            checkout_id: checkoutId,
                            process_after: processAfter,
                            queued_at: new Date().toISOString(),
                            tenant_id: queueTenantId,
                        },
                        { onConflict: 'checkout_id', ignoreDuplicates: false }
                    );

                if (queueErr) {
                    // Surface the failure (HTTP 500) instead of returning 200 —
                    // a swallowed error here silently drops abandoned checkouts
                    // and lets LightFunnels think delivery succeeded.
                    console.error("[Webhook] Failed to queue checkout:", checkoutId, queueErr);
                    return NextResponse.json(
                        { success: false, error: "Failed to queue checkout" },
                        { status: 500 }
                    );
                }

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

        // 4. Resolve tenant. During the OLD→NEW parallel-run, every Lightfunnels
        // webhook is attributed to a single tenant (Scheniders Iraq) via env.
        // When multiple tenants get their own Lightfunnels accounts, switch to a
        // shop-id → tenant_id lookup (LightFunnels payload has a shop identifier).
        const tenantId = env.LIGHTFUNNELS_TENANT_ID;
        if (!tenantId) {
            console.error("[Webhook] LIGHTFUNNELS_TENANT_ID not configured");
            return NextResponse.json(
                { error: "Webhook receiver not configured (missing LIGHTFUNNELS_TENANT_ID)" },
                { status: 503 },
            );
        }

        // 5. Create order from webhook
        const result = await createOrderFromWebhook(webhookData, tenantId);

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

        // Notify registered staff about the new order. Isolated from the
        // customer flow: a failure here must not affect the webhook response.
        if (result.order) {
            try {
                const { sendNewOrderAlertToStaff } = await import("@/lib/staff-alerts");
                const tenantId = (result.order as { tenant_id?: string | null }).tenant_id ?? null;
                await sendNewOrderAlertToStaff(result.order, tenantId);
            } catch (alertErr) {
                console.error("[LightFunnels Webhook] Staff alert fanout failed:", alertErr);
            }
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
