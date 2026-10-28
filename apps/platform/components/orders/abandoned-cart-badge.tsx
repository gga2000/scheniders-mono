"use client";

import { ShoppingCart, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { abandonedCartChip } from "@/lib/orders/abandoned-cart";
import type { Order } from "@/types/order";

/**
 * «من سلة متروكة» / «رجع وطلب» next to an order that started as an abandoned
 * cart. Outlined in the Abandoned stage's salmon (lib/order-pipeline.ts,
 * #F4B4A6) so it reads as "came from that column" without competing with the
 * status badge. Renders nothing for any other order.
 *
 * `withDetail` spells out when the cart was left and who took it, for places
 * a tap has to show it (the details modal); the card keeps it in the tooltip.
 */
export function AbandonedCartBadge({
    order,
    withDetail = false,
    className,
}: {
    order: Pick<Order, "status" | "abandoned_cart_at" | "abandoned_cart_outcome" | "abandoned_cart_resolved_by_name">;
    withDetail?: boolean;
    className?: string;
}) {
    const { t, language } = useLanguage();
    const chip = abandonedCartChip(order);
    if (!chip) return null;

    const date = new Intl.DateTimeFormat(language === "ar" ? "ar-IQ" : "en-GB", {
        timeZone: "Asia/Baghdad",
        dateStyle: "medium",
    }).format(new Date(chip.leftAt));
    const detail =
        chip.kind === "returned"
            ? t("orders.abandoned.returnedDetail", { date })
            : chip.by
              ? t("orders.abandoned.contactedDetailBy", { date, name: chip.by })
              : t("orders.abandoned.contactedDetail", { date });
    const Icon = chip.kind === "returned" ? Undo2 : ShoppingCart;

    return (
        <span
            data-abandoned-cart={chip.kind}
            title={detail}
            aria-label={detail}
            className={cn(
                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-bold whitespace-nowrap",
                "border-[#F4B4A6] text-[#B4533F] bg-transparent dark:border-[#F4B4A6]/50 dark:text-[#F4B4A6]",
                className,
            )}
        >
            <Icon className="w-2.5 h-2.5" aria-hidden />
            {t(chip.kind === "returned" ? "orders.abandoned.chipReturned" : "orders.abandoned.chipContacted")}
            {withDetail && <span className="font-medium opacity-80">· {detail}</span>}
        </span>
    );
}
