import { z } from "zod";
import { trustBand, type ShieldBand } from "./trust";
import { trustStepSchema } from "./types";

/** One row of shield_risky_open_orders: an open order whose customer's Trust score is under 80. */
export const riskyOpenOrderSchema = z.object({
    id: z.string(),
    order_id: z.string(),
    customer_name: z.string().nullable(),
    status: z.string(),
    created_at: z.string(),
    trust: z.number().int(),
    worst_kind: trustStepSchema.shape.kind.nullable(),
    worst_src: trustStepSchema.shape.src.nullable(),
});
export type RiskyOpenOrder = z.infer<typeof riskyOpenOrderSchema>;

/** shield_impact for a period: flagged orders the store decided on, and how they ended. */
export const shieldImpactSchema = z.object({
    flagged_decided: z.coerce.number(),
    stopped: z.coerce.number(),
    stopped_value: z.coerce.number(),
    shipped: z.coerce.number(),
    shipped_delivered: z.coerce.number(),
    shipped_refused: z.coerce.number(),
});
export type ShieldImpact = z.infer<typeof shieldImpactSchema>;

/** Red under 50, yellow 50-79 (the list only holds scores under 80). */
export function riskyOrderBand(row: Pick<RiskyOpenOrder, "trust">): Exclude<ShieldBand, "green"> {
    return trustBand(row.trust) === "red" ? "red" : "yellow";
}

/** Share of the flagged orders that shipped anyway and came back refused, 0-100; null with none shipped. */
export function shippedRefusedRate(impact: ShieldImpact): number | null {
    const ended = impact.shipped_delivered + impact.shipped_refused;
    return ended > 0 ? Math.round((impact.shipped_refused / ended) * 100) : null;
}

/** shield_store_score: this store's finished/delivered orders and the other stores' average (null below 3 stores). */
export const storeScoreSchema = z.object({
    own_finished: z.coerce.number(),
    own_delivered: z.coerce.number(),
    network_rate: z.coerce.number().nullable(),
    network_stores: z.coerce.number().nullable(),
});
export type StoreScore = z.infer<typeof storeScoreSchema>;

/** This store's delivery rate, 0-100; null before 10 finished orders (too few to mean anything). */
export function ownDeliveryRate(score: StoreScore): number | null {
    return score.own_finished >= 10 ? Math.round((score.own_delivered / score.own_finished) * 100) : null;
}
