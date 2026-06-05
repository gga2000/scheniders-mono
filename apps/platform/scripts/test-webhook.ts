#!/usr/bin/env ts-node

/**
 * Test script for LightFunnels webhook
 * 
 * Usage: npx ts-node scripts/test-webhook.ts
 * 
 * This sends a test webhook payload to your local endpoint
 */

const WEBHOOK_URL = "http://localhost:3000/api/webhooks/lightfunnels";
const WEBHOOK_SECRET = "my_super_secret_webhook_token_12345"; // Match your .env.local

// Test payload matching LightFunnels format
const testPayload = {
    event: "order.created",
    order_id: "TEST" + Date.now(),
    customer: {
        name: "عميل تجريبي للاختبار",
        phone: "07701234567",
        email: "test@example.com",
        city: "بغداد",
        governorate: "BG",
        address: "الكرادة - شارع الاختبار - بناية رقم 1"
    },
    items: [
        {
            name: "Test Product - Dior Sauvage",
            quantity: 1,
            price: 75000
        },
        {
            name: "Test Product - Chanel No.5",
            quantity: 2,
            price: 60000
        }
    ],
    total: 195000,
    created_at: new Date().toISOString(),
    notes: "طلب اختبار من السكربت"
};

async function testWebhook() {
    console.log("🧪 Testing LightFunnels Webhook...\n");
    console.log("📡 Endpoint:", WEBHOOK_URL);
    console.log("📦 Payload:", JSON.stringify(testPayload, null, 2));
    console.log("\n⏳ Sending request...\n");

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-webhook-secret": WEBHOOK_SECRET,
            },
            body: JSON.stringify(testPayload),
        });

        const result = await response.json();

        console.log("📊 Response Status:", response.status);
        console.log("📄 Response Body:", JSON.stringify(result, null, 2));

        if (response.ok) {
            console.log("\n✅ SUCCESS! Order created from webhook");
            console.log("🆔 Order ID:", result.order_id);
            console.log("\n💡 Check your dashboard to see the new order!");
        } else {
            console.log("\n❌ FAILED!");
            console.log("Error:", result.error);
        }
    } catch (error) {
        console.error("\n💥 Request failed:", error);
        console.log("\n⚠️  Make sure:");
        console.log("   1. Server is running (pnpm dev)");
        console.log("   2. LIGHTFUNNELS_WEBHOOK_SECRET is set in .env.local");
        console.log("   3. Supabase is configured");
    }
}

// Test duplicate detection
async function testDuplicate() {
    console.log("\n\n🔄 Testing Duplicate Detection...\n");

    const duplicatePayload = {
        ...testPayload,
        order_id: "DUPLICATE_TEST", // Same ID every time
    };

    console.log("📦 Sending same order twice...\n");

    // First request
    const response1 = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": WEBHOOK_SECRET,
        },
        body: JSON.stringify(duplicatePayload),
    });

    const result1 = await response1.json();
    console.log("1️⃣  First request:", result1.success ? "✅ Created" : "❌ Failed");

    // Second request (should be duplicate)
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a second

    const response2 = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": WEBHOOK_SECRET,
        },
        body: JSON.stringify(duplicatePayload),
    });

    const result2 = await response2.json();
    console.log("2️⃣  Second request:", result2.duplicate ? "✅ Detected as duplicate" : "❌ Not detected");

    if (result2.duplicate) {
        console.log("\n✅ Duplicate detection working correctly!");
    } else {
        console.log("\n⚠️  Duplicate detection may have issues");
    }
}

// Run tests
async function runTests() {
    await testWebhook();

    // Uncomment to test duplicate detection
    // await testDuplicate();
}

runTests();
