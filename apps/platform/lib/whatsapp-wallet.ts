import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { consumeRateLimit } from "@/lib/rate-limit";

/**
 * Every WhatsApp message a shop sends through the platform's Interakt number is
 * paid from the shop's wallet (Ali, 9 Nov). The charge itself is taken in the
 * database when the send is logged; this is the check before the send, so a
 * shop past its overdraft is told "not sent" instead of messaging for free.
 */
export const SHOP_WALLET_EMPTY = "Shop wallet cannot pay for WhatsApp";

export async function shopCanPayForWhatsApp(tenantId: string): Promise<boolean> {
    const { data, error } = await createSupabaseServiceClient().rpc("whatsapp_send_allowed", { _tenant_id: tenantId });
    if (error) throw error;
    return data === true;
}

/**
 * Every store shares the platform's one WhatsApp number, so one store sending
 * to numbers nobody asked for would lower Meta's rating of the number for all
 * of them. Each store therefore gets a hard daily number of customer
 * messages; a store still in its free trial (its messages cost it nothing)
 * gets far fewer.
 */
export const WHATSAPP_DAILY_CAP = 300;
export const WHATSAPP_DAILY_CAP_TRIAL = 30;
const DAY_SECONDS = 24 * 60 * 60;

const SENDING_STATUSES: ReadonlySet<string> = new Set(["active", "trial"]);

export const SHOP_DAILY_CAP_REACHED = "Store reached today's WhatsApp limit";

export function whatsappDailyCap(tenantStatus: string | null | undefined): number {
    return tenantStatus === "trial" ? WHATSAPP_DAILY_CAP_TRIAL : WHATSAPP_DAILY_CAP;
}

/**
 * Take one of today's sends for the store. False means do not send: the
 * store is not active or on trial, it used up today's number, or the counter
 * could not be read (a paid
 * message waits rather than going out uncounted).
 */
export async function takeDailySendSlot(tenantId: string): Promise<boolean> {
    const { data, error } = await createSupabaseServiceClient()
        .from("tenants")
        .select("status")
        .eq("id", tenantId)
        .maybeSingle();
    if (error) throw error;
    // Only a store in good standing sends: one we suspended, limited or that
    // cancelled must not reach customers from the shared number.
    if (!data || !SENDING_STATUSES.has(data.status)) return false;
    const limit = await consumeRateLimit(`wa-day:${tenantId}`, whatsappDailyCap(data.status), DAY_SECONDS);
    if (limit.error) {
        console.error(`[WhatsApp] daily counter unavailable for ${tenantId}: ${limit.error}`);
        return false;
    }
    return limit.allowed;
}
