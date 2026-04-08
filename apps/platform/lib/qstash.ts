import { Client } from "@upstash/qstash";

let qstashClient: Client | null = null;

function getQStashClient(): Client | null {
    if (!process.env.QSTASH_TOKEN) return null;
    if (!qstashClient) {
        qstashClient = new Client({
            token: process.env.QSTASH_TOKEN,
            baseUrl: "https://qstash-us-east-1.upstash.io"
        });
    }
    return qstashClient;
}

// =============================================
// FOLLOW-UP TIMING CONSTANTS
// =============================================
export const REMINDER_DELAY_HOURS = 6;
export const DISCOUNT_DELAY_HOURS = 10;

/**
 * Schedule a WhatsApp follow-up (reminder or discount) via QStash.
 *
 * Called after a successful template send. QStash will POST to
 * /api/cron/auto-follow-up after the specified delay.
 *
 * @param orderUuid - The order UUID to follow up on
 * @param templateType - Which follow-up to schedule ('reminder' or 'discount')
 * @param delaySec - Delay in seconds before the callback fires
 * @param baseUrl - The app's base URL
 */
export async function scheduleFollowUp(
    orderUuid: string,
    templateType: 'reminder' | 'discount',
    delaySec: number,
    baseUrl: string
): Promise<boolean> {
    const client = getQStashClient();
    if (!client) {
        console.warn("[QStash] No QSTASH_TOKEN configured, skipping follow-up schedule");
        return false;
    }

    try {
        await client.publishJSON({
            url: `${baseUrl}/api/cron/auto-follow-up`,
            delay: delaySec,
            retries: 2,
            body: {
                source: "qstash-whatsapp-followup",
                orderUuid,
                templateType,
            },
        });
        console.log(`[QStash] Scheduled ${templateType} follow-up for order ${orderUuid} in ${Math.round(delaySec / 3600)}h`);
        return true;
    } catch (error) {
        console.error("[QStash] Failed to schedule follow-up:", error);
        return false;
    }
}

/**
 * Schedule a delayed callback to process the checkout queue.
 *
 * QStash will POST to /api/cron/process-checkouts after `delaySec` seconds.
 * Multiple calls for the same checkout are safe — the checkout_queue UPSERT
 * keeps resetting process_after, so earlier callbacks find nothing ripe and no-op.
 */
export async function scheduleCheckoutProcessing(
    delaySec: number,
    baseUrl: string
): Promise<boolean> {
    const client = getQStashClient();
    if (!client) {
        console.warn("[QStash] No QSTASH_TOKEN configured, skipping scheduled callback");
        return false;
    }

    try {
        await client.publishJSON({
            url: `${baseUrl}/api/cron/process-checkouts`,
            delay: delaySec,
            retries: 3,
            body: { source: "qstash-delayed-checkout" },
        });
        console.log(`[QStash] Scheduled checkout processing in ${delaySec}s`);
        return true;
    } catch (error) {
        console.error("[QStash] Failed to schedule:", error);
        return false;
    }
}
