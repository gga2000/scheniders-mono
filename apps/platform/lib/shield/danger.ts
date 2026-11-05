import type { Order } from "@/types/order";
import { SHIELD_OPEN_STATUSES, trustBand, type ShieldBand } from "./trust";

/**
 * The orders page's danger slider (Ali, 2026-11-05): pick a Trust score and
 * the list keeps only the open orders at or under it, riskiest first. 100
 * means off (every order). `trustById` holds only the open orders under 80
 * (shield_risky_open_orders), so the slider stops at 80 below 100: an order
 * missing from it is 80+ or a new customer.
 */
export const DANGER_OFF = 100;
export const DANGER_TOP = 80;

/** Slider positions: 0-80 in steps of 5, then off. */
export function snapDanger(value: number): number {
    if (value > DANGER_TOP) return DANGER_OFF;
    return Math.max(0, Math.round(value / 5) * 5);
}

export function inDangerRange(
    order: Pick<Order, "id" | "status" | "is_return">,
    trustById: ReadonlyMap<string, number>,
    max: number,
): boolean {
    if (max >= DANGER_OFF) return true;
    if (!SHIELD_OPEN_STATUSES.has(order.status) || order.is_return) return false;
    const trust = trustById.get(order.id);
    return trust !== undefined && trust <= max;
}

/**
 * The danger section above the cards: every open order falls in one band.
 * High (red) is a Trust score under 50, medium (yellow) 50-79, low (green) 80
 * or more or a new customer. Orders that can no longer be stopped have none.
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
