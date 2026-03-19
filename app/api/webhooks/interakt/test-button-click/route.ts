import { NextRequest, NextResponse } from "next/server";

/**
 * Test endpoint to simulate a button click webhook from Interakt.
 *
 * Usage:
 * POST /api/webhooks/interakt/test-button-click
 * Body: {
 *   "orderUuid": "order-uuid-here",
 *   "phone": "9647XXXXXXXXX",
 *   "buttonText": "تأكيد" or "إلغاء"
 * }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { orderUuid, phone, buttonText } = body;

        if (!orderUuid || !phone || !buttonText) {
            return NextResponse.json(
                { error: "Missing required fields: orderUuid, phone, buttonText" },
                { status: 400 }
            );
        }

        // Construct a mock Interakt webhook payload that matches their actual format
        const mockPayload = {
            type: "message_api_clicked",
            data: {
                customer: {
                    phone_number: phone,
                    country_code: "964",
                },
                message: {
                    button_reply: {
                        id: buttonText === "تأكيد" ? "confirm" : "cancel",
                        title: buttonText,
                    },
                    context: {
                        callback_data: orderUuid,
                    },
                },
            },
        };

        console.log("[Test Button Click] Sending mock webhook:", JSON.stringify(mockPayload, null, 2));

        // Forward to the actual webhook handler
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ||
                       (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

        const response = await fetch(`${baseUrl}/api/webhooks/interakt`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Include webhook secret if configured
                ...(process.env.INTERAKT_WEBHOOK_SECRET && {
                    "x-webhook-secret": process.env.INTERAKT_WEBHOOK_SECRET,
                }),
            },
            body: JSON.stringify(mockPayload),
        });

        const result = await response.json();

        return NextResponse.json({
            success: response.ok,
            mockPayload,
            webhookResponse: result,
            statusCode: response.status,
        });
    } catch (error) {
        console.error("[Test Button Click] Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Internal server error",
            },
            { status: 500 }
        );
    }
}
