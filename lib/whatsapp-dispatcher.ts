/**
 * whatsapp-dispatcher.ts
 *
 * This utility handles triggering an internal API call to dispatch an
 * immediate WhatsApp confirmation via Interakt without blocking the
 * main request thread (e.g. Server Actions or Webhooks).
 */

export function triggerImmediateConfirmation(orderId: string, phone?: string) {
    if (!orderId) return;

    // We do NOT await this. We intentionally let the Promise run in the background.
    // This ensures that the Create Order UI or the Lightfunnels webhook returns instantly.

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    // We are trusting the internal API route (`/api/webhooks/interakt/send`) to fetch
    // the order from Supabase by ID. By default, it expects the full order object in the body,
    // but we can query it inside the route or pass minimal data if adapted.

    console.log(`[WhatsApp Dispatcher] Firing background fetch for order ${orderId}...`);

    fetch(`${baseUrl}/api/webhooks/interakt/dispatch-event`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            orderId,
            templateType: 'confirmation',
            overridePhone: phone,
        }),
    }).catch(err => {
        // Just log the error, don't crash the main process.
        console.error(`[WhatsApp Dispatcher] Failed to trigger background fetch for order ${orderId}:`, err);
    });
}
