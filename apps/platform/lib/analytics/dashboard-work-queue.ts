import { z } from "zod";

/**
 * The dashboard's work-queue counters (stats grid, mobile cards): how many orders
 * wait in each actionable status right now, across the whole book.
 *
 * They were counted from the orders list (ORD-2), which is a window, so "12
 * rejected" could mean 12 of 546. They now come from `get_orders_aggregates`, the
 * same server count the /orders status chips show — so a card and the chip it
 * links to always agree. `confirmed` there includes `return_pending`, exactly as
 * the Confirmed chip does.
 *
 * Parsed rather than read with `?? 0`: a missing key is contract drift, and a
 * silent 0 on a work queue reads as "nothing to do".
 */
const statusCountsSchema = z.object({
    new: z.number(),
    contacted: z.number(),
    confirmed: z.number(),
    rejected: z.number(),
});

export interface WorkQueueCounts {
    newOrders: number;
    contactedOrders: number;
    confirmedOrders: number;
    rejectedOrders: number;
}

export function workQueueFromStatusCounts(statusCounts: unknown): WorkQueueCounts {
    const c = statusCountsSchema.parse(statusCounts);
    return {
        newOrders: c.new,
        contactedOrders: c.contacted,
        confirmedOrders: c.confirmed,
        rejectedOrders: c.rejected,
    };
}
