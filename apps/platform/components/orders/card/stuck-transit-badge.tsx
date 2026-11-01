"use client";

import { Hourglass } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useStuckInTransit } from "@/hooks/use-stuck-in-transit";
import { daysInTransit, STUCK_TRANSIT_DAYS } from "@/lib/orders/stuck-in-transit";
import type { Order } from "@/types/order";

/** "12 days in transit" on an order out with the courier 7+ days. */
export function StuckTransitBadge({ order }: { order: Pick<Order, "id" | "status"> }) {
    // Only in-transit cards subscribe to the stuck query.
    if (order.status !== "in_transit") return null;
    return <StuckTransitPill orderId={order.id} />;
}

function StuckTransitPill({ orderId }: { orderId: string }) {
    const { t } = useLanguage();
    const { since } = useStuckInTransit();
    const at = since.get(orderId);
    if (!at) return null;
    const days = daysInTransit(at);
    if (days < STUCK_TRANSIT_DAYS) return null;
    return (
        <span
            data-stuck-transit
            className="inline-flex h-6 items-center gap-1 px-2 text-[11px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-400/15 dark:text-amber-200 dark:border-amber-400/35"
            title={t("orders.filter.stuckTransitTip", { days: STUCK_TRANSIT_DAYS })}
        >
            <Hourglass className="w-3 h-3" aria-hidden="true" />
            {t("orders.card.inTransitDays", { days })}
        </span>
    );
}
