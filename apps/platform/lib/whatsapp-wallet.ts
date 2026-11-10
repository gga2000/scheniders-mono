import { createSupabaseServiceClient } from "@/lib/supabase-server";

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
