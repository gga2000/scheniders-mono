/**
 * Orders whose automatic WhatsApp did not go out (handoff B2). The send path
 * stamps a reason on `orders.attention_reasons` (lib/whatsapp-error-handler);
 * the order still came in, and the card offers to confirm it by hand from the
 * merchant's own WhatsApp.
 */

/** Every reason the send path writes, the one to show first leading. */
export const WHATSAPP_UNSENT_REASONS = [
    "whatsapp_trial_cap",
    "whatsapp_shop_wallet_empty",
    "whatsapp_wallet_empty",
    "whatsapp_invalid_number",
    "whatsapp_rate_limited",
    "whatsapp_network_error",
    "whatsapp_config_error",
    "whatsapp_send_failed",
] as const;

export type WhatsAppUnsentReason = (typeof WHATSAPP_UNSENT_REASONS)[number];

/** Still waiting for the customer's yes: the only orders a manual confirmation helps. */
export const WHATSAPP_UNSENT_STATUSES = ["new", "contacted"] as const;

/** The «واتساب ما انرسل» chip looks back this far. */
export const WHATSAPP_UNSENT_DAYS = 30;

export function whatsappUnsentSince(now: Date = new Date()): string {
    return new Date(now.getTime() - WHATSAPP_UNSENT_DAYS * 86_400_000).toISOString();
}

/** Why the order's WhatsApp did not go out, or null when nothing failed. */
export function whatsappUnsentReason(reasons: readonly string[] | null | undefined): WhatsAppUnsentReason | null {
    if (!reasons) return null;
    const found = WHATSAPP_UNSENT_REASONS.find((r) => reasons.includes(r));
    if (found) return found;
    return reasons.some((r) => r.startsWith("whatsapp_")) ? "whatsapp_send_failed" : null;
}

/**
 * Whether the card offers «أكّد يدوياً»: the order still waits for the
 * customer, and the number can take a WhatsApp at all.
 */
export function canConfirmByHand(reason: WhatsAppUnsentReason | null, status: string | null | undefined): boolean {
    if (!reason || reason === "whatsapp_invalid_number") return false;
    return (WHATSAPP_UNSENT_STATUSES as readonly string[]).includes(status ?? "");
}

/** What the merchant sends from their own WhatsApp, in the customer's language. */
export function manualConfirmMessage(order: { customer_name: string | null; order_id: string }): string {
    const name = order.customer_name?.trim();
    return `${name ? `مرحباً ${name}` : "مرحباً"}، وصلنا طلبك رقم ${order.order_id}. تأكّد الطلب؟ ردّ بكلمة «نعم» حتى نجهزه ونشحنه.`;
}
