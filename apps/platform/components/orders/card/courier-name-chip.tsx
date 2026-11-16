"use client";

import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { Order } from "@/types/order";

/** Statuses an order has once it left with a courier. */
const LEFT_WITH_COURIER: readonly Order["status"][] = ["in_transit", "delivered", "completed", "return_pending"];

/**
 * Fermi B4: «مع كويك» on an order that left in an export file for a courier,
 * named when the merchant moved it to In transit. Al-Waseet by API has its own
 * chip; a card shows this only after the order left, so an order moved back to
 * Confirmed does not still claim a courier.
 */
export function CourierNameChip({
    order,
    size = "card",
}: {
    order: Pick<Order, "courier_name" | "delivery_company" | "status">;
    size?: "card" | "mobile";
}) {
    const { t } = useLanguage();
    const courier = order.courier_name?.trim();
    if (!courier || order.delivery_company === "waseet" || !LEFT_WITH_COURIER.includes(order.status)) return null;
    return (
        <span
            data-testid="courier-name-chip"
            title={t("orders.card.withCourierTip", { courier })}
            className={cn(
                "inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 font-semibold text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-400/15 dark:text-indigo-200",
                size === "card" ? "h-6 px-2 text-[11px]" : "h-5 px-1.5 text-[9px] font-bold self-end",
            )}
        >
            <Truck className={size === "card" ? "h-3 w-3 flex-shrink-0" : "h-2.5 w-2.5"} />
            <span className="max-w-[140px] truncate">{t("orders.card.withCourier", { courier })}</span>
        </span>
    );
}
