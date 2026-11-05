import type { Order } from "@/types/order";
import { SHIELD_OPEN_STATUSES, trustBand, type ShieldBand } from "./trust";

/**
 * The orders page's danger panel (Ali, 2026-11-05): every open order falls in
 * one band. High (red) is a Trust score under 50, medium (yellow) 50-79, low
 * (green) 80 or more or a new customer. `trustById` holds only the open orders
 * under 80 (shield_risky_open_orders), so an open order missing from it is low.
 * Orders that can no longer be stopped have no band.
 */
export type DangerBand = ShieldBand;

export const DANGER_BANDS: readonly DangerBand[] = ["red", "yellow", "green"];

export function dangerBandOf(
    order: Pick<Order, "id" | "status" | "is_return">,
    trustById: ReadonlyMap<string, number>,
): DangerBand | null {
    if (!SHIELD_OPEN_STATUSES.has(order.status) || order.is_return) return null;
    const trust = trustById.get(order.id);
    return trust === undefined ? "green" : trustBand(trust);
}

export function dangerCounts(
    orders: readonly Pick<Order, "id" | "status" | "is_return">[],
    trustById: ReadonlyMap<string, number>,
): Record<DangerBand, number> {
    const counts: Record<DangerBand, number> = { red: 0, yellow: 0, green: 0 };
    for (const o of orders) {
        const band = dangerBandOf(o, trustById);
        if (band) counts[band] += 1;
    }
    return counts;
}
