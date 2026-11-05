"use client";

import { Hand } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { PRIME_ACTOR } from "@/lib/prime/actor";
import type { Order } from "@/types/order";

/**
 * On a delivered card: who marked it delivered — Prime by itself («برايم
 * تلقائي», when Prime reported the delivery) or one of us by hand («يدوي»).
 * Hidden for a tenant without a switched-on Prime link, where every
 * delivery is by hand.
 */
export function DeliveredByChip({ order }: { order: Pick<Order, "status" | "last_status_changed_by_name"> }) {
    const { t } = useLanguage();
    const { connected } = usePrimeConnection();
    if (!connected || order.status !== "delivered") return null;
    if (order.last_status_changed_by_name === PRIME_ACTOR) {
        return (
            <span
                data-delivered-by="prime"
                title={t("orders.card.deliveredBy.primeTip")}
                className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[#C9D6EE] bg-[#E8EEF8] px-2 text-[11px] font-bold text-[#1F3F75] dark:border-sky-400/30 dark:bg-sky-400/15 dark:text-sky-200"
            >
                <span aria-hidden="true" className="h-2 w-[26px] bg-current [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]" />
                {t("orders.card.deliveredBy.prime")}
            </span>
        );
    }
    return (
        <span
            data-delivered-by="manual"
            title={order.last_status_changed_by_name ? t("orders.card.deliveredBy.manualTip", { name: order.last_status_changed_by_name }) : undefined}
            className="inline-flex h-6 items-center gap-1 rounded-full border border-[#E7E5E4] bg-[#F5F3EF] px-2 text-[11px] font-bold text-[#4A4A4A] dark:border-white/10 dark:bg-white/5 dark:text-white/70"
        >
            <Hand className="h-3 w-3" aria-hidden="true" />
            {t("orders.card.deliveredBy.manual")}
        </span>
    );
}
