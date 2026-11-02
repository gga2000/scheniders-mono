import type { Order } from "@/types/order";

/** Outcomes that settle an order: it was taken, or it never will be. */
const DELIVERED = new Set(["delivered", "completed"]);

export interface LeadQuality {
    /** Orders with a final outcome: the base of the percentages. */
    finished: number;
    delivered: number;
    noAnswer: number;
    rejected: number;
    /** Orders still on their way to an outcome, left out of the percentages. */
    inProgress: number;
    /** Share of finished orders, whole percent; null while nothing has finished. */
    deliveredPct: number | null;
    noAnswerPct: number | null;
    rejectedPct: number | null;
}

/**
 * Which leads actually take the parcel. Counts original orders only (returns and replacements are
 * other rows) and measures finished orders only, like the customer delivery rate; cancelled,
 * abandoned-checkout and new/contacted/confirmed/in-transit/suspended orders are not outcomes.
 */
export function leadQuality(orders: readonly Pick<Order, "status" | "is_return" | "is_replacement">[]): LeadQuality {
    let delivered = 0;
    let noAnswer = 0;
    let rejected = 0;
    let inProgress = 0;

    for (const order of orders) {
        if (order.is_return || order.is_replacement) continue;
        if (DELIVERED.has(order.status)) delivered++;
        else if (order.status === "no_response") noAnswer++;
        else if (order.status === "rejected") rejected++;
        else if (["new", "contacted", "confirmed", "in_transit", "suspended"].includes(order.status)) inProgress++;
    }

    const finished = delivered + noAnswer + rejected;
    const pct = (n: number) => (finished > 0 ? Math.round((n / finished) * 100) : null);
    return {
        finished, delivered, noAnswer, rejected, inProgress,
        deliveredPct: pct(delivered), noAnswerPct: pct(noAnswer), rejectedPct: pct(rejected),
    };
}
