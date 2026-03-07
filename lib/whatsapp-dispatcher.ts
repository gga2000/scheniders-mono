/**
 * whatsapp-dispatcher.ts
 *
 * This utility handles triggering an internal API call to dispatch an
 * immediate WhatsApp confirmation via Interakt without blocking the
 * main request thread (e.g. Server Actions or Webhooks).
 */

export async function triggerImmediateConfirmation(orderId: string, phone?: string) {
    if (!orderId) return;

    // We must await this fetch. On serverless platforms like Vercel, floating promises 
    // are often killed instantly when the main request returns. Awaiting ensures it fires.
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    console.log(`[WhatsApp Dispatcher] Firing background fetch for order ${orderId}...`);

    try {
        await fetch(`${baseUrl}/api/webhooks/interakt/dispatch-event`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                orderId,
                templateType: 'confirmation',
                overridePhone: phone,
            }),
        });
    } catch (err) {
        // Just log the error, don't crash the main process.
        console.error(`[WhatsApp Dispatcher] Failed to trigger background fetch for order ${orderId}:`, err);
    }
}
