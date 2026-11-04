import { z } from "zod";
import type { ShieldBand } from "./delivery-chance";

/** One row of shield_risky_open_orders: an open order whose customer has a bad record. */
export const riskyOpenOrderSchema = z.object({
    id: z.string(),
    order_id: z.string(),
    customer_name: z.string().nullable(),
    status: z.string(),
    created_at: z.string(),
    own_tier: z.string().nullable(),
    network_band: z.enum(["red", "yellow", "green", "none"]),
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

/** Red when other stores say red or this store rates the customer risky/critical; otherwise yellow. */
export function riskyOrderBand(row: Pick<RiskyOpenOrder, "own_tier" | "network_band">): Exclude<ShieldBand, "green"> {
    if (row.network_band === "red" || row.own_tier === "critical" || row.own_tier === "risky") return "red";
    return "yellow";
}

/** The one reason shown on the row, as a shield.reason.* key. Other stores' red record wins. */
export function riskyOrderReason(row: Pick<RiskyOpenOrder, "own_tier" | "network_band">): string {
    if (row.network_band === "red") return "networkRed";
    if (row.own_tier === "critical" || row.own_tier === "risky") return "ownBad";
    if (row.network_band === "yellow") return "networkYellow";
    return "ownMixed";
}

/** Share of the flagged orders that shipped anyway and came back refused, 0-100; null with none shipped. */
export function shippedRefusedRate(impact: ShieldImpact): number | null {
    const ended = impact.shipped_delivered + impact.shipped_refused;
    return ended > 0 ? Math.round((impact.shipped_refused / ended) * 100) : null;
}
