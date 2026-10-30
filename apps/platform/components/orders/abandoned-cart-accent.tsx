import { cn } from "@/lib/utils";
import { abandonedCartChip } from "@/lib/orders/abandoned-cart";
import type { Order } from "@/types/order";

/**
 * Paints half of an order's status stripe in the Abandoned stage's salmon
 * (#F4B4A6, lib/order-pipeline.ts) when the order came from an abandoned
 * cart, so the card reads "abandoned cart + its current status" at a glance.
 * Vertical stripes get the top half, horizontal bars the leading half; the
 * status colour stays on the other half. The parent stripe must be
 * `relative overflow-hidden`. Renders nothing for any other order.
 */
export function AbandonedCartAccent({
    order,
    orientation,
}: {
    order: Pick<Order, "status" | "abandoned_cart_at" | "abandoned_cart_outcome" | "abandoned_cart_resolved_by_name">;
    orientation: "vertical" | "horizontal";
}) {
    if (!abandonedCartChip(order)) return null;
    return (
        <span
            aria-hidden
            data-abandoned-cart-accent
            className={cn(
                "pointer-events-none absolute bg-[#F4B4A6]",
                orientation === "vertical" ? "inset-x-0 top-0 h-1/2" : "inset-y-0 start-0 w-1/2",
            )}
        />
    );
}
