import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { consumeRateLimit } from "@/lib/rate-limit";
import type { WhatsAppCategory } from "@scheniders/shared/whatsapp-templates";

/**
 * Every WhatsApp message a shop sends through the platform's Interakt number is
 * paid from the shop's wallet, on every plan (Ali, 16 Nov); Fermi pays only the
 * free trial, up to plan_limits.trial_whatsapp_cap messages. The charge itself
 * is taken in the database when Interakt says the message was delivered; this
 * is the check before the send, so a shop that cannot pay, or a trial past its
 * free messages, is told "not sent" instead of messaging on our account. The
 * order still comes in either way.
 */
export const SHOP_WALLET_EMPTY = "Shop wallet cannot pay for WhatsApp";
export const SHOP_TRIAL_CAP_REACHED = "Store used all free trial WhatsApp messages";
export const SHOP_UNKNOWN = "No such store";

const SEND_CHECK_REFUSALS: Record<string, string> = {
    wallet_empty: SHOP_WALLET_EMPTY,
    trial_cap: SHOP_TRIAL_CAP_REACHED,
    unknown_shop: SHOP_UNKNOWN,
};

/**
 * Why this shop may not send one more message of this kind now, or null when
 * it may (whatsapp_send_check).
 */
export async function whatsappSendRefusal(tenantId: string, category: WhatsAppCategory): Promise<string | null> {
    const { data, error } = await createSupabaseServiceClient().rpc("whatsapp_send_check", {
        _tenant_id: tenantId,
        _marketing: category === "marketing",
    });
    if (error) throw error;
    if (data === "ok") return null;
    const refusal = typeof data === "string" ? SEND_CHECK_REFUSALS[data] : undefined;
    if (!refusal) throw new Error(`whatsapp_send_check answered ${JSON.stringify(data)}`);
    return refusal;
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
