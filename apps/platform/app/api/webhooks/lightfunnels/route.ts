import { NextRequest, NextResponse } from "next/server";
import {
    parseLightFunnelsPayload,
    parseCheckoutToWebhook,
    createOrderFromWebhook,
    logWebhookRequest,
} from "@/lib/webhook-handler";
import { fetchCheckoutById, getSavedAccessToken } from "@/lib/lightfunnels-api";

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

            // Handle minimal checkout payload - fetch full data from API
            if (error instanceof Error && error.message.startsWith("fetch_checkout:")) {
                const checkoutId = error.message.replace("fetch_checkout:", "");
                console.log("Fetching checkout from API:", checkoutId);

                // Get saved access token
                const accessToken = await getSavedAccessToken();
                if (!accessToken) {
                    console.error("No Lightfunnels access token configured");
                    return NextResponse.json(
                        { success: true, message: "Checkout received but no API token to fetch details" },
                        { status: 200 }
                    );
                }

                // Fetch full checkout data from API
                const checkout = await fetchCheckoutById(checkoutId, accessToken);
                if (!checkout) {
                    console.error("Could not fetch checkout from API:", checkoutId);
                    return NextResponse.json(
                        { success: true, message: "Checkout received but could not fetch details" },
                        { status: 200 }
                    );
                }

                // Parse checkout into webhook format
                webhookData = parseCheckoutToWebhook(checkout);
                if (!webhookData) {
                    console.error("Could not parse checkout data:", checkoutId);
                    return NextResponse.json(
                        { success: true, message: "Checkout received but could not parse details" },
                        { status: 200 }
                    );
                }

                console.log("Successfully fetched and parsed checkout:", checkoutId);
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
