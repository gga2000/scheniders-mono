import { Client } from "@upstash/qstash";
import { providerBaseUrls } from "./env";

let qstashClient: Client | null = null;

function getQStashClient(): Client | null {
    if (!process.env.QSTASH_TOKEN) return null;
    if (!qstashClient) {
        qstashClient = new Client({
            token: process.env.QSTASH_TOKEN,
            baseUrl: providerBaseUrls.QSTASH_URL,
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
