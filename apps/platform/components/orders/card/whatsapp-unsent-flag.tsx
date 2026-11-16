import { AlertTriangle, MessageCircle } from "lucide-react";
import { canConfirmByHand, whatsappUnsentReason } from "@/lib/orders/whatsapp-unsent";
import type { Order } from "@/types/order";

interface WhatsAppUnsentFlagProps {
    order: Pick<Order, "needs_attention" | "attention_reasons" | "delivery_note" | "status">;
    t: (key: string) => string;
    onConfirmByHand: () => void;
}

/**
 * Why the order's automatic WhatsApp did not go out, and, while the order
 * still waits for the customer, «أكّد يدوياً»: the confirmation from the
 * merchant's own WhatsApp (Fermi B2). The order itself always came in.
 */
export function WhatsAppUnsentFlag({ order, t, onConfirmByHand }: WhatsAppUnsentFlagProps) {
    const reason = order.needs_attention ? whatsappUnsentReason(order.attention_reasons) : null;
    if (!reason) return null;
    const label = reason === "whatsapp_send_failed" ? t("orders.card.attn.whatsappFailed") : t(`orders.card.attn.${reason}`);

    return (
        <>
            <span
                className="inline-flex h-7 items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-bold bg-red-100 text-red-700 animate-pulse border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20"
                title={order.delivery_note || t("orders.card.attn.whatsappSendFailed")}
                data-testid="whatsapp-unsent"
            >
                <AlertTriangle className="w-3.5 h-3.5" />
                {label}
            </span>
            {canConfirmByHand(reason, order.status) && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onConfirmByHand();
                    }}
                    title={t("orders.card.confirmByHandTip")}
                    aria-label={t("orders.card.confirmByHandTip")}
                    className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                    data-testid="whatsapp-confirm-by-hand"
                >
                    <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    {t("orders.card.confirmByHand")}
                </button>
            )}
        </>
    );
}
