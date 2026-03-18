import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

/**
 * GET /api/debug/test-webhook
 *
 * Send a test webhook to your own endpoint to verify it's working
 */
export async function GET() {
    const siteUrl = env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;

    if (!siteUrl) {
        return NextResponse.json({
            error: 'NEXT_PUBLIC_SITE_URL not set - cannot test webhook',
        }, { status: 400 });
    }

    const webhookUrl = siteUrl.startsWith('http')
        ? `${siteUrl}/api/webhooks/lightfunnels`
        : `https://${siteUrl}/api/webhooks/lightfunnels`;

    // Sample completed order payload (mimics Lightfunnels webhook)
    const testOrderPayload = {
        node: {
            id: "order_TEST_" + Date.now(),
            __typename: "Order",
            _id: Math.floor(Math.random() * 1000000),
            total: 50000,
            subtotal: 50000,
            name: "TEST-" + Date.now(),
            notes: "Test order from diagnostic endpoint",
            email: "test@example.com",
            phone: "07701234567",
            created_at: new Date().toISOString(),
            tags: ["test"],
            shipping: 0,
            currency: "IQD",
            customer: {
                id: "customer_test",
                full_name: "أحمد محمد (Test)",
                avatar: null,
                location: "Baghdad",
            },
            items: [
                {
                    __typename: "VariantSnapshot",
                    product_id: "prod_test",
                    id: "item_test_1",
                    _id: 1001,
                    image: { path: "https://via.placeholder.com/150" },
                    title: "Test Product",
                    price: 50000,
                    variant_id: "var_test_1",
                    fulfillment_status: "unfulfilled",
                    sku: "TEST-SKU-001",
                }
            ],
            shipping_address: {
                first_name: "أحمد",
                last_name: "محمد",
                email: "test@example.com",
                phone: "07701234567",
                line1: "شارع الكرادة",
                line2: "مقابل السوق",
                country: "Iraq",
                city: "بغداد",
                area: "الكرادة",
                zip: null,
                state: null,
            },
            billing_address: {
                first_name: "أحمد",
                last_name: "محمد",
                phone: "07701234567",
                city: "بغداد",
                country: "Iraq",
            },
            payments: [
                {
                    id: "payment_test",
                    total: 50000,
                    source: {
                        payment_gateway: {
                            prototype: {
                                key: "cod",
                            },
                        },
                    },
                }
            ],
        }
    };

    try {
        console.log('[Test] Sending test webhook to:', webhookUrl);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(env.LIGHTFUNNELS_WEBHOOK_SECRET && {
                    'x-webhook-secret': env.LIGHTFUNNELS_WEBHOOK_SECRET,
                }),
            },
            body: JSON.stringify(testOrderPayload),
        });

        const responseData = await response.json();

        return NextResponse.json({
            success: response.ok,
            status: response.status,
            response: responseData,
            message: response.ok
                ? '✅ Test webhook processed successfully! Check your orders page.'
                : '❌ Webhook failed - see response for details',
            testPayload: testOrderPayload,
        });

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: '❌ Failed to send test webhook',
        }, { status: 500 });
    }
}

/**
 * POST /api/debug/test-webhook
 *
 * Test with custom payload
 */
export async function POST(request: Request) {
    const siteUrl = env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL;

    if (!siteUrl) {
        return NextResponse.json({
            error: 'NEXT_PUBLIC_SITE_URL not set',
        }, { status: 400 });
    }

    const webhookUrl = siteUrl.startsWith('http')
        ? `${siteUrl}/api/webhooks/lightfunnels`
        : `https://${siteUrl}/api/webhooks/lightfunnels`;

    try {
        const customPayload = await request.json();

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(env.LIGHTFUNNELS_WEBHOOK_SECRET && {
                    'x-webhook-secret': env.LIGHTFUNNELS_WEBHOOK_SECRET,
                }),
            },
            body: JSON.stringify(customPayload),
        });

        const responseData = await response.json();

        return NextResponse.json({
            success: response.ok,
            status: response.status,
            response: responseData,
        });

    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
