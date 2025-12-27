import { NextRequest, NextResponse } from "next/server";
import {
    parseLightFunnelsPayload,
    createOrderFromWebhook,
    logWebhookRequest,
} from "@/lib/webhook-handler";

/**
 * LightFunnels Webhook Endpoint
 * 
 * This endpoint receives webhooks from LightFunnels when new orders are created.
 * 
 * URL: POST /api/webhooks/lightfunnels
 * 
 * Security: Requires LIGHTFUNNELS_WEBHOOK_SECRET in headers
 */

export async function POST(request: NextRequest) {
    try {
        // 1. Verify webhook secret for security (optional - Lightfunnels may not send one)
        const secret = request.headers.get("x-webhook-secret");
        const expectedSecret = process.env.LIGHTFUNNELS_WEBHOOK_SECRET;

        // Only validate secret if both are configured and provided
        if (expectedSecret && secret && secret !== expectedSecret) {
            console.error("Invalid webhook secret");
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        // 2. Parse request body
        const payload = await request.json();

        // 3. Validate payload structure
        const webhookData = parseLightFunnelsPayload(payload);
        if (!webhookData) {
            return NextResponse.json(
                { error: "Invalid payload format" },
                { status: 400 }
            );
        }

        // 4. Create order from webhook
        const result = await createOrderFromWebhook(webhookData);

        // 5. Log request (for debugging)
        if (process.env.WEBHOOK_LOGGING_ENABLED === "true") {
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

        // 7. Success response
        return NextResponse.json(
            {
                success: true,
                message: "Order created successfully",
                order_id: result.order?.order_id,
            },
            { status: 200 }
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
