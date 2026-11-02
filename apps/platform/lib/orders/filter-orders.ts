import type { Order, OrderFilters } from "@/types/order";
import { windowFromDateFilter, orderInDateWindow } from "@/lib/order-window";
import { orderMatchesAdChannel } from "@/lib/ad-channel-filter";
import { orderMatchesAdCampaign } from "@/lib/ad-campaign-filter";
import { ORDER_CHIP_PREDICATES, isOrderChipId, isReplacementOrder } from "./order-chips";
import { orderMatchesProduct } from "./product-match";
import { abandonedCartChip } from "./abandoned-cart";

/**
 * The `OrderFilters` fields `filterOrders` reads. Everything else on the filter
 * object (search, risk level, archive) is applied elsewhere or not at all.
 * Pinned by use-order-filters.count-invariant.test.tsx with a tracking Proxy, so
 * a count view built from these fields is exactly the list's filter.
 */
export const FILTER_FIELDS_READ = [
    "status", "orderType", "dateFrom", "dateTo", "city", "product", "priority", "paymentStatus", "adChannel", "adCampaign", "isReturn",
] as const satisfies readonly (keyof OrderFilters)[];

function needsReview(order: Order): boolean {
    if (order.notes && order.notes.includes("⚠️")) return true;
    // Empty items and not a manual order
    if ((!order.items || order.items.length === 0) && order.customer_name !== "Manual Order") return true;
    // Placeholder customer name
    return !!order.customer_name?.startsWith("Customer ") && order.customer_name !== "Customer";
}

/**
 * The orders list filter. The list, every status chip, the product and channel
 * tallies and the Needs Attention counts all run this over the same rows, so
 * each count is the length of the list its click opens.
 */
export function filterOrders(rows: readonly Order[], f: OrderFilters): Order[] {
    const status = f.status as string | undefined;
    const orderType = f.orderType;
    const dateWindow = windowFromDateFilter(f.dateFrom, f.dateTo);
    const { city, product, priority, paymentStatus, adChannel, adCampaign, isReturn } = f;

    return rows.filter((order) => {
        if (status && status !== "all") {
            if (status === "needs_review") {
                if (!needsReview(order)) return false;
            } else if (isOrderChipId(status)) {
                if (!ORDER_CHIP_PREDICATES[status](order)) return false;
            } else if (order.status !== status) {
                // Not a chip (e.g. a `?status=return_pending` drill-through link):
                // the exact status.
                return false;
            }
        }

        // Order-type sub-filter (refund / replacement / from a cart) — narrows the
        // Confirmed & All tabs to return or replacement orders.
        if (orderType === "refund") {
            if (!order.is_return) return false;
        } else if (orderType === "replacement") {
            if (!isReplacementOrder(order)) return false;
        } else if (orderType === "abandoned_cart") {
            // Orders that started as an abandoned cart and moved on: the ones
            // carrying the «من سلة متروكة» / «رجع وطلب» chip.
            if (!abandonedCartChip(order)) return false;
        }

        // Date range — the same rule the server fetch and realtime use
        // (lib/order-window): Baghdad calendar days, and an order scheduled for
        // a day in the range belongs to it as well as the day it arrived.
        if (dateWindow && !orderInDateWindow(order, dateWindow)) return false;

        if (city && order.city !== city) return false;
        if (product && !orderMatchesProduct(order, product)) return false;
        if (priority && order.priority !== priority) return false;
        if (paymentStatus && order.payment_status !== paymentStatus) return false;
        // Ad channel — "only what Instagram brought in".
        if (!orderMatchesAdChannel(order, adChannel)) return false;
        if (!orderMatchesAdCampaign(order, adCampaign)) return false;
        if (isReturn !== undefined && order.is_return !== isReturn) return false;

        // Free-text search is not a filter on the window: it replaces the
        // window with server matches (see useOrderFilters' `filteredOrders`).
        return true;
    });
}
